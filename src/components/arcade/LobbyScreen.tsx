import { useState } from "react";
import type { GameDefinition } from "../../games/types";
import type { PendingJoinRequest } from "../../networking/types";
import { audio } from "../../sound/audio";
import { CRTScreen } from "./CRTScreen";

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isReady: boolean;
  isConnected?: boolean;
}

interface LobbyScreenProps {
  lobbyCode: string;
  players: Player[];
  isHost: boolean;
  availableGames: GameDefinition[];
  selectedGame: string | null;
  onSelectGame: (gameId: string) => void;
  onStartGame: () => void;
  onLeaveLobby: () => void;
  onToggleReady?: () => void;
  onKickPlayer?: (playerId: string) => void;
  onToggleRequiresRequest?: () => void;
  onApproveRequest?: (playerId: string) => void;
  onDenyRequest?: (playerId: string) => void;
  requiresRequest?: boolean;
  pendingRequests?: PendingJoinRequest[];
  connectionStatus: "disconnected" | "connecting" | "connected" | "error";
  localPlayerId?: string;
  onUpdateGameSetting?: (gameId: string, key: string, value: any) => void;
  gameSettings?: Record<string, any>;
}

const PLAYER_COLORS = [
  "var(--player1-color)",
  "var(--player2-color)",
  "var(--player3-color)",
  "var(--player4-color)",
];

/**
 * Lobby screen for player management and game selection.
 */
