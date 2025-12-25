import { useCallback, useState } from "react";
import { Modal } from "../../components/arcade";
import { useGameEngine } from "../hooks";
import type { GameDefinition, GameProps, GameSettingsProps } from "../types";
import { Board } from "./Board";
import type { DotsAndBoxesState, Line, Move } from "./logic";
import {
  applyMove,
  createInitialState,
  isLineDrawn,
  validateMove,
} from "./logic";
import "./styles.css";

/**
 * Dots and Boxes P2P Game Component.
 */
function DotsAndBoxesGame(props: GameProps) {
  const {
    players,
    localPlayerId,
    sendMessage,
    onGameEnd,
    onForfeit,
    onExit,
    onReturnToLobby,
    disconnectedPlayerIds = [],
    gameSettings = {},
  } = props;
  const initialGridSize = gameSettings.gridSize || 5;
  const [showConfirmExit, setShowConfirmExit] = useState(false);
  const [opponentLeftMessage, setOpponentLeftMessage] = useState<
    "left" | "forfeit" | null
  >(null);

  const { gameState, proposeMove, pendingMove, localPlayerIndex } =
    useGameEngine<DotsAndBoxesState, Move>({
      ...props,
      initialState: createInitialState(props.players.length, initialGridSize),
      validateMove,
      applyMove,
      onMoveApplied: (newState) => {
        if (newState.isGameOver) {
          const scores: Record<string, number> = {};
          props.players.forEach((p, i) => {
            scores[p.id] = newState.scores[i];
          });

          props.onGameEnd({
            winnerId:
              newState.winners.length === 1
                ? props.players[newState.winners[0]].id
                : null,
            scores,
            reason: "complete",
          });
        }
      },
      onMessage: (message) => {
        if (message.type === "player-left") {
          const payload = message.payload as { playerId: string };
          if (payload.playerId !== props.localPlayerId) {
            setOpponentLeftMessage("left");
          }
        }
        if (message.type === "forfeit") {
          const payload = message.payload as { playerId: string };
          if (payload.playerId !== props.localPlayerId) {
            setOpponentLeftMessage("forfeit");
          }
        }
      },
    });

  // Check if any opponent (non-local player) has disconnected
  const opponentDisconnected = disconnectedPlayerIds.some(
    (id) => id !== localPlayerId,
  );

  // Opponent left only if they explicitly sent leave/forfeit message
  const opponentLeft = opponentLeftMessage !== null;

  const getPlayerLabel = (index: number) => {
    const player = players[index];
    if (!player) return null;
    const isLocal = player.id === localPlayerId;
    const isDisconnected = disconnectedPlayerIds.includes(player.id);
    const isTurn = gameState.currentPlayer === index && !gameState.isGameOver;

    return (
      <div
        key={player.id}
        className={`dab-player dab-player--p${index + 1} ${isTurn ? "dab-player--active" : ""}`}
      >
        <div className="dab-player__name">
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
        <div className="dab-player__score">{gameState.scores[index]}</div>
      </div>
    );
  };

  // Determine whose turn it is based on game state
  const currentTurnIsLocal = gameState.currentPlayer === localPlayerIndex;

  // Handle local move
  const handleLineClick = useCallback(
    (line: Line) => {
      if (
        !currentTurnIsLocal ||
        gameState.isGameOver ||
        opponentLeft ||
        opponentDisconnected ||
        !!pendingMove
      )
        return;
      if (isLineDrawn(gameState, line)) return;

      proposeMove({ line, playerId: localPlayerIndex });
    },
    [
      currentTurnIsLocal,
      gameState,
      localPlayerIndex,
      opponentLeft,
      opponentDisconnected,
      pendingMove,
      proposeMove,
    ],
  );

  const handleForfeit = () => {
    // Notify opponent
    sendMessage({
      type: "forfeit",
      payload: { playerId: localPlayerId },
      senderId: localPlayerId,
      timestamp: Date.now(),
    });

    if (onForfeit) {
      const scores: Record<string, number> = {};
      players.forEach((p, i) => {
        scores[p.id] = gameState.scores[i];
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
    // Notify opponent we're leaving
    sendMessage({
      type: "player-left",
      payload: { playerId: localPlayerId },
      senderId: localPlayerId,
      timestamp: Date.now(),
    });
    onExit?.();
  };

  return (
    <div className="dab-container">
      {/* Header with scores */}
      <div className={`dab-header dab-header--${players.length}players`}>
        {players.map((_, i) => getPlayerLabel(i))}
      </div>

      {/* Turn indicator - moved below header */}
      {!gameState.isGameOver && !opponentLeft && (
        <div
          className={`dab-turn-indicator dab-turn-indicator--p${gameState.currentPlayer + 1}`}
        >
          {currentTurnIsLocal
            ? "YOUR TURN"
            : `${players[gameState.currentPlayer]?.name.toUpperCase()}'S TURN`}
        </div>
      )}

      {/* Game Board - Centered */}
      <div className="dab-board-wrapper">
        <Board
          state={gameState}
          localPlayerIndex={localPlayerIndex}
          isMyTurn={
            currentTurnIsLocal && !gameState.isGameOver && !opponentLeft
          }
          onLineClick={handleLineClick}
        />
      </div>

      {/* Action Buttons */}
      {!gameState.isGameOver && !opponentLeft && (
        <div className="dab-actions">
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
          gameState.winners.length > 1
            ? "DRAW!"
            : gameState.winners.includes(localPlayerIndex)
              ? "YOU WIN!"
              : "YOU LOSE!"
        }
        variant={
          gameState.winners.includes(localPlayerIndex)
            ? "primary"
            : gameState.winners.length > 1
              ? "secondary"
              : "danger"
        }
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
          <div className="pixel-text color-dim" style={{ fontSize: "1.5rem" }}>
            {gameState.scores.join(" - ")}
          </div>

          {gameState.winners.length > 1 && (
            <div
              className="terminal-text color-accent"
              style={{ fontSize: "0.875rem" }}
            >
              TIE BETWEEN:{" "}
              {gameState.winners
                .map((idx) => players[idx]?.name || "???")
                .join(", ")}
            </div>
          )}
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
            A player has left the match.
          </p>

          <div
            className="pixel-text color-accent"
            style={{ fontSize: "1rem", marginTop: "1rem" }}
          >
            CURRENT SCORES
          </div>
          <div
            className="pixel-text color-dim"
            style={{ fontSize: "1.5rem", marginTop: "0.5rem" }}
          >
            {gameState.scores.join(" - ")}
          </div>

          <p
            className="terminal-text color-dim"
            style={{ fontSize: "0.875rem", marginTop: "1rem" }}
          >
            THE GAME HAS ENDED.
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
 * Settings component for the lobby.
 */
function DotsAndBoxesSettings({
  isHost,
  settings,
  onUpdateSetting,
}: GameSettingsProps) {
  const gridSize = settings.gridSize || 5;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        alignItems: "center",
      }}
    >
      <span
        className="terminal-text"
        style={{ fontSize: "1rem", color: "var(--arcade-accent)" }}
      >
        GRID SIZE
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <button
          className={
            isHost
              ? "arcade-btn arcade-btn--small"
              : "arcade-btn arcade-btn--small arcade-btn--disabled"
          }
          style={{
            fontSize: "0.75rem",
            padding: "0 0.14rem 0.1rem 0.25rem",
            marginRight: "0.25rem",
          }}
          onClick={() => {
            if (gridSize > 3) onUpdateSetting("gridSize", gridSize - 1);
          }}
        >
          ▼
        </button>
        <div
          className="pixel-text"
          style={{ fontSize: "1rem", minWidth: "3ch" }}
        >
          {gridSize}&times;{gridSize}
        </div>
        <button
          className={
            isHost
              ? "arcade-btn arcade-btn--small"
              : "arcade-btn arcade-btn--small arcade-btn--disabled"
          }
          style={{ fontSize: "0.75rem", padding: "0 0.14rem 0.1rem 0.25rem" }}
          onClick={() => {
            if (gridSize < 8) onUpdateSetting("gridSize", gridSize + 1);
          }}
        >
          ▲
        </button>
      </div>
      <span className="terminal-text color-dim" style={{ fontSize: "1rem" }}>
        MIN: 3&times;3 | MAX: 8&times;8
      </span>
    </div>
  );
}

/**
 * Game registration for the registry.
 */
export const DotsAndBoxes: GameDefinition = {
  id: "dots-and-boxes",
  name: "DOTS & BOXES",
  minPlayers: 2,
  maxPlayers: 4,
  description: "Complete boxes by drawing lines. Get the most boxes to win!",
  component: DotsAndBoxesGame,
  settingsComponent: DotsAndBoxesSettings,
  validateMove,
};
