import { useCallback, useEffect, useState } from "react";
import { Modal } from "../../components/arcade";
import { audio } from "../../sound/audio";
import { useGameEngine } from "../hooks";
import type { GameDefinition, GameProps } from "../types";
import { Board } from "./Board";
import type { Move, TicTacToeState } from "./logic";
import { applyMove, createInitialState, validateMove } from "./logic";
import "./styles.css";

/**
 * Tic Tac Toe P2P Game Component.
 */
function TicTacToeGame(props: GameProps) {
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
  const [opponentLeftMessage, setOpponentLeftMessage] = useState<
    "left" | "forfeit" | null
  >(null);
  const [delayedGameOver, setDelayedGameOver] = useState(false);

  const { gameState, proposeMove, pendingMove, localPlayerIndex } =
    useGameEngine<TicTacToeState, Move>({
      ...props,
      initialState: createInitialState(props.players.length),
      validateMove,
      applyMove,
      onMoveApplied: () => {
        // Score calculation moved to effect to allow animation to play
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

  // Handle game over with delay for animation
  useEffect(() => {
    if (gameState.isGameOver && !delayedGameOver) {
      const timer = setTimeout(() => {
        setDelayedGameOver(true);

        // Calculate final scores
        const scores: Record<string, number> = {};
        props.players.forEach((p, i) => {
          scores[p.id] = gameState.winner === i ? 1 : 0;
        });

        props.onGameEnd({
          winnerId:
            gameState.winner !== null
              ? props.players[gameState.winner].id
              : null,
          scores,
          reason: "complete",
        });
      }, 1500);

      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.isGameOver]);

  // Play win/loss SFX when the Game Over modal actually opens (aligned with UI)
  useEffect(() => {
    if (delayedGameOver && gameState.isGameOver) {
      try {
        if (gameState.winner === null) {
          audio.playLongBlip();
        } else if (gameState.winner === localPlayerIndex) {
          audio.playWin();
        } else {
          audio.playLoss();
        }
      } catch { }
    }
  }, [delayedGameOver, gameState.isGameOver, gameState.winner, localPlayerIndex]);

  // Check if opponent has disconnected
  const opponentDisconnected = disconnectedPlayerIds.some(
    (id) => id !== localPlayerId,
  );

  // Opponent left only if they explicitly sent leave/forfeit message
  const opponentLeft = opponentLeftMessage !== null;

  const currentTurnIsLocal = gameState.currentPlayer === localPlayerIndex;

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (
        !currentTurnIsLocal ||
        gameState.isGameOver ||
        opponentLeft ||
        opponentDisconnected ||
        !!pendingMove
      )
        return;

      try {
        audio.playLongBlip();
      } catch { }

      proposeMove({ row, col, playerId: localPlayerIndex });
    },
    [
      currentTurnIsLocal,
      gameState.isGameOver,
      opponentLeft,
      opponentDisconnected,
      pendingMove,
      localPlayerIndex,
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
      players.forEach((p) => {
        scores[p.id] = 0; // No points for forfeit
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
    <div className="ttt-container">
      {/* Header with players */}
      <div className="ttt-header">
        {players.map((p, i) => {
          const isLocal = p.id === localPlayerId;
          const isTurn = gameState.currentPlayer === i && !gameState.isGameOver;
          const isWinner = gameState.winner === i;
          const isDisconnected = disconnectedPlayerIds.includes(p.id);

          return (
            <div
              key={p.id}
              className={`ttt-player ttt-player--p${i + 1} ${isTurn ? "ttt-player--active" : ""}`}
            >
              <div className="ttt-player__name">
                {isLocal ? "YOU" : p.name}
                {isDisconnected && (
                  <span
                    className="color-danger blink-fast"
                    style={{ fontSize: "0.5rem", marginLeft: "0.25rem" }}
                  >
                    (LOST)
                  </span>
                )}
              </div>
              <div className="ttt-player__symbol">{i === 0 ? "X" : "O"}</div>
              {isWinner && (
                <div
                  className="pixel-text color-accent"
                  style={{ fontSize: "0.75rem", marginTop: "0.5rem" }}
                >
                  WINNER
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Turn indicator */}
      {!gameState.isGameOver && !opponentLeft && (
        <div
          className={`ttt-turn-indicator ttt-turn-indicator--p${gameState.currentPlayer + 1}`}
        >
          {currentTurnIsLocal
            ? "YOUR TURN"
            : `${players[gameState.currentPlayer]?.name.toUpperCase()}'S TURN`}
        </div>
      )}

      {/* Game Board */}
      <div className="ttt-board-wrapper">
        <Board
          state={gameState}
          isMyTurn={
            currentTurnIsLocal && !gameState.isGameOver && !opponentLeft
          }
          onCellClick={handleCellClick}
        />
      </div>

      {/* Action Buttons */}
      {!gameState.isGameOver && !opponentLeft && (
        <div className="ttt-actions">
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
        isOpen={delayedGameOver}
        title={
          gameState.winner === null
            ? "DRAW!"
            : gameState.winner === localPlayerIndex
              ? "YOU WIN!"
              : "YOU LOSE!"
        }
        variant={
          gameState.winner === localPlayerIndex
            ? "primary"
            : gameState.winner === null
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
          {gameState.winner !== null ? (
            <div
              className="pixel-text color-accent"
              style={{ fontSize: "1rem" }}
            >
              WINNER: {players[gameState.winner]?.name.toUpperCase()}
            </div>
          ) : (
            <div className="pixel-text color-dim" style={{ fontSize: "1rem" }}>
              STALEMATE
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
 * Game registration.
 */
export const TicTacToe: GameDefinition = {
  id: "tic-tac-toe",
  name: "TIC TAC TOE",
  minPlayers: 2,
  maxPlayers: 2,
  description: "Classic 3-in-a-row game. X goes first!",
  component: TicTacToeGame,
  validateMove,
};
