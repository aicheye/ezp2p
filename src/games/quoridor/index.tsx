import React from "react";
import type { GameDefinition, GameProps } from "../types";

/**
 * Minimal placeholder Quoridor game implementation so it can be registered.
 * Expand with full game logic later.
 */
function QuoridorGame(props: GameProps) {
  const { players, onExit, onReturnToLobby } = props;

  return (
    <div style={{ padding: "1rem", textAlign: "center" }}>
      <h2 style={{ marginBottom: "0.5rem" }}>QUORIDOR</h2>
      <p style={{ marginBottom: "1rem" }}>
        Quoridor is coming soon. This is a placeholder so the game appears in the lobby.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
        <button className="arcade-btn" onClick={() => onReturnToLobby ? onReturnToLobby() : onExit?.()}>
          RETURN
        </button>
      </div>

      <div style={{ marginTop: "1rem", fontSize: "0.9rem", color: "var(--arcade-dim)" }}>
        Players: {players.length}
      </div>
    </div>
  );
}

export const Quoridor: GameDefinition = {
  id: "quoridor",
  name: "QUORIDOR",
  minPlayers: 2,
  maxPlayers: 4,
  description: "Classic Quoridor — block opponents and reach the opposite side.",
  component: QuoridorGame,
};
