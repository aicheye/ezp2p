import { useCallback, useEffect, useRef, useState } from "react";
import type { GameMessage, GameProps } from "./types";

interface UseGameEngineOptions<TState, TMove> extends GameProps {
  initialState: TState | (() => TState);
  validateMove: (state: TState, move: TMove, playerIndex: number) => boolean;
  applyMove: (state: TState, move: TMove) => TState;
  onMoveApplied?: (newState: TState, move: TMove) => void;
  onMessage?: (message: GameMessage) => void;
}

interface PendingMoveState<TMove> {
  id: string;
  move: TMove;
  proposerId: string;
  approvals: string[]; // IDs of players who approved
  locallyApproved: boolean; // Whether WE validated and approved this move
}

/**
 * A generalized hook to manage game state, consensus, and synchronization.
 *
 * SECURITY MODEL (Host-Relayed Consensus with Dual Approval):
 * 1. Proposer sends 'propose-move' to all peers
 * 2. Each peer validates the move locally and sends 'approve-move' (to host)
 * 3. Host collects approvals and broadcasts 'finalize-move' when unanimous
 * 4. All peers (including host) only apply the move if:
 *    a) They received 'finalize-move' AND
 *    b) They locally approved the move (validated it themselves)
 *
 * This prevents a malicious host from fabricating finalize-move for invalid moves.
 */
