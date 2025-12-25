import React, { useEffect, useState } from "react";
import { Modal } from "./Modal";

interface InGameReconnectionModalProps {
  disconnectedPlayers: string[];
  players: { id: string; name: string }[];
  maxWaitSeconds: number;
}

export const InGameReconnectionModal: React.FC<
  InGameReconnectionModalProps
> = ({ disconnectedPlayers, players, maxWaitSeconds }) => {
  const [timeLeft, setTimeLeft] = useState(maxWaitSeconds);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const names = disconnectedPlayers
    .map((id) => players.find((p) => p.id === id)?.name || "Unknown Player")
    .join(", ");

  return (
    <Modal isOpen={true} title="PLAYER DISCONNECTED" variant="warning">
      <p className="terminal-text mb-6">
        <span className="color-accent">{names}</span> lost connection. Waiting
        for them to rejoin...
      </p>

      <div className="flex flex-col items-center gap-2">
        <div
          className="pixel-text glow-text-soft"
          style={{ fontSize: "1.5rem" }}
        >
          {timeLeft}s
        </div>
        <div className="terminal-text color-dim text-sm">
          GAME WILL END IF THEY DON'T RETURN
        </div>
      </div>

      <div className="mt-8">
        <div className="loading-bar">
          <div
            className="loading-bar-fill bg-warning"
            style={{ width: `${(timeLeft / maxWaitSeconds) * 100}%` }}
          />
        </div>
      </div>
    </Modal>
  );
};