export function LobbyScreen({
  lobbyCode,
  players,
  isHost,
  availableGames,
  selectedGame,
  onSelectGame,
  onStartGame,
  onLeaveLobby,
  onToggleReady,
  onKickPlayer,
  onToggleRequiresRequest,
  onApproveRequest,
  onDenyRequest,
  requiresRequest = false,
  pendingRequests = [],
  connectionStatus,
  localPlayerId,
  onUpdateGameSetting,
  gameSettings = {},
}: LobbyScreenProps) {
  const [copied, setCopied] = useState(false);

  const selectedGameDef = availableGames.find((g) => g.id === selectedGame);
  const maxPlayers = selectedGameDef?.maxPlayers ?? 4;
  const minPlayers = selectedGameDef?.minPlayers ?? 2;
  const allReady =
    players.length >= minPlayers && players.every((p) => p.isReady);
  const tooManyPlayers = selectedGame && players.length > maxPlayers;
  const canStart = isHost && selectedGame && allReady && !tooManyPlayers;

  const localPlayer = players.find((p) => p.id === localPlayerId);

  const handleCopyCode = async () => {
    try {
      const url = `${window.location.origin}/?code=${encodeURIComponent(
        lobbyCode,
      )}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      audio.playPoint();
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      // Play error sound for failed copy
      try {
        // lazy import to avoid circular issues
        const { audio } = await import("../../sound/audio");
        audio.playErr();
      } catch { }
    }
  };

  const getStatusText = () => {
    if (connectionStatus === "error") return "ERR::CONNECTION_FAILED";
    if (connectionStatus === "connecting") return "CONNECTING...";
    return "ALL SYSTEMS ONLINE";
  };

  const getStatusColor = () => {
    if (connectionStatus === "error") return "var(--arcade-danger)";
    if (connectionStatus === "connecting") return "var(--arcade-warning)";
    return "var(--arcade-primary)";
  };

  return (
    <CRTScreen>
      <div className="lobby-container">
        {/* Header */}
        <div className="lobby-header">
          <div>
            <h2>LOBBY:</h2>
            <div
              className="pixel-text glow-text-soft"
              style={{
                fontSize: "1.5rem",
                color: "var(--arcade-primary)",
                letterSpacing: "8px",
                cursor: "pointer",
                position: "relative",
              }}
              onClick={handleCopyCode}
              title="Click to copy"
            >
              {lobbyCode}
              {copied && (
                <span
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: "0%",
                    fontSize: "0.5rem",
                    color: "var(--arcade-accent)",
                    whiteSpace: "nowrap",
                  }}
                >
                  URL COPIED!
                </span>
              )}
            </div>
          </div>

          <div className="lobby-header__right">
            <div
              className="terminal-text glow-text blink"
              style={{ fontSize: "1.25rem", color: getStatusColor() }}
            >
              <span>● </span>
              {getStatusText()}
            </div>
            {/* Lobby Visibility Toggles (Host Only) */}
            {isHost && (
              <div className="open-join-container">
                <label
                  className="terminal-text"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: "pointer",
                    fontSize: "1rem",
                  }}
                >
                  <input
                    type="checkbox"
                    className="arcade-checkbox"
                    checked={requiresRequest}
                    onChange={onToggleRequiresRequest}
                  />
                  REQUEST 2 JOIN
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="lobby-layout">
          {/* Players Panel */}
          <div className="arcade-panel">
            <h3 style={{ marginBottom: "1rem" }}>
              PLAYERS ({players.length}/{maxPlayers})
            </h3>
            <ul style={{ listStyle: "none", flex: 1 }}>
              {/* Pending Join Requests (Host Only) */}
              {isHost &&
                pendingRequests.map((request) => (
                  <li
                    key={`pending-${request.playerId}`}
                    className="terminal-text"
                    style={{
                      padding: "0.5rem 0",
                      borderBottom: "1px solid var(--arcade-text-dim)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      color: "var(--arcade-accent)",
                      opacity: 0.8,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span style={{ fontStyle: "italic" }}>
                        {request.playerName}
                      </span>
                      <span style={{ fontSize: "1rem", opacity: 0.7 }}>
                        REQ
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      {onApproveRequest && (
                        <button
                          className="arcade-btn arcade-btn--small"
                          style={{
                            padding: "0.25rem 0.5rem",
                            fontSize: "0.5rem",
                          }}
                          onClick={() => onApproveRequest(request.playerId)}
                        >
                          ✓
                        </button>
                      )}
                      {onDenyRequest && (
                        <button
                          className="arcade-btn arcade-btn--small arcade-btn--warning"
                          style={{
                            padding: "0.25rem 0.5rem",
                            fontSize: "0.5rem",
                          }}
                          onClick={() => onDenyRequest(request.playerId)}
                        >
                          ✗
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              {/* Connected Players */}
              {players.map((player, index) => (
                <li
                  key={player.id}
                  className="terminal-text"
                  style={{
                    padding: "0.5rem 0",
                    borderBottom: "1px solid var(--arcade-text-dim)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    color: PLAYER_COLORS[index] || "var(--arcade-text)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span>
                      {player.isHost && "★ "}
                      {player.name}
                      {player.id === localPlayerId && " (YOU)"}
                    </span>
                    {isHost && !player.isHost && onKickPlayer && (
                      <button
                        className="arcade-btn arcade-btn--small arcade-btn--warning"
                        style={{
                          padding: "0.25rem 0.25rem 0.25rem 0.4rem",
                          fontSize: "0.5rem",
                        }}
                        onClick={() => onKickPlayer(player.id)}
                      >
                        KICK
                      </button>
                    )}
                  </div>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    {player.isConnected === false ? (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--arcade-danger)",
                          fontWeight: "bold",
                        }}
                        className="blink-fast"
                      >
                        ● DISCONNECTED
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          opacity: player.isReady ? 1 : 0.5,
                          color: player.isReady
                            ? "var(--arcade-primary)"
                            : "var(--arcade-text-dim)",
                        }}
                      >
                        {player.isReady ? "● READY" : "○ NOT READY"}
                      </span>
                    )}
                  </span>
                </li>
              ))}
              {players.length < minPlayers && (
                <li
                  className="terminal-text blink color-dim"
                  style={{ padding: "0.5rem 0" }}
                >
                  WAITING FOR PLAYERS...
                </li>
              )}
            </ul>

            {/* Ready Toggle */}
            {onToggleReady && localPlayer && (
              <button
                className={`arcade-btn ${localPlayer.isReady ? "arcade-btn--secondary" : ""}`}
                style={{ marginTop: "1rem", width: "100%" }}
                onClick={onToggleReady}
              >
                {localPlayer.isReady ? "CANCEL READY" : "READY UP"}
              </button>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: "1rem",
              flexDirection: "column",
              width: "100%",
              alignItems: "center",
            }}
          >
            {/* Game Selection Panel */}
            <div
              className="arcade-panel"
              style={{ flex: 1, minHeight: "fit-content" }}
            >
              <h3>GAMES AVAILABLE:</h3>
              <p
                className="terminal-text color-dim"
                style={{ fontSize: "0.875rem", marginBottom: "1rem" }}
              >
                {!isHost && "Host Selects Game"}
              </p>
              <ul className="menu-list" style={{ gap: "0.5rem" }}>
                {availableGames.map((game) => (
                  <li
                    key={game.id}
                    className={`menu-item ${selectedGame === game.id ? "menu-item--selected" : ""} ${isHost ? "menu-item--interactive" : ""}`}
                    style={{
                      padding: "0.75rem 1rem 0.75rem 2rem",
                      fontSize: "0.75rem",
                      textAlign: "left",
                    }}
                    onClick={() => {
                      if (!isHost) return;
                      audio.playClick();
                      onSelectGame(game.id);
                    }}
                  >
                    <div>{game.name}</div>
                    <div
                      className="terminal-text color-dim"
                      style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}
                    >
                      {game.maxPlayers !== game.minPlayers
                        ? `${game.minPlayers}-${game.maxPlayers}`
                        : game.maxPlayers}{" "}
                      PLAYERS
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Selected Game Info */}
            {selectedGameDef && (
              <div
                className="arcade-panel arcade-panel--glow"
                style={{
                  padding: "1.0rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  alignItems: "center",
                  minHeight: "fit-content",
                }}
              >
                <div className="terminal-text" style={{ fontSize: "1.5rem" }}>
                  SELECTED: {selectedGameDef.name}
                </div>

                {/* Dynamic Game Settings */}
                {selectedGameDef.settingsComponent && (
                  <selectedGameDef.settingsComponent
                    isHost={isHost}
                    settings={gameSettings[selectedGameDef.id] || {}}
                    onUpdateSetting={(key, value) =>
                      onUpdateGameSetting?.(selectedGameDef.id, key, value)
                    }
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div
          className="lobby-actions"
          style={{ display: "flex", justifyContent: "center", gap: "1rem" }}
        >
          {isHost ? (
            <button
              className={`arcade-btn ${canStart ? "" : "arcade-btn--disabled"}`}
              onClick={() => { if (canStart) { onStartGame(); } }}
              disabled={!canStart}
              style={{ opacity: canStart ? 1 : 0.5 }}
            >
              {!selectedGame
                ? "SELECT A GAME"
                : tooManyPlayers
                  ? "TOO MANY PLAYERS"
                  : players.length < minPlayers
                    ? "NEED MORE PLAYERS"
                    : !players.every((p) => p.isReady)
                      ? "WAITING ON READY"
                      : "START GAME"}
            </button>
          ) : (
            <button
              className="arcade-btn arcade-btn--disabled"
              style={{ opacity: 0.5, fontSize: "0.75rem" }}
            >
              WAITING FOR HOST
            </button>
          )}
          <button
            className="arcade-btn arcade-btn--secondary"
            onClick={() => { onLeaveLobby() }}
          >
            LEAVE
          </button>
        </div>
      </div>
    </CRTScreen>
  );
}