export function useGameEngine<TState, TMove>({
  players,
  localPlayerId,
  lastMessage,
  sendMessage,
  disconnectedPlayerIds,
  initialState,
  validateMove,
  applyMove,
  onMoveApplied,
  onMessage,
}: UseGameEngineOptions<TState, TMove>) {
  const [gameState, setGameState] = useState<TState>(initialState);
  const [pendingMove, setPendingMove] =
    useState<PendingMoveState<TMove> | null>(null);

  // Track if we've received finalize-move for the current pending move
  const [finalizeReceived, setFinalizeReceived] = useState<string | null>(null);

  // Track initial sync - only accept sync-state ONCE at game start
  const hasReceivedInitialSync = useRef(false);

  const localPlayerIndex = players.findIndex((p) => p.id === localPlayerId);
  const isHost = players[localPlayerIndex]?.isHost;

  // --- Proposal Logic ---
  const proposeMove = useCallback(
    (move: TMove) => {
      if (pendingMove) return; // Prevent double proposals

      // SECURITY: Use crypto.randomUUID for unpredictable move IDs
      const moveId = crypto.randomUUID();

      console.log("[P2P] Consensus: Proposing move:", moveId);

      // Proposer adds their own approval immediately
      setPendingMove({
        id: moveId,
        move,
        proposerId: localPlayerId,
        approvals: [localPlayerId],
        locallyApproved: true, // We proposed it, so we implicitly approve
      });

      sendMessage({
        type: "propose-move",
        payload: { ...(move as object), moveId },
        senderId: localPlayerId,
        timestamp: Date.now(),
      });
    },
    [localPlayerId, pendingMove, sendMessage],
  );

  // --- Finalization Effect (Dual Approval Check) ---
  useEffect(() => {
    if (!pendingMove || !finalizeReceived) return;
    if (finalizeReceived !== pendingMove.id) return;

    // SECURITY: Only apply if we locally approved this move
    if (!pendingMove.locallyApproved) {
      console.error(
        "[P2P] SECURITY: Rejecting finalize-move - not locally approved:",
        pendingMove.id,
      );
      setPendingMove(null);
      setFinalizeReceived(null);
      return;
    }

    console.log(
      "[P2P] Consensus: Move finalized and locally approved, applying:",
      pendingMove.id,
    );

    const newState = applyMove(gameState, pendingMove.move);
    setGameState(newState);
    setPendingMove(null);
    setFinalizeReceived(null);

    if (onMoveApplied) {
      onMoveApplied(newState, pendingMove.move);
    }
  }, [pendingMove, finalizeReceived, gameState, applyMove, onMoveApplied]);

  // --- Host Consensus Check Effect ---
  useEffect(() => {
    if (!isHost || !pendingMove) return;

    const activePlayers = players.filter(
      (p) => !disconnectedPlayerIds?.includes(p.id),
    );
    const hasUnanimous = activePlayers.every((p) =>
      pendingMove.approvals.includes(p.id),
    );

    if (hasUnanimous) {
      console.log("[P2P] Consensus: Host finalizing move:", pendingMove.id);

      // Broadcast finalize-move to all peers
      sendMessage({
        type: "finalize-move",
        payload: { moveId: pendingMove.id },
        senderId: localPlayerId,
        timestamp: Date.now(),
      });

      // Also trigger local finalization
      setFinalizeReceived(pendingMove.id);
    }
  }, [
    pendingMove,
    players,
    disconnectedPlayerIds,
    isHost,
    localPlayerId,
    sendMessage,
  ]);

  // --- Message Routing Effect ---
  useEffect(() => {
    if (!lastMessage) return;

    const { type, payload, senderId } = lastMessage;

    switch (type) {
      case "propose-move": {
        const movePayload = payload as TMove & { moveId: string };
        const { moveId, ...moveData } = movePayload;
        const move = moveData as unknown as TMove;
        const proposerIndex = players.findIndex((p) => p.id === senderId);

        if (validateMove(gameState, move, proposerIndex)) {
          console.log("[P2P] Consensus: Validated move from", senderId, moveId);

          // Send approval to host (if not host) or add to our tracking (if host)
          if (senderId !== localPlayerId) {
            sendMessage({
              type: "approve-move",
              payload: { moveId },
              senderId: localPlayerId,
              timestamp: Date.now(),
            });
          }

          setPendingMove((prev) => {
            if (prev?.id === moveId) {
              // Already have this move, just update approvals
              const newApprovals = new Set(prev.approvals);
              newApprovals.add(senderId);
              newApprovals.add(localPlayerId);
              return {
                ...prev,
                approvals: Array.from(newApprovals),
                locallyApproved: true,
              };
            }
            // New move
            return {
              id: moveId,
              move,
              proposerId: senderId,
              approvals: [senderId, localPlayerId],
              locallyApproved: true,
            };
          });
        } else {
          console.error("[P2P] Consensus: Invalid move proposed!", {
            move,
            moveId,
          });
          // Don't set pendingMove - we won't approve invalid moves
        }
        break;
      }

      case "approve-move": {
        // Only host tracks approvals from others
        if (!isHost) break;

        const { moveId } = payload as { moveId: string };
        setPendingMove((prev) => {
          if (!prev || prev.id !== moveId) return prev;
          if (prev.approvals.includes(senderId)) return prev;
          console.log(
            "[P2P] Consensus: Received approval from",
            senderId,
            "for",
            moveId,
          );
          return { ...prev, approvals: [...prev.approvals, senderId] };
        });
        break;
      }

      case "finalize-move": {
        // Host doesn't need this - they trigger finalization themselves
        if (isHost) break;

        const { moveId } = payload as { moveId: string };
        console.log("[P2P] Consensus: Received finalize-move:", moveId);
        setFinalizeReceived(moveId);
        break;
      }

      case "request-state":
        if (isHost) {
          sendMessage({
            type: "sync-state",
            payload: { gameState },
            senderId: localPlayerId,
            timestamp: Date.now(),
          });
        }
        break;

      case "sync-state":
        // SECURITY: Only accept sync-state once at the beginning, never mid-game
        if (!isHost && !hasReceivedInitialSync.current) {
          const { gameState: syncedState } = payload as { gameState: TState };
          console.log("[P2P] Consensus: Received initial state sync");
          setGameState(syncedState);
          hasReceivedInitialSync.current = true;
        } else if (!isHost) {
          console.warn("[P2P] SECURITY: Rejecting sync-state - already synced");
        }
        break;

      default:
        // Pass unhandled messages to the game component
        if (onMessage) {
          onMessage(lastMessage);
        }
        break;
    }
  }, [
    lastMessage,
    localPlayerId,
    gameState,
    players,
    isHost,
    sendMessage,
    validateMove,
    onMessage,
  ]);

  // --- Initial Sync Effect ---
  useEffect(() => {
    if (!isHost) {
      sendMessage({
        type: "request-state",
        payload: {},
        senderId: localPlayerId,
        timestamp: Date.now(),
      });
    }
  }, []);

  return {
    gameState,
    setGameState,
    pendingMove,
    proposeMove,
    localPlayerIndex,
  };
}
