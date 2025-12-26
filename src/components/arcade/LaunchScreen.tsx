import { useCallback, useEffect, useState } from "react";
import { audio } from "../../sound/audio";
import { CRTScreen } from "./CRTScreen";

interface LaunchScreenProps {
  onStart: () => void;
  defaultName: string;
  onNameChange: (name: string) => void;
}

/**
 * Launch screen with game logo, name input, and "Press Start" prompt.
 */
export function LaunchScreen({
  onStart,
  defaultName,
  onNameChange,
}: LaunchScreenProps) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState("");

  const handleStart = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("PLEASE ENTER A NAME");
      audio.playErr();
      return;
    }
    if (trimmedName.length > 10) {
      setError("MAX 10 CHARACTERS");
      audio.playErr();
      return;
    }
    // Play start sound (use win SFX as requested)
    audio.playWin();
    onNameChange(trimmedName);
    onStart();
  }, [name, onNameChange, onStart]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        handleStart();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleStart]);

  return (
    <CRTScreen>
      <div
        className="flex-center flex-col gap-4"
        style={{ padding: "3rem 1rem" }}
      >
        {/* Logo */}
        <div className="text-center">
          <div className="logo-text">EZP2P</div>
          <div
            className="pixel-text color-secondary"
            style={{
              fontSize: "0.75rem",
              marginTop: "0.5rem",
              letterSpacing: "4px",
            }}
          >
            ARCADE
          </div>
        </div>

        {/* Name Input */}
        <div
          className="flex-center flex-col gap-2"
          style={{ marginTop: "2rem" }}
        >
          <label
            className="pixel-text"
            style={{
              fontSize: "0.75rem",
              color: "var(--arcade-text-dim)",
              textAlign: "center",
            }}
          >
            WHAT IS YOUR NAME, PLAYER?
          </label>
          <input
            type="text"
            name="player-name"
            className="arcade-input"
            value={name}
            onChange={(e) => {
              setName(e.target.value.toUpperCase().slice(0, 16));
              setError("");
            }}
            placeholder="PLAYER123"
            maxLength={10}
            style={{ textAlign: "center", width: "100%", maxWidth: "240px" }}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          {error && (
            <div
              className="pixel-text"
              style={{ fontSize: "0.625rem", color: "var(--arcade-warning)" }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Press Start */}
        <div
          className="pixel-text blink"
          style={{
            marginTop: "2rem",
            fontSize: "1rem",
            color: "var(--arcade-accent)",
            textShadow: "0 0 10px var(--glow-accent)",
            cursor: "pointer",
          }}
          onClick={handleStart}
        >
          PRESS START
        </div>
      </div>
    </CRTScreen>
  );
}
