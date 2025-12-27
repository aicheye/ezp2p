import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "../../components/arcade";
import { audio } from "../../sound/audio";
import { useGameEngine } from "../hooks";
import type { GameDefinition, GameProps } from "../types";
import { Board } from "./Board";
import type { Move, Position, QuoridorState } from "./logic";
import {
  applyMove,
  createInitialState,
  getValidPawnMoves,
  getValidWallEndpoints,
  validateMove,
} from "./logic";
import "./styles.css";

/**
 * Quoridor P2P Game Component.
 */
function QuoridorGame(props: GameProps) {
  const {
    players,
    localPlayerId,
    sendMessage,
    onGameEnd,
    onForfeit,
    onExit,
    onReturnToLobby,
    disconnectedPlayerIds = [],
  } = props;

  const [showConfirmExit, setShowConfirmExit] = useState(false);
  const [wallMode, setWallMode] = useState(false);
  const [selectedCorner, setSelectedCorner] = useState<Position | null>(null);
  const [hoveredCorner, setHoveredCorner] = useState<Position | null>(null);
  const [opponentLeftMessage, setOpponentLeftMessage] = useState<
    "left" | "forfeit" | null
  >(null);

  const initialState = createInitialState(players.length);
  const myPlayerIndex = players.findIndex((p) => p.id === localPlayerId);
  const prevGameOverRef = useRef<boolean>(false);

  const { gameState, proposeMove, pendingMove, localPlayerIndex } =
    useGameEngine<QuoridorState, Move>({
      ...props,
      initialState,
      validateMove,
      applyMove,
      onMoveApplied: (newState, _move) => {
        if (newState.isGameOver) {
          const scores: Record<string, number> = {};
          players.forEach((p, i) => {
            scores[p.id] = newState.winner === i ? 1 : 0;
          });
          onGameEnd({
            winnerId:
              newState.winner !== null
                ? players[newState.winner].id
                : null,
            scores,
            reason: "complete",
          });
        }
      },
      onMessage: (message) => {
        if (message.type === "player-left") {
          const payload = message.payload as { playerId: string };
          if (payload.playerId !== localPlayerId) {
            setOpponentLeftMessage("left");
          }
        }
        if (message.type === "forfeit") {
          const payload = message.payload as { playerId: string };
          if (payload.playerId !== localPlayerId) {
            setOpponentLeftMessage("forfeit");
          }
        }
      },
    });

  // Check if opponent disconnected
  const opponentDisconnected = disconnectedPlayerIds.some(
    (id) => id !== localPlayerId
  );
  const opponentLeft = opponentLeftMessage !== null;

  // Determine whose turn it is
  const currentTurnIsLocal = gameState.currentPlayer === localPlayerIndex;

  // Reset wall mode when turn changes
  useEffect(() => {
    setWallMode(false);
    setSelectedCorner(null);
    setHoveredCorner(null);
  }, [gameState.currentPlayer]);

  // Handle cell click (pawn movement)
  const handleCellClick = useCallback(
    (pos: Position) => {
      if (
        !currentTurnIsLocal ||
        gameState.isGameOver ||
        opponentLeft ||
        opponentDisconnected ||
        !!pendingMove ||
        wallMode
      )
        return;

      const validMoves = getValidPawnMoves(gameState, localPlayerIndex);
      if (!validMoves.some((m) => m.row === pos.row && m.col === pos.col)) return;

      proposeMove({
        type: "pawn",
        to: pos,
        playerId: localPlayerIndex,
      });
    },
    [
      currentTurnIsLocal,
      gameState,
      localPlayerIndex,
      opponentLeft,
      opponentDisconnected,
      pendingMove,
      wallMode,
      proposeMove,
    ]
  );

  // Handle corner click (wall placement)
  const handleCornerClick = useCallback(
    (pos: Position) => {
      if (
        !currentTurnIsLocal ||
        gameState.isGameOver ||
        opponentLeft ||
        opponentDisconnected ||
        !!pendingMove ||
        !wallMode
      )
        return;

      if (!selectedCorner) {
        // First click: select start corner
        setSelectedCorner(pos);
        setHoveredCorner(null);
      } else {
        // Clicked same corner - deselect
        if (pos.row === selectedCorner.row && pos.col === selectedCorner.col) {
          setSelectedCorner(null);
          return;
        }

        // Second click: find matching endpoint and place wall
        const endpoints = getValidWallEndpoints(gameState, selectedCorner, localPlayerIndex);
        const matchingEndpoint = endpoints.find(
          ep => ep.position.row === pos.row && ep.position.col === pos.col
        );

        if (matchingEndpoint) {
          proposeMove({
            type: "wall",
            wall: matchingEndpoint.wall,
            playerId: localPlayerIndex,
          });
          setSelectedCorner(null);
          setHoveredCorner(null);
        }
      }
    },
    [
      currentTurnIsLocal,
      gameState,
      localPlayerIndex,
      opponentLeft,
      opponentDisconnected,
      pendingMove,
      wallMode,
      selectedCorner,
      proposeMove,
    ]
  );

  // Handle corner hover
  const handleCornerHover = useCallback((pos: Position | null) => {
    setHoveredCorner(pos);
  }, []);

  // Get player label
  const getPlayerLabel = (index: number) => {
    const player = players[index];
    if (!player) return null;
    const isLocal = player.id === localPlayerId;
    const isDisconnected = disconnectedPlayerIds.includes(player.id);
    const isTurn = gameState.currentPlayer === index && !gameState.isGameOver;

    return (
      <div
        key={player.id}
        className={`qr-player qr-player--p${index + 1} ${isTurn ? "qr-player--active" : ""}`}
      >
        <div className="qr-player__name">
          {isLocal ? "YOU" : player.name}
          {isDisconnected && (
            <span
              className="color-danger blink-fast"
              style={{ fontSize: "0.5rem", marginLeft: "0.25rem" }}
            >
              (LOST)
            </span>
          )}
        </div>
        <div className="qr-player__walls">
          WALLS: {gameState.wallsRemaining[index]}
        </div>
      </div>
    );
  };

  const handleForfeit = () => {
    sendMessage({
      type: "forfeit",
      payload: { playerId: localPlayerId },
      senderId: localPlayerId,
      timestamp: Date.now(),
    });

    if (onForfeit) {
      const scores: Record<string, number> = {};
      players.forEach((p) => {
        scores[p.id] = 0;
      });

      onGameEnd({
        winnerId: players.find((p) => p.id !== localPlayerId)?.id ?? null,
        scores,
        reason: "forfeit",
      });
      onForfeit();
    }
  };

  const handleExit = () => {
    sendMessage({
      type: "player-left",
      payload: { playerId: localPlayerId },
      senderId: localPlayerId,
      timestamp: Date.now(),
    });
    onExit?.();
  };

  // Play win/loss SFX
  useEffect(() => {
    if (!prevGameOverRef.current && gameState.isGameOver) {
      if (gameState.winner === myPlayerIndex) {
        audio.playWin();
      } else {
        audio.playLoss();
      }
    }
    prevGameOverRef.current = gameState.isGameOver;
  }, [gameState.isGameOver, gameState.winner, myPlayerIndex]);

  const canPlaceWalls = gameState.wallsRemaining[localPlayerIndex] > 0;

  return (
    <div className="qr-container">
      {/* Header with player info */}
      <div className="qr-header">
        {players.map((_, i) => getPlayerLabel(i))}
      </div>

      {/* Turn indicator */}
      {!gameState.isGameOver && !opponentLeft && (
        <div
          className={`qr-turn-indicator qr-turn-indicator--p${gameState.currentPlayer + 1}`}
        >
          {currentTurnIsLocal
            ? "YOUR TURN"
            : `${players[gameState.currentPlayer]?.name.toUpperCase()}'S TURN`}
        </div>
      )}

      {/* Mode toggle (only when it's your turn) */}
      {currentTurnIsLocal && !gameState.isGameOver && !opponentLeft && (
        <div className="qr-mode-toggle">
          <button
            className={`qr-mode-btn ${!wallMode ? "qr-mode-btn--active" : ""}`}
            onClick={() => {
              setWallMode(false);
              setSelectedCorner(null);
            }}
          >
            MOVE
          </button>
          <button
            className={`qr-mode-btn ${wallMode ? "qr-mode-btn--active" : ""}`}
            onClick={() => setWallMode(true)}
            disabled={!canPlaceWalls}
          >
            WALL ({gameState.wallsRemaining[localPlayerIndex]})
          </button>
        </div>
      )}

      {/* Game Board */}
      <div className="qr-board-wrapper">
        <div style={{ position: "relative" }}>
          <div className="qr-goal-top" />
          <Board
            state={gameState}
            localPlayerIndex={localPlayerIndex}
            isMyTurn={currentTurnIsLocal && !gameState.isGameOver && !opponentLeft}
            wallMode={wallMode}
            selectedCorner={selectedCorner}
            onCellClick={handleCellClick}
            onCornerClick={handleCornerClick}
            onCornerHover={handleCornerHover}
            hoveredCorner={hoveredCorner}
          />
          <div className="qr-goal-bottom" />
        </div>
      </div>

      {/* Action Buttons */}
      {!gameState.isGameOver && !opponentLeft && (
        <div className="qr-actions">
          <button
            className="arcade-btn arcade-btn--small arcade-btn--secondary"
            onClick={() => setShowConfirmExit(true)}
          >
            EXIT
          </button>
          <button
            className="arcade-btn arcade-btn--small arcade-btn--danger"
            onClick={handleForfeit}
          >
            FORFEIT
          </button>
        </div>
      )}

      {/* Game Over Modal */}
      <Modal
        isOpen={gameState.isGameOver}
        title={
          gameState.winner === localPlayerIndex ? "YOU WIN!" : "YOU LOSE!"
        }
        variant={gameState.winner === localPlayerIndex ? "primary" : "danger"}
        actions={
          <button
            className="arcade-btn"
            onClick={() => (onReturnToLobby ? onReturnToLobby() : onExit?.())}
          >
            {onReturnToLobby ? "RETURN TO LOBBY" : "EXIT"}
          </button>
        }
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="terminal-text color-accent" style={{ fontSize: "1.25rem" }}>
            {gameState.winner === localPlayerIndex
              ? "You reached the opposite side!"
              : `${players[gameState.winner ?? 0]?.name} reached their goal!`}
          </div>
        </div>
      </Modal>

      {/* Opponent Left/Forfeit Modal */}
      <Modal
        isOpen={opponentLeft && !gameState.isGameOver}
        title={
          opponentLeftMessage === "forfeit" ? "PLAYER FORFEITED" : "PLAYER LEFT"
        }
        variant="warning"
        actions={
          opponentLeftMessage === "forfeit" ? (
            <button className="arcade-btn" onClick={() => onReturnToLobby?.()}>
              RETURN TO LOBBY
            </button>
          ) : (
            <button className="arcade-btn" onClick={() => onExit?.()}>
              EXIT
            </button>
          )
        }
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="terminal-text" style={{ fontSize: "1.25rem" }}>
            Your opponent has left the match.
          </p>
          <p className="terminal-text color-dim" style={{ fontSize: "0.875rem" }}>
            YOU WIN BY DEFAULT!
          </p>
        </div>
      </Modal>

      {/* Confirm Exit Modal */}
      <Modal
        isOpen={showConfirmExit}
        title="EXIT GAME?"
        variant="warning"
        onClose={() => setShowConfirmExit(false)}
        actions={
          <>
            <button
              className="arcade-btn arcade-btn--secondary"
              onClick={() => setShowConfirmExit(false)}
            >
              CANCEL
            </button>
            <button
              className="arcade-btn arcade-btn--danger"
              onClick={handleExit}
            >
              EXIT
            </button>
          </>
        }
      >
        <p className="terminal-text color-dim" style={{ fontSize: "1.25rem" }}>
          This will count as a forfeit.
        </p>
      </Modal>
    </div>
  );
}

/**
 * Game registration for the registry.
 */
export const Quoridor: GameDefinition = {
  id: "quoridor",
  name: "QUORIDOR",
  minPlayers: 2,
  maxPlayers: 2,
  description: "Race to the other side while blocking your opponent with walls!",
  component: QuoridorGame,
  validateMove,
};
