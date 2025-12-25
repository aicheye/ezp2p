import Peer, { type DataConnection } from "peerjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { getGame } from "../games/registry";
import type { PeerContext } from "./context";
import { useLatest } from "./hooks";
import { generateLobbyCode } from "./lobbyCode";
import { messageHandlers } from "./messageHandlers";
import type {
  GameMessagePayload,
  GameSelectedPayload,
  GameStartPayload,
  JoinAcceptedPayload,
  JoinRejectReason,
  JoinRequestPayload,
  LobbyMessage,
  LobbySettings,
  LobbySettingsPayload,
  PendingJoinRequest,
  PlayerInfo,
  PlayerJoinedPayload,
  PlayerKickedPayload,
  PlayerLeftPayload,
  PlayerReadyPayload,
} from "./types";
import { createMessage, validateMessage } from "./types";

const timeoutMs = 5000;

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface UsePeerOptions {
  playerName: string;
  playerId: string;
}

export interface UsePeerReturn {
  // Connection state
  status: ConnectionStatus;
  error: string | null;
  lobbyCode: string | null;
  isHost: boolean;
  joinStatus: JoinRejectReason | "connecting" | "waiting-approval" | null;

  // Players
  players: PlayerInfo[];
  localPlayerId: string | null;

  // Lobby settings
  lobbySettings: LobbySettings;
  pendingRequests: PendingJoinRequest[];

  // Game state
  selectedGame: string | null;
  isGameStarted: boolean;
  lastGameMessage: GameMessagePayload | null;

  // Actions
  createLobby: (existingCode?: string) => void;
  joinLobby: (code: string) => void;
  leaveLobby: () => void;
  selectGame: (gameId: string) => void;
  startGame: () => void;
  resetGame: () => void;
  sendGameMessage: (type: string, data: unknown) => void;
  toggleReady: () => void;
  kickPlayer: (playerId: string) => void;
  toggleRequiresRequest: () => void;
  updateGameSetting: (gameId: string, key: string, value: any) => void;
  approveJoinRequest: (playerId: string) => void;
  denyJoinRequest: (playerId: string) => void;
  clearError: () => void;
}

/**
 * Main hook for P2P networking with PeerJS.
 * Handles lobby creation, joining, and game messaging.
 */
