import { useCallback, useEffect, useState } from "react";
import { extractCodeFromUrl } from "../../networking/lobbyCode";
import { CRTScreen } from "./CRTScreen";

export type MenuAction = "create" | "join" | "browse";

interface MainMenuProps {
  onSelect: (action: MenuAction, lobbyCode?: string) => void;
  playerName: string;
  onNameChange: (name: string) => void;
}

/**
 * Main menu with Create/Join/Browse lobby options.
 * Supports keyboard navigation with W/S, Up/Down arrows, and Enter/Space to select.
 */
export function MainMenu({
  onSelect,
  playerName,
  onNameChange,
}: MainMenuProps) {
  const menuItems = [
    { label: "CREATE LOBBY", action: "create" },
    { label: "JOIN LOBBY", action: "join-input" },
    { label: "EDIT NAME (" + playerName + ")", action: "edit-name" },
    { label: "PUBLIC LOBBIES", action: "browse" },
  ] as const;

  const [mode, setMode] = useState<"menu" | "join" | "edit-name">("menu");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [joinCode, setJoinCode] = useState("");
  const [editName, setEditName] = useState(playerName);
  const [error, setError] = useState("");
  const [showComingSoon, setShowComingSoon] = useState(false);

  const handleJoinSubmit = useCallback(() => {
    const code = joinCode.toUpperCase().trim();
    if (code.length !== 6) {
      setError("CODE MUST BE 6 CHARACTERS");
      return;
    }
    if (!/^[A-Z0-9]+$/.test(code)) {
      setError("LETTERS AND NUMBERS ONLY");
      return;
    }
    setError("");
    onSelect("join", code);
  }, [joinCode, onSelect]);

  const handleMenuSelect = useCallback(
    (index: number) => {
      const item = menuItems[index];
      if (item.action === "create") {
        onSelect("create");
      } else if (item.action === "join-input") {
        setMode("join");
      } else if (item.action === "edit-name") {
        setMode("edit-name");
        setEditName(playerName);
      } else if (item.action === "browse") {
        setShowComingSoon(true);
        setTimeout(() => setShowComingSoon(false), 2000);
      }
    },
    [onSelect],
  );

  const handleNameSubmit = useCallback(() => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setError("NAME CANNOT BE EMPTY");
      return;
    }
    onNameChange(trimmed);
    setMode("menu");
    setError("");
  }, [editName, onNameChange]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;

    // Check if this looks like a pasted URL (contains / or .)
    if (rawValue.includes("/") || rawValue.includes(".")) {
      const extractedCode = extractCodeFromUrl(rawValue);
      if (extractedCode) {
        setJoinCode(extractedCode);
        setError("");
        return;
      }
    }

    // Normal input handling
    const value = rawValue
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
    setJoinCode(value);
    setError("");
  };

  // Keyboard navigation
  useEffect(() => {
    if (mode !== "menu") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          e.preventDefault();
          setSelectedIndex(
            (prev) => (prev - 1 + menuItems.length) % menuItems.length,
          );
          break;
        case "ArrowDown":
        case "s":
        case "S":
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % menuItems.length);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          handleMenuSelect(selectedIndex);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, selectedIndex, handleMenuSelect]);

  return (
    <CRTScreen>
      <div className="menu-container">
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

        {mode === "menu" ? (
          <>
            {/* Menu Options */}
            <ul className="menu-list">
              {menuItems.map((item, index) => (
                <li
                  key={item.action}
                  className={`menu-item menu-item--interactive ${selectedIndex === index ? "menu-item--selected" : ""}`}
                  onClick={() => handleMenuSelect(index)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  {item.label}
                  {item.action === "browse" && showComingSoon && (
                    <span
                      style={{
                        display: "block",
                        marginTop: "0.5rem",
                        fontSize: "0.625rem",
                        color: "var(--arcade-accent)",
                        textShadow: "0 0 8px currentColor",
                      }}
                    >
                      COMING SOON
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {/* Instructions */}
            <p
              className="terminal-text color-dim mt-auto"
              style={{ fontSize: "1rem" }}
            >
              USE ↑↓ OR W/S TO SELECT · ENTER TO CONFIRM
            </p>
          </>
        ) : mode === "join" ? (
          <>
            {/* Join Lobby Form */}
            <input
              type="text"
              className="arcade-input lobby-code-input"
              value={joinCode}
              onChange={handleCodeChange}
              placeholder="______"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleJoinSubmit()}
            />

            {error && (
              <p
                style={{
                  color: "var(--arcade-warning)",
                  fontSize: "0.75rem",
                  textAlign: "center",
                }}
                className="pixel-text"
              >
                {error}
              </p>
            )}

            <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
              <button className="arcade-btn" onClick={handleJoinSubmit}>
                JOIN
              </button>
              <button
                className="arcade-btn arcade-btn--secondary"
                onClick={() => {
                  setMode("menu");
                  setJoinCode("");
                  setError("");
                }}
              >
                BACK
              </button>
            </div>
          </>
        ) : mode === "edit-name" ? (
          <>
            <div className="flex-center flex-col gap-2">
              <label
                className="pixel-text"
                style={{ fontSize: "0.75rem", color: "var(--arcade-text-dim)" }}
              >
                EDIT PLAYER NAME
              </label>
              <input
                type="text"
                className="arcade-input"
                value={editName}
                onChange={(e) => {
                  setEditName(e.target.value.toUpperCase().slice(0, 10));
                  setError("");
                }}
                maxLength={10}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
                style={{
                  textAlign: "center",
                  width: "100%",
                  maxWidth: "240px",
                }}
              />
              {error && (
                <p
                  style={{
                    color: "var(--arcade-warning)",
                    fontSize: "0.75rem",
                  }}
                  className="pixel-text"
                >
                  {error}
                </p>
              )}
            </div>
            <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
              <button className="arcade-btn" onClick={handleNameSubmit}>
                SAVE
              </button>
              <button
                className="arcade-btn arcade-btn--secondary"
                onClick={() => {
                  setMode("menu");
                  setError("");
                }}
              >
                CANCEL
              </button>
            </div>
          </>
        ) : null}
      </div>
    </CRTScreen>
  );
}
