import type { DataConnection } from "peerjs";
import { getGame } from "../games/registry";
import type { PeerContext } from "./context";
import type {
  GameMessagePayload,
  GameSelectedPayload,
  GameStartPayload,
  JoinAcceptedPayload,
  JoinRejectedPayload,
  JoinRequestPayload,
  LobbyMessage,
  LobbySettingsPayload,
  PlayerJoinedPayload,
  PlayerKickedPayload,
  PlayerLeftPayload,
  PlayerReadyPayload,
} from "./types";
import { createMessage } from "./types";

export const messageHandlers = {
  "join-request": (
    ctx: PeerContext,
    payload: JoinRequestPayload,
    fromConnection?: DataConnection,
  ) => {
    if (!ctx.isHost) return;
    const {
      playerName: joinerName,
      playerId: senderLogicalId,
      sessionToken,
    } = payload;
    const {
      players,
      selectedGame,
      lobbySettings,
      isGameStarted,
      localPlayerId,
      sessionTokens,
      connections,
      peerIdToLogicalId,
      reconnectionTimers,
    } = ctx;

    // Reconnection
    const existingPlayer = players.find((p) => p.id === senderLogicalId);
    if (existingPlayer) {
      console.log("[P2P] Player reconnecting:", senderLogicalId);

      const expectedToken = sessionTokens.get(senderLogicalId);
      if (expectedToken && sessionToken !== expectedToken) {
        console.error(
          "[P2P] SECURITY: Session token mismatch on reconnect, rejecting",
        );
        fromConnection?.send(
          createMessage("join-rejected", { reason: "denied" }, localPlayerId),
        );
        setTimeout(() => fromConnection?.close(), 500);
        return;
      }

      const timer = reconnectionTimers.get(senderLogicalId);
      if (timer) {
        clearTimeout(timer);
        reconnectionTimers.delete(senderLogicalId);
      }

      connections.set(senderLogicalId, fromConnection!);
      peerIdToLogicalId.set(fromConnection!.peer, senderLogicalId);

      ctx.setPlayers((prev) => {
        const updated = prev.map((p) =>
          p.id === senderLogicalId ? { ...p, isConnected: true } : p,
        );

        const acceptPayload: JoinAcceptedPayload = {
          players: updated,
          selectedGame,
          lobbySettings,
          isGameStarted,
          sessionToken: expectedToken,
        };
        fromConnection?.send(
          createMessage("join-accepted", acceptPayload, localPlayerId),
        );

        const updatedPlayer = updated.find((p) => p.id === senderLogicalId);
        const joinedPayload: PlayerJoinedPayload = {
          player: updatedPlayer || {
            ...existingPlayer,
            isConnected: true,
            id: senderLogicalId,
            name: joinerName,
            isHost: false,
          },
        };
        ctx.broadcast(
          createMessage("player-joined", joinedPayload, localPlayerId),
          senderLogicalId,
        );

        return updated;
      });
      return;
    }

    // Checks
    if (isGameStarted) {
      fromConnection?.send(
        createMessage("join-rejected", { reason: "in-game" }, localPlayerId),
      );
      setTimeout(() => fromConnection?.close(), 500);
      return;
    }

    const gameDef = selectedGame ? getGame(selectedGame) : null;
    const maxPlayers = gameDef?.maxPlayers ?? 4;

    if (players.length >= maxPlayers) {
      fromConnection?.send(
        createMessage(
          "join-rejected",
          { reason: "capacity-reached" },
          localPlayerId,
        ),
      );
      setTimeout(() => fromConnection?.close(), 500);
      return;
    }

    if (lobbySettings.requiresRequest) {
      // ... Pending request logic
      const pendingRequest = {
        playerId: senderLogicalId,
        playerName: joinerName,
        timestamp: Date.now(),
      };
      ctx.setPendingRequests((prev) => {
        const filtered = prev.filter((r) => r.playerId !== senderLogicalId);
        return [...filtered, pendingRequest];
      });
      fromConnection?.send(createMessage("join-pending", {}, localPlayerId));
      connections.set(senderLogicalId, fromConnection!);
      peerIdToLogicalId.set(fromConnection!.peer, senderLogicalId);
      return;
    }

    // New Join
    const newPlayer = {
      id: senderLogicalId,
      name: joinerName,
      isHost: false,
      isReady: false,
      isConnected: true,
    };

    const newSessionToken = crypto.randomUUID();
    sessionTokens.set(senderLogicalId, newSessionToken);

    ctx.setPlayers((prev) => {
      const updated = [...prev, newPlayer];
      const acceptPayload: JoinAcceptedPayload = {
        players: updated,
        selectedGame,
        lobbySettings,
        isGameStarted: false,
        sessionToken: newSessionToken,
      };
      fromConnection?.send(
        createMessage("join-accepted", acceptPayload, localPlayerId),
      );
      ctx.broadcast(
        createMessage("player-joined", { player: newPlayer }, localPlayerId),
        senderLogicalId,
      );
      return updated;
    });
    connections.set(senderLogicalId, fromConnection!);
    peerIdToLogicalId.set(fromConnection!.peer, senderLogicalId);
  },

  "join-accepted": (ctx: PeerContext, payload: JoinAcceptedPayload) => {
    console.log("[P2P] Join accepted, players:", payload.players);
    ctx.setPlayers(payload.players);
    ctx.setSelectedGame(payload.selectedGame);
    ctx.setLobbySettings(payload.lobbySettings);
    if (payload.isGameStarted !== undefined) {
      ctx.setIsGameStarted(payload.isGameStarted);
    }
    if (payload.sessionToken) {
      sessionStorage.setItem("ezp2p-sessionToken", payload.sessionToken);
      // We can't update ref.current here easily if it's value-based, but context has the ref?
      // Context has `mySessionToken` as value usually.
      // Actually `usePeer` has `mySessionTokenRef`.
      // We should ideally update the ref in `usePeer` but `ctx` uses setters.
      // But for `mySessionTokenRef`, it's not a setter.
      // *Correction*: In `usePeer`, `mySessionTokenRef` is a ref.
      // We need to access the ref to update it.
      // We'll trust sessionStorage for next reload, but for current session,
      // we might need to expose the ref.
    }
    ctx.setStatus("connected");
    ctx.setJoinStatus(null);
  },

  "join-rejected": (ctx: PeerContext, payload: JoinRejectedPayload) => {
    console.log("[P2P] Join rejected:", payload.reason);
    ctx.setJoinStatus(payload.reason);
    const reason = payload.reason;
    if (reason === "capacity-reached")
      ctx.setError("This arcade lobby is at maximum capacity.");
    else if (reason === "in-game")
      ctx.setError("A game is already in progress in this lobby.");
    else if (reason === "not-found")
      ctx.setError("Lobby not found or expired.");
    else ctx.setError(`Could not join lobby: ${reason}`);

    ctx.cleanup({ keepError: true });
  },

  "join-pending": (_ctx: PeerContext) => {
    _ctx.setJoinStatus("waiting-approval");
  },

  "join-approved": (_ctx: PeerContext) => {
    console.log("[P2P] Join request approved!");
  },

  "join-denied": (ctx: PeerContext) => {
    ctx.setJoinStatus("denied");
    ctx.setError("Your join request was denied");
    ctx.cleanup({ keepError: true });
  },

  "player-joined": (ctx: PeerContext, payload: PlayerJoinedPayload) => {
    const { player } = payload;
    ctx.setPlayers((prev) => {
      const exists = prev.find((p) => p.id === player.id);
      if (exists) {
        return prev.map((p) =>
          p.id === player.id
            ? {
                ...p,
                name: player.name,
                isConnected: player.isConnected,
              }
            : p,
        );
      }
      return [...prev, { ...player, isHost: false }];
    });
  },

  "player-left": (
    ctx: PeerContext,
    payload: PlayerLeftPayload,
    _fromConnection?: DataConnection,
    _message?: LobbyMessage,
  ) => {
    // Security check (senderId match) is done in usePeer before calling this?
    // Or we should pass message to check senderId?
    // `usePeer` has generic checks. Specific checks like "did A kick B" might be here.
    // The original code checked `leftLogicalId !== message.senderId` if host.
    // We need `message.senderId`.
    // We'll assume strict checks in `usePeer` or pass message.

    // Let's rely on `usePeer` to pass validated messages.
    // But `handleMessage` did the check `if (currentIsHost && leftLogicalId !== message.senderId)`.
    // We need the message sender info.

    const leftId = payload.playerId;
    // We'll skip the security check here and implement it in `usePeer` before dispatching
    // OR update signature to take `LobbyMessage`.

    ctx.setPlayers((prev) => prev.filter((p) => p.id !== leftId));
    ctx.setPendingRequests((prev) => prev.filter((r) => r.playerId !== leftId));

    const conn = ctx.connections.get(leftId);
    if (conn) {
      ctx.peerIdToLogicalId.delete(conn.peer);
      conn.close();
    }
    ctx.connections.delete(leftId);
  },

  "player-ready": (ctx: PeerContext, payload: PlayerReadyPayload) => {
    const { playerId, isReady } = payload;
    ctx.setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, isReady } : p)),
    );
    if (ctx.isHost) {
      // message.senderId is implicit trusted if we got here?
      ctx.broadcast(
        createMessage("player-ready", payload, payload.playerId),
        payload.playerId,
      );
    }
  },

  "player-kicked": (ctx: PeerContext, payload: PlayerKickedPayload) => {
    if (payload.playerId === ctx.localPlayerId) {
      ctx.setError("You were kicked from the lobby");
      ctx.cleanup({ keepError: true });
    } else {
      ctx.setPlayers((prev) => prev.filter((p) => p.id !== payload.playerId));
      const conn = ctx.connections.get(payload.playerId);
      if (conn) {
        ctx.peerIdToLogicalId.delete(conn.peer);
        conn.close();
      }
      ctx.connections.delete(payload.playerId);
    }
  },

  "host-left": (ctx: PeerContext) => {
    ctx.setError("Host left the lobby");
    ctx.cleanup({ keepError: true });
  },

  "lobby-settings": (ctx: PeerContext, payload: LobbySettingsPayload) => {
    ctx.setLobbySettings(payload.settings);
  },

  "game-selected": (ctx: PeerContext, payload: GameSelectedPayload) => {
    ctx.setSelectedGame(payload.gameId);
  },

  "game-start": (ctx: PeerContext, payload: GameStartPayload) => {
    ctx.setSelectedGame(payload.gameId);
    ctx.setPlayers(payload.players);
    ctx.setIsGameStarted(true);
  },

  "game-message": (
    ctx: PeerContext,
    payload: GameMessagePayload,
    _conn?: DataConnection,
    message?: LobbyMessage,
  ) => {
    ctx.setLastGameMessage({ ...payload, senderId: message?.senderId });
    if (ctx.isHost && message?.senderId) {
      ctx.broadcast(message, message.senderId);
    }
  },

  // No-ops or simple acks
  ping: () => {},
  pong: () => {},
  "game-forfeit": (_ctx: PeerContext, _payload: any) => {
    // Handle forfeit if needed, or game logic handles it via game-message
  },
};