export function usePeer({
  playerName,
  playerId: logicalPlayerId,
}: UsePeerOptions): UsePeerReturn {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [lobbyCode, setLobbyCode] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [lastGameMessage, setLastGameMessage] =
    useState<GameMessagePayload | null>(null);
  const [lobbySettings, setLobbySettings] = useState<LobbySettings>({
    requiresRequest: true,
    gameSettings: {},
  });
  const [pendingRequests, setPendingRequests] = useState<PendingJoinRequest[]>(
    [],
  );
  const [joinStatus, setJoinStatus] = useState<
    JoinRejectReason | "connecting" | "waiting-approval" | null
  >(null);

  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map()); // logicalId -> DataConnection
  const peerIdToLogicalIdRef = useRef<Map<string, string>>(new Map()); // PeerJS ID -> Logical ID
  const hostConnectionRef = useRef<DataConnection | null>(null);
  const reconnectionTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const hostReconnectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const joinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SECURITY: Rate limiting - track message counts per peer
  const rateLimitRef = useRef<Map<string, { count: number; resetAt: number }>>(
    new Map(),
  );
  const MAX_MESSAGES_PER_SECOND = 30;

  // SECURITY: Session tokens for reconnection verification
  // Host: stores playerId -> sessionToken mapping
  // Guest: stores their own token received on join
  const sessionTokensRef = useRef<Map<string, string>>(new Map());
  const mySessionTokenRef = useRef<string | null>(
    sessionStorage.getItem("ezp2p-sessionToken"),
  );

  // Use refs to avoid stale closures in callbacks
  const isHostRef = useLatest(isHost);
  const logicalPlayerIdRef = useLatest(logicalPlayerId);
  const selectedGameRef = useLatest(selectedGame);
  const playersRef = useLatest(players);
  const isGameStartedRef = useLatest(isGameStarted);
  const lobbySettingsRef = useLatest(lobbySettings);
  const errorRef = useLatest(error);
  const joinStatusRef = useLatest(joinStatus);

  useEffect(() => {
    joinStatusRef.current = joinStatus;
  }, [joinStatus]);

  // Clear join timer when we succeed or fail (leave connecting state)
  useEffect(() => {
    if (status !== "connecting" && joinTimerRef.current) {
      clearTimeout(joinTimerRef.current);
      joinTimerRef.current = null;
    }
  }, [status]);

  // Cleanup function
  const cleanup = useCallback(
    (options: { keepError?: boolean; keepState?: boolean } = {}) => {
      connectionsRef.current.forEach((conn) => conn.close());
      connectionsRef.current.clear();
      peerIdToLogicalIdRef.current.clear();
      hostConnectionRef.current?.close();
      hostConnectionRef.current = null;
      peerRef.current?.destroy();
      peerRef.current = null;

      // Clear all reconnection timers
      reconnectionTimersRef.current.forEach((timer) => clearTimeout(timer));
      reconnectionTimersRef.current.clear();
      if (hostReconnectionTimerRef.current) {
        clearTimeout(hostReconnectionTimerRef.current);
        hostReconnectionTimerRef.current = null;
      }
      if (joinTimerRef.current) {
        clearTimeout(joinTimerRef.current);
        joinTimerRef.current = null;
      }

      if (!options.keepState) {
        setStatus("disconnected");
        setLobbyCode(null);
        setIsHost(false);
        setPlayers([]);
        setSelectedGame(null);
        setIsGameStarted(false);
        setLastGameMessage(null);
        setLobbySettings({
          requiresRequest: true,
          gameSettings: {},
        });
        setPendingRequests([]);
        setJoinStatus(null);
      }

      if (!options.keepError) {
        setError(null);
      }
    },
    [],
  );

  // Broadcast message to all connected peers (host only)
  const broadcast = useCallback((message: LobbyMessage, excludeId?: string) => {
    connectionsRef.current.forEach((conn, peerId) => {
      if (peerId !== excludeId && conn.open) {
        conn.send(message);
      }
    });
  }, []);

  // Send message to host (guest only)
  const sendToHost = useCallback((message: LobbyMessage) => {
    if (hostConnectionRef.current?.open) {
      hostConnectionRef.current.send(message);
    }
  }, []);

  // Handle incoming messages - using refs to avoid stale closures
  const handleMessage = useCallback(
    (message: LobbyMessage, fromConnection?: DataConnection) => {
      // Construct context from latest refs
      const context: PeerContext = {
        isHost: isHostRef.current,
        localPlayerId: logicalPlayerIdRef.current!,
        players: playersRef.current,
        selectedGame: selectedGameRef.current,
        lobbySettings: lobbySettingsRef.current,
        isGameStarted: isGameStartedRef.current,
        pendingRequests, // PendingRequests is state, need ref? Use state for now, or add to useLatest

        // Refs
        rateLimit: rateLimitRef.current,
        connections: connectionsRef.current,
        peerIdToLogicalId: peerIdToLogicalIdRef.current,
        hostConnection: hostConnectionRef.current,
        sessionTokens: sessionTokensRef.current,
        reconnectionTimers: reconnectionTimersRef.current,
        mySessionToken: mySessionTokenRef.current,

        // Setters
        setPlayers,
        setPendingRequests,
        setJoinStatus,
        setStatus,
        setSelectedGame,
        setLobbySettings,
        setIsGameStarted,
        setLastGameMessage,
        setError,

        // Helpers
        cleanup,
        broadcast,
        sendToHost,
        createMessage,
      };

      const currentIsHost = isHostRef.current;
      const fromId = message.senderId;

      // SECURITY: Rate limiting
      if (fromConnection) {
        const peerId = fromConnection.peer;
        const now = Date.now();
        const rateEntry = rateLimitRef.current.get(peerId);

        if (!rateEntry || now > rateEntry.resetAt) {
          rateLimitRef.current.set(peerId, { count: 1, resetAt: now + 1000 });
        } else {
          rateEntry.count++;
          if (rateEntry.count > MAX_MESSAGES_PER_SECOND) {
            console.warn("[P2P] SECURITY: Rate limited peer:", peerId);
            return; // Drop the message
          }
        }
      }

      // SECURITY: Verify senderId matches the connection's verified identity
      if (fromConnection && message.type !== "join-request") {
        const verifiedId = peerIdToLogicalIdRef.current.get(
          fromConnection.peer,
        );
        if (currentIsHost && verifiedId && verifiedId !== fromId) {
          console.error(
            "[P2P] SECURITY: senderId mismatch, rejecting message",
            { claimed: fromId, actual: verifiedId, type: message.type },
          );
          return;
        }
      }

      // SECURITY: Validate timestamp
      const messageAge = Math.abs(Date.now() - message.timestamp);
      if (messageAge > 30000) {
        console.warn(
          "[P2P] SECURITY: Rejecting stale/future message:",
          message.type,
          "age:",
          messageAge,
        );
        return;
      }

      // SECURITY: Message authority checks
      if (fromConnection) {
        if (currentIsHost) {
          // Host should NEVER receive these from guests
          const hostOnlyTypes = [
            "join-accepted",
            "join-rejected",
            "join-pending",
            "join-approved",
            "join-denied",
            "player-joined",
            "player-kicked",
            "host-left",
            "lobby-settings",
            "game-selected",
            "game-start",
          ];
          if (hostOnlyTypes.includes(message.type)) return;
        } else {
          // Guest should ONLY trust these from host connection
          const sensitiveTypes = [
            "join-accepted",
            "join-rejected",
            "join-pending",
            "join-approved",
            "join-denied",
            "player-joined",
            "player-left",
            "player-kicked",
            "player-ready",
            "host-left",
            "lobby-settings",
            "game-selected",
            "game-start",
          ];
          if (
            sensitiveTypes.includes(message.type) &&
            fromConnection !== hostConnectionRef.current
          )
            return;
        }
      }

      // Extra security checks that were inside the switch
      // Player Left: Host verifies sender
      if (message.type === "player-left" && currentIsHost) {
        const payload = message.payload as any;
        if (payload.playerId !== message.senderId) return;
      }
      // Player Ready: Host verifies sender
      if (message.type === "player-ready" && currentIsHost) {
        const payload = message.payload as any;
        if (payload.playerId !== message.senderId) return;
      }

      console.log("[P2P] Received message:", message.type, message);

      const handler =
        messageHandlers[message.type as keyof typeof messageHandlers];
      if (handler) {
        // @ts-ignore - Validated by Zod and keyof check
        handler(context, message.payload, fromConnection, message);
      }
    },
    [broadcast, cleanup, sendToHost, pendingRequests],
  );

  // Setup connection handlers
  const setupConnection = useCallback(
    (conn: DataConnection, isHostConnection = false) => {
      console.log(
        "[P2P] Setting up connection:",
        conn.peer,
        "isHostConnection:",
        isHostConnection,
      );

      conn.on("data", (data) => {
        // SECURITY: Validate message structure before processing
        const message = validateMessage(data);
        if (!message) {
          console.warn(
            "[P2P] SECURITY: Dropped invalid message from:",
            conn.peer,
          );
          return;
        }
        handleMessage(message, conn);
      });

      conn.on("close", () => {
        console.log("[P2P] Connection closed:", conn.peer);

        // If we've already cleaned up, don't process
        if (!peerRef.current) return;

        if (isHostConnection) {
          // HOST DISCONNECTED
          // If we have a specific error or join status (like kicked, denied, etc.), don't overwrite it
          // We assume those handlers have already run or will run immediately.
          // If the socket closes naturally without a specific prior event, it's an unexpected disconnect.
          if (
            errorRef.current ||
            (joinStatusRef.current &&
              joinStatusRef.current !== "connecting" &&
              joinStatusRef.current !== "waiting-approval")
          ) {
            console.log(
              "[P2P] Connection closed, but preserving existing state:",
              errorRef.current || joinStatusRef.current,
            );
            cleanup({ keepError: true });
            return;
          }

          // Host disconnected unexpectedly
          setError("Host disconnected");
          cleanup({ keepError: true });
        } else {
          // GUEST DISCONNECTED
          const guestLogicalId = peerIdToLogicalIdRef.current.get(conn.peer);

          if (!guestLogicalId) {
            console.log(
              "[P2P] Unknown peer disconnected (no logical ID):",
              conn.peer,
            );
            return;
          }

          // IMPORTANT RACE CONDITION FIX:
          // Only mark as disconnected IF the connection that is closing is the ONE we currently have in connectionsRef.
          // If it's an old connection from a player who has already re-connected, ignore it.
          const currentConn = connectionsRef.current.get(guestLogicalId);

          if (currentConn && currentConn !== conn) {
            console.log(
              "[P2P] Ignoring close event from stale connection for player:",
              guestLogicalId,
            );
            // Just clean up the stale mapping if it exists
            peerIdToLogicalIdRef.current.delete(conn.peer);
            return;
          }

          // Proceed with disconnect logic
          const isJoined = playersRef.current.some(
            (p) => p.id === guestLogicalId,
          );

          // Remove from pending requests immediately
          setPendingRequests((prev) =>
            prev.filter((r) => r.playerId !== guestLogicalId),
          );

          // Clean up mapping and references
          peerIdToLogicalIdRef.current.delete(conn.peer);

          if (!isJoined) {
            connectionsRef.current.delete(guestLogicalId);
            return;
          }

          console.log("[P2P] Player disconnected:", guestLogicalId);

          // Mark player as disconnected in UI
          setPlayers((prev) => {
            const playerIdx = prev.findIndex((p) => p.id === guestLogicalId);
            if (playerIdx === -1) return prev;

            const updated = prev.map((p) =>
              p.id === guestLogicalId ? { ...p, isConnected: false } : p,
            );

            // Broadcast status change to other players
            const disconnectedPlayer = updated[playerIdx];
            const joinedPayload: PlayerJoinedPayload = {
              player: disconnectedPlayer,
            };
            broadcast(
              createMessage(
                "player-joined",
                joinedPayload,
                logicalPlayerIdRef.current!,
              ),
              guestLogicalId,
            );

            return updated;
          });

          // Start reconnection window
          // Clear any existing timer for this player first
          if (reconnectionTimersRef.current.has(guestLogicalId)) {
            clearTimeout(reconnectionTimersRef.current.get(guestLogicalId)!);
          }

          const timer = setTimeout(() => {
            // Check again if we are still the active connection/state (in case they reconnected then disconnected again rapidly)
            // But actually, if they reconnected, currentConn != conn check above would have saved us.
            // Yet, we need to be sure we are timing out the RIGHT disconnect session?
            // Reconnection wipes the timer map, so we are good.

            console.log(
              "[P2P] Reconnection window expired for guest:",
              guestLogicalId,
            );
            reconnectionTimersRef.current.delete(guestLogicalId);

            // Only remove if they are still disconnected
            // (Though if they reconnected, the timer would be cleared)

            const currentIsGameStarted = isGameStartedRef.current;

            setPlayers((prev) => {
              // Check if player is still in the list and disconnected
              const p = prev.find((p) => p.id === guestLogicalId);
              if (!p || p.isConnected) return prev; // They came back or were removed

              const updated = prev.filter((p) => p.id !== guestLogicalId);
              connectionsRef.current.delete(guestLogicalId); // Final cleanup

              if (currentIsGameStarted) {
                const connectedCount = updated.filter(
                  (p) => p.isConnected !== false,
                ).length;
                if (connectedCount <= 1) {
                  setStatus("disconnected");
                  setError("Game ended: not enough players");
                  cleanup({ keepError: true });
                }
              } else {
                // In lobby - notify others if not in game
                const currentLocalPlayerId = logicalPlayerIdRef.current;
                if (currentLocalPlayerId) {
                  const leftPayload: PlayerLeftPayload = {
                    playerId: guestLogicalId,
                  };
                  broadcast(
                    createMessage(
                      "player-left",
                      leftPayload,
                      currentLocalPlayerId,
                    ),
                  );
                }
              }
              return updated;
            });
          }, timeoutMs);

          reconnectionTimersRef.current.set(guestLogicalId, timer);
        }
      });

      conn.on("error", (err) => {
        console.error("[P2P] Connection error:", err);
      });
    },
    [handleMessage, cleanup, broadcast],
  );

  // Create a new lobby as host
  const createLobby = useCallback(
    (existingCode?: string, retryCount = 0) => {
      cleanup();
      setStatus("connecting");

      const code = existingCode || generateLobbyCode();
      const peerId = `ezp2p-${code}`;
      const currentLogicalId = logicalPlayerIdRef.current!;

      console.log(
        `[P2P] Creating lobby with code: ${code} (Attempt ${retryCount + 1}/3)`,
      );

      const peer = new Peer(peerId);
      peerRef.current = peer;

      peer.on("open", (id) => {
        console.log("[P2P] Peer open as host:", id);
        // setPeerjsId(id);
        setLobbyCode(code);
        setIsHost(true);

        setPlayers([
          {
            id: currentLogicalId,
            name: playerName,
            isHost: true,
            isReady: true,
            isConnected: true,
          },
        ]);
        setStatus("connected");
      });

      peer.on("connection", (conn) => {
        console.log("[P2P] Incoming connection from:", conn.peer);
        conn.on("open", () => {
          console.log("[P2P] Connection opened from:", conn.peer);
          // We don't store in connectionsRef yet, wait for join-request to get logicalId
          setupConnection(conn);
        });
      });

      peer.on("error", (err) => {
        console.error("[P2P] Peer error:", err);
        if (err.type === "unavailable-id") {
          // Code collision or old session still active on server
          if (existingCode && retryCount < 3) {
            console.log(
              `[P2P] ID ${peerId} still active on server, retrying in 2s...`,
            );
            setTimeout(() => {
              createLobby(existingCode, retryCount + 1);
            }, 2000);
          } else {
            // Normal collision, try again with a fresh code
            cleanup();
            createLobby(undefined, retryCount);
          }
        } else if (
          err.type === "peer-unavailable" ||
          err.type === "network" ||
          err.type === "server-error" ||
          err.type === "socket-error" ||
          err.type === "browser-incompatible"
        ) {
          if (retryCount < 3) {
            console.log(
              `[P2P] Retrying lobby creation due to ${err.type} error...`,
            );
            cleanup();
            setTimeout(() => {
              createLobby(existingCode, retryCount + 1);
            }, 1000);
          } else {
            setError(
              `Connection failed after 3 attempts (${err.type}). Try again later.`,
            );
            setStatus("error");
          }
        } else {
          // Fatal errors (e.g. invalid-id, ssl-unavailable)
          setError(`Connection error: ${err.type}`);
          setStatus("error");
        }
      });
    },
    [playerName, cleanup, setupConnection],
  );

  // Join an existing lobby
  const joinLobby = useCallback(
    (code: string, isReconnect = false, retryCount = 0) => {
      const currentLogicalId = logicalPlayerIdRef.current!;
      cleanup({ keepState: isReconnect });
      setStatus("connecting");

      // Normalize code just in case, though usually passed normalized
      const normalizedCode = code.toUpperCase();
      const hostPeerId = `ezp2p-${normalizedCode}`;
      console.log(
        `[P2P] Joining lobby: ${normalizedCode} (Attempt ${retryCount + 1})`,
        "hostPeerId:",
        hostPeerId,
      );

      const peer = new Peer();
      peerRef.current = peer;

      peer.on("open", (id) => {
        console.log("[P2P] Peer open as guest:", id);
        // setPeerjsId(id);
        setLobbyCode(normalizedCode);
        setIsHost(false);

        // Connect to host
        console.log("[P2P] Connecting to host:", hostPeerId);
        const conn = peer.connect(hostPeerId, { reliable: true });
        hostConnectionRef.current = conn;

        // Setup timeout for retry
        joinTimerRef.current = setTimeout(() => {
          // If the peer instance for this attempt is no longer the active one (e.g. user cancelled), abort.
          if (peerRef.current !== peer) return;

          console.log(`[P2P] Connection timed out after ${timeoutMs}ms.`);
          if (retryCount < 3) {
            console.log("[P2P] Retrying connection...");
            // Don't modify joinTimerRef.current directly as it will be overwritten by recursive call
            joinLobby(code, isReconnect, retryCount + 1);
          } else {
            console.error(
              "[P2P] Connection timed out after multiple attempts.",
            );
            setError("Connection timed out. Host may be offline.");
            setStatus("error");
            cleanup({ keepError: true });
          }
        }, timeoutMs);

        conn.on("open", () => {
          console.log("[P2P] Connected to host!");
          setupConnection(conn, true);
          // Send join request (include session token if we have one for reconnection)
          const joinRequest: JoinRequestPayload = {
            playerName,
            playerId: currentLogicalId,
            sessionToken: mySessionTokenRef.current ?? undefined,
          };
          console.log("[P2P] Sending join request:", joinRequest);
          conn.send(
            createMessage("join-request", joinRequest, currentLogicalId),
          );
        });

        conn.on("error", (err) => {
          console.error("[P2P] Connection to host failed:", err);

          if (retryCount < 3) {
            console.log(
              `[P2P] Retrying join after connection error (${retryCount + 1}/3)...`,
            );
            setTimeout(() => {
              if (peerRef.current !== peer) return;
              joinLobby(code, isReconnect, retryCount + 1);
            }, 1000);
            return;
          }

          setError("Could not connect to lobby");
          setStatus("error");
        });

        conn.on("close", () => {});
      });

      peer.on("error", (err: any) => {
        console.error("[P2P] Peer error:", err);

        // Determine if error is recoverable
        const recoverableTypes = [
          "network",
          "server-error",
          "socket-error",
          "webrtc",
        ];
        const isRecoverable = recoverableTypes.includes(err.type);
        const maxRetries = isReconnect ? 10 : 3;

        // Fatal errors: 'peer-unavailable' (lobby dead), 'invalid-id' (bad code), 'browser-incompatible', etc.

        if (isRecoverable && retryCount < maxRetries) {
          console.log(
            `[P2P] Retrying join due to recoverable error ${err.type} (${retryCount + 1}/${maxRetries})...`,
          );
          setTimeout(() => {
            // Check if we haven't been cleaned up or started another connection attempt
            if (peerRef.current !== peer) return;
            joinLobby(code, isReconnect, retryCount + 1);
          }, 2000);
          return;
        }

        if (err.type === "peer-unavailable") {
          setError(
            "Lobby not found. The host may have closed it or you have an incorrect code.",
          );
        } else if (err.type === "invalid-id") {
          setError("Invalid lobby code.");
        } else if (err.type === "browser-incompatible") {
          setError("Browser incompatible with PeerJS/webrtc.");
        } else {
          setError(`Connection error: ${err.type || "Unknown error"}`);
        }

        setStatus("error");
        if (isReconnect) {
          // If we failed to reconnect, eventually we give up
          cleanup({ keepState: true, keepError: true });
        }
      });
    },
    [playerName, cleanup, setupConnection],
  );

  // Leave the current lobby
  const leaveLobby = useCallback(() => {
    const currentLocalPlayerId = logicalPlayerIdRef.current;
    const currentIsHost = isHostRef.current;

    if (currentIsHost) {
      // Notify all players that host is leaving
      broadcast(createMessage("host-left", {}, currentLocalPlayerId!));
    } else {
      // Notify host
      sendToHost(
        createMessage(
          "player-left",
          { playerId: currentLocalPlayerId },
          currentLocalPlayerId!,
        ),
      );
    }

    // Clear session token when intentionally leaving
    sessionStorage.removeItem("ezp2p-sessionToken");
    mySessionTokenRef.current = null;

    cleanup();
  }, [broadcast, sendToHost, cleanup]);

  // Select a game (host only)
  const selectGame = useCallback(
    (gameId: string) => {
      if (!isHostRef.current) return;
      setSelectedGame(gameId);
      const payload: GameSelectedPayload = { gameId };
      broadcast(
        createMessage("game-selected", payload, logicalPlayerIdRef.current!),
      );
    },
    [broadcast],
  );

  // Toggle ready status
  const toggleReady = useCallback(() => {
    const currentLocalPlayerId = logicalPlayerIdRef.current;
    if (!currentLocalPlayerId) return;

    setPlayers((prev) => {
      const player = prev.find((p) => p.id === currentLocalPlayerId);
      if (!player) return prev;

      const newReady = !player.isReady;
      const payload: PlayerReadyPayload = {
        playerId: currentLocalPlayerId,
        isReady: newReady,
      };
      const message = createMessage(
        "player-ready",
        payload,
        currentLocalPlayerId,
      );

      if (isHostRef.current) {
        broadcast(message);
      } else {
        sendToHost(message);
      }

      return prev.map((p) =>
        p.id === currentLocalPlayerId ? { ...p, isReady: newReady } : p,
      );
    });
  }, [broadcast, sendToHost]);

  // Kick a player (host only)
  const kickPlayer = useCallback(
    (playerId: string) => {
      if (!isHostRef.current) return;
      const currentLocalPlayerId = logicalPlayerIdRef.current;
      if (!currentLocalPlayerId) return;

      console.log("[P2P] Kicking player:", playerId);

      const payload: PlayerKickedPayload = { playerId };
      const message = createMessage(
        "player-kicked",
        payload,
        currentLocalPlayerId,
      );

      // Send to kicked player directly
      const kickedConn = connectionsRef.current.get(playerId);
      if (kickedConn?.open) {
        kickedConn.send(message);
        // Give time for message to send before closing
        setTimeout(() => {
          kickedConn.close();
        }, 500);
      }

      // Notify others
      broadcast(message, playerId);

      // Update local state
      setPlayers((prev) => prev.filter((p) => p.id !== playerId));
      const conn = connectionsRef.current.get(playerId);
      conn?.close();
      connectionsRef.current.delete(playerId);
    },
    [broadcast, cleanup],
  );

  // Start the game (host only)
  const startGame = useCallback(() => {
    const currentPlayers = playersRef.current;
    const currentSelectedGame = selectedGameRef.current;
    const currentLocalPlayerId = logicalPlayerIdRef.current;

    if (!isHostRef.current || !currentSelectedGame || currentPlayers.length < 2)
      return;

    // Check all players are ready
    if (!currentPlayers.every((p) => p.isReady)) {
      console.log("[P2P] Cannot start: not all players ready");
      return;
    }

    console.log(
      "[P2P] Starting game:",
      currentSelectedGame,
      "with players:",
      currentPlayers,
    );
    setIsGameStarted(true);
    const payload: GameStartPayload = {
      gameId: currentSelectedGame,
      players: currentPlayers,
    };
    broadcast(createMessage("game-start", payload, currentLocalPlayerId!));
  }, [broadcast]);

  // Send a game message
  const sendGameMessage = useCallback(
    (type: string, data: unknown) => {
      const currentLocalPlayerId = logicalPlayerIdRef.current;
      if (!currentLocalPlayerId) return;

      const payload: GameMessagePayload = { type, data };
      const message = createMessage(
        "game-message",
        payload,
        currentLocalPlayerId,
      );

      console.log("[P2P] Sending game message:", payload);

      if (isHostRef.current) {
        broadcast(message);
        // Also handle locally for host
        setLastGameMessage({ ...payload, senderId: currentLocalPlayerId });
      } else {
        sendToHost(message);
        // Also handle locally for guest
        setLastGameMessage({ ...payload, senderId: currentLocalPlayerId });
      }
    },
    [broadcast, sendToHost],
  );

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Handle browser tab close/refresh - clean up peer connection
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Don't send "left" messages, allow reconnection window to handle it
      // Just close everything locally
      connectionsRef.current.forEach((conn) => conn.close());
      hostConnectionRef.current?.close();
      peerRef.current?.destroy();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Reset game state (return to lobby without disconnecting)
  const resetGame = useCallback(() => {
    setIsGameStarted(false);
    setLastGameMessage(null);
    // Reset all players to not ready
    setPlayers((prev) =>
      prev.map((p) => ({ ...p, isReady: p.isHost ? true : false })),
    );
  }, []);

  // Toggle requires-request setting (host only)
  const toggleRequiresRequest = useCallback(() => {
    if (!isHostRef.current) return;
    const currentLocalPlayerId = logicalPlayerIdRef.current;

    setLobbySettings((prev) => {
      const updated = { ...prev, requiresRequest: !prev.requiresRequest };
      const payload: LobbySettingsPayload = { settings: updated };
      broadcast(
        createMessage("lobby-settings", payload, currentLocalPlayerId!),
      );
      return updated;
    });
  }, [broadcast]);

  // Update specific game setting (host only)
  const updateGameSetting = useCallback(
    (gameId: string, key: string, value: any) => {
      if (!isHostRef.current) return;
      const currentLocalPlayerId = logicalPlayerIdRef.current;

      setLobbySettings((prev) => {
        const updatedGameSettings = {
          ...prev.gameSettings,
          [gameId]: {
            ...(prev.gameSettings[gameId] || {}),
            [key]: value,
          },
        };

        const updated = { ...prev, gameSettings: updatedGameSettings };
        const payload: LobbySettingsPayload = { settings: updated };
        broadcast(
          createMessage("lobby-settings", payload, currentLocalPlayerId!),
        );
        return updated;
      });
    },
    [broadcast],
  );

  // Deny a pending join request (host only)
  const denyJoinRequest = useCallback(
    (playerId: string) => {
      if (!isHostRef.current) return;
      const currentLocalPlayerId = logicalPlayerIdRef.current;

      // Remove from pending
      setPendingRequests((prev) => prev.filter((r) => r.playerId !== playerId));

      // Get the connection and send denial
      const conn = connectionsRef.current.get(playerId);
      if (conn?.open) {
        conn.send(createMessage("join-denied", {}, currentLocalPlayerId!));
        // Give time for message to send before closing
        setTimeout(() => {
          conn.close();
        }, 500);
      }
      connectionsRef.current.delete(playerId);

      broadcast(
        createMessage("player-kicked", { playerId }, currentLocalPlayerId!),
        playerId,
      );
    },
    [broadcast],
  );

  // Approve a pending join request (host only)
  const approveJoinRequest = useCallback(
    (playerId: string) => {
      if (!isHostRef.current) return;
      const currentLocalPlayerId = logicalPlayerIdRef.current;
      const currentSelectedGame = selectedGameRef.current;
      const currentLobbySettings = lobbySettingsRef.current;
      const currentPlayers = playersRef.current;

      // Check capacity before approving
      const gameDef = currentSelectedGame ? getGame(currentSelectedGame) : null;
      const maxPlayers = gameDef?.maxPlayers ?? 4;

      if (currentPlayers.length >= maxPlayers) {
        // Lobby is full, deny this request instead
        denyJoinRequest(playerId);
        return;
      }

      // Find the pending request
      const request = pendingRequests.find((r) => r.playerId === playerId);
      if (!request) return;

      // Remove from pending
      setPendingRequests((prev) => prev.filter((r) => r.playerId !== playerId));

      // Get the connection
      const conn = connectionsRef.current.get(playerId);
      if (!conn?.open) return;

      // Ensure mapping is present
      peerIdToLogicalIdRef.current.set(conn.peer, playerId);

      // Create the new player
      const newPlayer: PlayerInfo = {
        id: playerId,
        name: request.playerName,
        isHost: false,
        isReady: false,
        isConnected: true,
      };

      // SECURITY: Generate session token for this player
      const newSessionToken = crypto.randomUUID();
      sessionTokensRef.current.set(playerId, newSessionToken);

      setPlayers((prev) => {
        const updated = [...prev, newPlayer];

        // If we just hit capacity, automatically deny all other pending requests
        if (updated.length >= maxPlayers) {
          console.log(
            "[P2P] Capacity reached, automatically denying remaining requests",
          );
          // Do this in the same tick but after setPlayers returns to avoid nested state update issues
          setTimeout(() => {
            setPendingRequests((pending) => {
              pending.forEach((r) => {
                // Be careful not to deny the one we just approved (though it's already filtered out)
                const pConn = connectionsRef.current.get(r.playerId);
                if (pConn?.open) {
                  pConn.send(
                    createMessage(
                      "join-rejected",
                      { reason: "capacity-reached" },
                      currentLocalPlayerId!,
                    ),
                  );
                  setTimeout(() => pConn.close(), 500);
                }
                connectionsRef.current.delete(r.playerId);
              });
              return [];
            });
          }, 0);
        }

        // Notify joiner of acceptance (include session token)
        const acceptPayload: JoinAcceptedPayload = {
          players: updated,
          selectedGame: currentSelectedGame,
          lobbySettings: currentLobbySettings,
          sessionToken: newSessionToken,
        };
        conn.send(
          createMessage("join-accepted", acceptPayload, currentLocalPlayerId!),
        );
        // Notify other players
        const joinedPayload: PlayerJoinedPayload = { player: newPlayer };
        broadcast(
          createMessage("player-joined", joinedPayload, currentLocalPlayerId!),
          playerId,
        );
        return updated;
      });
    },
    [broadcast, pendingRequests, denyJoinRequest],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    status,
    error,
    lobbyCode,
    isHost,
    joinStatus,
    players,
    localPlayerId: logicalPlayerId,
    lobbySettings,
    pendingRequests,
    selectedGame,
    isGameStarted,
    lastGameMessage,
    createLobby,
    joinLobby,
    leaveLobby,
    selectGame,
    startGame,
    resetGame,
    sendGameMessage,
    toggleReady,
    kickPlayer,
    toggleRequiresRequest,
    updateGameSetting,
    approveJoinRequest,
    denyJoinRequest,
    clearError,
  };
}
