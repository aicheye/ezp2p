import { Analytics } from '@vercel/analytics/react';
import { useCallback, useEffect, useRef, useState } from "react";
import type { MenuAction } from "./components/arcade";
import {
  BootScreen,
  CRTScreen,
  InGameReconnectionModal,
  JoinStatusModal,
  LaunchScreen,
  LobbyScreen,
  MainMenu,
  Modal,
} from "./components/arcade";
import { getAllGames, getGame } from "./games/registry";
import type { GameMessage, GameProps } from "./games/types";
import "./index.css";
import { usePeer } from "./networking";
import { isValidLobbyCode } from "./networking/lobbyCode";
import { audio } from "./sound/audio";

type Screen = "boot" | "launch" | "menu" | "lobby" | "game";

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("boot");
  const [powerOn, setPowerOn] = useState(false);
  const [powerHover, setPowerHover] = useState(false);
  const [powerPressed, setPowerPressed] = useState(false);
  const powerTimeoutRef = useRef<number | null>(null);
  const lastPowerSfxRef = useRef<number>(0);
  const [playerName, setPlayerName] = useState(() => {
    // Try session first (this tab), then local (across tabs)
    return (
      sessionStorage.getItem("ezp2p-playerName") ||
      localStorage.getItem("ezp2p-playerName") ||
      `PLAYER${Math.floor(Math.random() * 1000)}`
    );
  });
  const [localPlayerId] = useState(() => {
    // Use sessionStorage so each tab gets a unique ID
    const saved = sessionStorage.getItem("ezp2p-playerId");
    if (saved) return saved;
    const newId = `ezp-ptr-${Math.floor(Math.random() * 1000000)}`;
    sessionStorage.setItem("ezp2p-playerId", newId);
    return newId;
  });
  // Initialize peer networking
  const peer = usePeer({ playerName, playerId: localPlayerId });
  // Handle name updates
  const handleUpdateName = useCallback((newName: string) => {
    const formattedName = newName.trim().slice(0, 10);
    setPlayerName(formattedName);
    sessionStorage.setItem("ezp2p-playerName", formattedName);
    localStorage.setItem("ezp2p-playerName", formattedName);
  }, []);

  // Handle menu selection (create/join/browse)
  const handleMenuSelect = useCallback(
    (action: MenuAction, lobbyCode?: string) => {
      switch (action) {
        case "create":
          peer.createLobby();
          setCurrentScreen("lobby");
          break;
        case "join":
          if (lobbyCode) {
            peer.joinLobby(lobbyCode);
            setCurrentScreen("lobby");
          }
          break;
        case "browse":
        default:
          break;
      }
    },
    [peer],
  );
  // Handle boot complete
  const handleBootComplete = useCallback(() => {
    setCurrentScreen("launch");
  }, []);

  // Handle launch start
  const handleLaunchStart = useCallback(() => {
    setCurrentScreen("menu");
  }, []);

  // (menu selection handled above)

  // Handle game selection
  const handleSelectGame = useCallback(
    (gameId: string) => {
      peer.selectGame(gameId);
    },
    [peer],
  );

  // Handle game start
  const handleStartGame = useCallback(() => {
    peer.startGame();
  }, [peer]);

  // Handle leaving lobby (either cancel join or host leaving)
  const handleLeaveLobby = useCallback(() => {
    try {
      peer.leaveLobby();
    } catch {}
    setCurrentScreen("menu");
  }, [peer]);

  // Handle ready toggle
  const handleToggleReady = useCallback(() => {
    peer.toggleReady();
  }, [peer]);

  // Handle kick player
  const handleKickPlayer = useCallback(
    (playerId: string) => {
      peer.kickPlayer(playerId);
    },
    [peer],
  );

  // Handle game end
  const handleGameEnd = useCallback(() => {
    // For now, just go back to lobby
    // TODO: Show results screen
  }, []);

  // Handle forfeit (local player forfeits)
  const handleForfeit = useCallback(() => {
    // Game component handles sending the message
    // Reset game state and go back to lobby so players can rematch
    peer.resetGame();
    setCurrentScreen("lobby");
  }, [peer]);

  // Handle exit game (after game over or opponent left/forfeited)
  const handleExitGame = useCallback(() => {
    // Go back to menu and clean up - the peer connection may be stale
    peer.resetGame();
    setCurrentScreen("menu");
    peer.leaveLobby();
  }, [peer]);

  // Watch for game start
  useEffect(() => {
    if (peer.isGameStarted && currentScreen !== "game") {
      setCurrentScreen("game");
    }
  }, [peer.isGameStarted, currentScreen]);

  // Initialize audio and manage music/startup based on screen
  useEffect(() => {
    audio.init();
    // Play startup whenever we are on boot screen and user powered on
    if (currentScreen === "boot" && powerOn) {
      audio.playStartup();
    } else {
      audio.stopStartup();
    }

    // Music handling (also play menu music on launch screen)
    if (currentScreen === "menu" || currentScreen === "lobby" || currentScreen === "launch") {
      audio.playMenuMusic();
    } else if (currentScreen === "game") {
      audio.playGameMusic();
    } else {
      audio.stopMusic();
    }

    return () => {
      // keep music running between renders; stop on unmount
    };
  }, [currentScreen, powerOn]);

  // Clear any pending power timeout on unmount
  useEffect(() => {
    return () => {
      if (powerTimeoutRef.current) {
        window.clearTimeout(powerTimeoutRef.current);
        powerTimeoutRef.current = null;
      }
    };
  }, []);

  // (power-up is handled directly by the centered button handlers)

  // Watch for connection errors or kicks (while in lobby)
  useEffect(() => {
    // Only kick to menu if disconnected and NOT currently trying to reconnect
    if (peer.status === "disconnected" && currentScreen === "lobby") {
      console.log("[App] Disconnected from lobby, returning to menu");
      setCurrentScreen("menu");
      // Clear URL when disconnected
      window.history.replaceState({}, "", "/");
    }
  }, [peer.status, currentScreen]);

  // Sync URL with lobby code
  useEffect(() => {
    if (currentScreen === "lobby" && peer.lobbyCode) {
      window.history.replaceState({}, "", `/?code=${peer.lobbyCode}`);
    } else if (currentScreen === "menu") {
      // Only update if we're not already at root
      if (window.location.pathname !== "/" || window.location.search !== "") {
        window.history.replaceState({}, "", "/");
      }
    }
  }, [currentScreen, peer.lobbyCode]);

  // No host persistence - lobby closes on reload
  useEffect(() => {
    if (!peer.isHost && currentScreen === "menu") {
      // Clear host items just in case
      sessionStorage.removeItem("ezp2p-isHost");
      sessionStorage.removeItem("ezp2p-hostLobbyCode");
    }
  }, [peer.isHost, currentScreen]);

  // Check URL for lobby code on initial load
  const hasCheckedUrl = useRef(false);
  useEffect(() => {
    if (hasCheckedUrl.current) return;
    hasCheckedUrl.current = true;

    // Clear any old host persistence items
    sessionStorage.removeItem("ezp2p-isHost");
    sessionStorage.removeItem("ezp2p-hostLobbyCode");
    sessionStorage.removeItem("ezp2p-hostSelectedGame");
    sessionStorage.removeItem("ezp2p-hostPlayers");
    sessionStorage.removeItem("ezp2p-hostSettings");

    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get("code")?.toUpperCase();
    if (codeParam && isValidLobbyCode(codeParam)) {
      // Skip boot/launch screens and join/host lobby directly
      setCurrentScreen("menu");
      // Small delay to ensure peer is ready
      setTimeout(() => {
        console.log("[App] Joining lobby from URL:", codeParam);
        peer.joinLobby(codeParam);
        setCurrentScreen("lobby");
      }, 100);
    }
  }, [peer.joinLobby]);

  // Note: Disconnect during game is now handled by peer.players having isConnected=false

  // Get current game component
  const currentGame = peer.selectedGame ? getGame(peer.selectedGame) : null;

  // Get list of disconnected player IDs
  const disconnectedPlayerIds = peer.players
    .filter((p) => p.isConnected === false)
    .map((p) => p.id);

  // Build game props
  const gameProps: GameProps | null =
    currentGame && peer.localPlayerId
      ? {
        players: peer.players.map((p, i) => ({
          id: p.id,
          name: p.name,
          index: i,
          isHost: p.isHost,
          isConnected: p.isConnected !== false, // Default to true if undefined
        })),
        localPlayerId: peer.localPlayerId,
        isMyTurn: peer.players[0]?.id === peer.localPlayerId, // Host goes first
        sendMessage: (message: GameMessage) => {
          peer.sendGameMessage(message.type, message.payload);
        },
        lastMessage: peer.lastGameMessage
          ? {
            type: peer.lastGameMessage.type,
            payload: peer.lastGameMessage.data,
            senderId: peer.lastGameMessage.senderId || "",
            timestamp: Date.now(),
          }
          : null,
        onGameEnd: handleGameEnd,
        onForfeit: handleForfeit,
        onExit: handleExitGame,
        onReturnToLobby: handleForfeit, // Reuse forfeit handler since it goes to lobby
        disconnectedPlayerIds,
        gameSettings: peer.selectedGame
          ? peer.lobbySettings.gameSettings[peer.selectedGame] || {}
          : {},
      }
      : null;

    // Players formatted for LobbyScreen component
    const lobbyPlayers = peer.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isReady: p.isReady ?? false,
      isConnected: p.isConnected !== false,
    }));

  // Render current screen
  const renderScreen = () => {
    switch (currentScreen) {
      case "boot":
        return powerOn ? (
          <BootScreen onComplete={handleBootComplete} />
        ) : (
          <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {/* Centered power icon only during boot-off */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Power Up"
              onPointerDown={() => {
                setPowerPressed(true);
                if (powerTimeoutRef.current) {
                  window.clearTimeout(powerTimeoutRef.current);
                  powerTimeoutRef.current = null;
                }
                const now = Date.now();
                if (now - lastPowerSfxRef.current > 240) {
                  try { audio.playButtonDown(); } catch { }
                  lastPowerSfxRef.current = now;
                }
              }}
              onPointerUp={() => {
                setPowerPressed(false);
                const now = Date.now();
                if (now - lastPowerSfxRef.current > 240) {
                  try { audio.playButtonUp(); } catch { }
                  lastPowerSfxRef.current = now;
                }
                powerTimeoutRef.current = window.setTimeout(() => {
                  setPowerOn(true);
                }, 380);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setPowerPressed(true);
                  if (powerTimeoutRef.current) {
                    window.clearTimeout(powerTimeoutRef.current);
                    powerTimeoutRef.current = null;
                  }
                  const now = Date.now();
                  if (now - lastPowerSfxRef.current > 240) {
                    try { audio.playButtonDown(); } catch { }
                    lastPowerSfxRef.current = now;
                  }
                }
              }}
              onKeyUp={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setPowerPressed(false);
                  const now = Date.now();
                  if (now - lastPowerSfxRef.current > 240) {
                    try { audio.playButtonUp(); } catch { }
                    lastPowerSfxRef.current = now;
                  }
                  powerTimeoutRef.current = window.setTimeout(() => {
                    setPowerOn(true);
                  }, 380);
                }
              }}
              onPointerEnter={() => setPowerHover(true)}
              onPointerLeave={() => setPowerHover(false)}
              style={{
                width: "92px",
                height: "92px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 9999,
                background: "transparent",
                boxShadow: powerPressed
                  ? "0 0 6px 2px rgba(0,0,0,0.2) inset"
                  : powerHover
                    ? "0 0 30px 10px rgba(255,80,80,0.28)"
                    : "0 0 10px 3px rgba(255,60,60,0.06)",
                transition: "box-shadow 100ms ease, transform 80ms ease",
                transform: powerPressed ? "translateY(2px) scale(0.98)" : (powerHover ? "translateY(-2px) scale(1.02)" : "none"),
                border: "1px solid rgba(255,60,60,0.12)",
              }}
            >
              <div
                style={{
                  fontSize: "2.5rem",
                  color: powerPressed ? "#ff9999" : (powerHover ? "#ff6666" : "#ff4d4d"),
                  textShadow: powerPressed ? "0 0 8px rgba(255,100,100,0.45)" : (powerHover ? "0 0 20px rgba(255,100,100,0.65)" : "none"),
                  userSelect: "none",
                }}
              >
                ⏻
              </div>
            </div>
          </div>
        );

      case "launch":
        return (
          <LaunchScreen
            onStart={handleLaunchStart}
            defaultName={playerName}
            onNameChange={handleUpdateName}
          />
        );

      case "menu":
        return (
          <MainMenu
            onSelect={handleMenuSelect}
            playerName={playerName}
            onNameChange={handleUpdateName}
          />
        );

      case "lobby":
        return (
          <LobbyScreen
            lobbyCode={peer.lobbyCode || "----"}
            players={lobbyPlayers}
            isHost={peer.isHost}
            availableGames={getAllGames()}
            selectedGame={peer.selectedGame}
            onSelectGame={handleSelectGame}
            onStartGame={handleStartGame}
            onLeaveLobby={handleLeaveLobby}
            onToggleReady={handleToggleReady}
            onKickPlayer={handleKickPlayer}
            onToggleRequiresRequest={peer.toggleRequiresRequest}
            onApproveRequest={peer.approveJoinRequest}
            onDenyRequest={peer.denyJoinRequest}
            requiresRequest={peer.lobbySettings.requiresRequest}
            pendingRequests={peer.pendingRequests}
            connectionStatus={peer.status}
            localPlayerId={peer.localPlayerId ?? undefined}
            onUpdateGameSetting={peer.updateGameSetting}
            gameSettings={peer.lobbySettings.gameSettings}
          />
        );

      case "game":
        if (currentGame && gameProps) {
          const GameComponent = currentGame.component;
          return (
            <div
              style={{ position: "relative", height: "100%", width: "100%" }}
            >
              <CRTScreen>
                <GameComponent {...gameProps} />
              </CRTScreen>
              {disconnectedPlayerIds.length > 0 && (
                <InGameReconnectionModal
                  disconnectedPlayers={disconnectedPlayerIds}
                  players={peer.players}
                  maxWaitSeconds={5}
                />
              )}
            </div>
          );
        }
        // Fallback if game not found -> show modal
        return (
          <CRTScreen>
            <Modal
              isOpen={true}
              title="GAME NOT FOUND"
              variant="danger"
              onClose={() => setCurrentScreen("menu")}
              actions={
                <button className="arcade-btn" onClick={() => setCurrentScreen("menu")}>
                  RETURN TO MENU
                </button>
              }
            >
              <div className="flex-center flex-col gap-4" style={{ height: "100%" }}>
                <p className="terminal-text color-dim" style={{ fontSize: "1rem" }}>
                  The selected game could not be found. It may have been removed or is not available.
                </p>
              </div>
            </Modal>
          </CRTScreen>
        );

      default:
        return null;
    }
  };

  // Handle error/status modal close
  const handleErrorClose = useCallback(() => {
    peer.clearError();
    // If we're waiting for approval, cancelling should leave the lobby (cancel request)
    if (peer.joinStatus === "waiting-approval") {
      peer.leaveLobby();
      setCurrentScreen("menu"); // Go back to menu
    }
    // If we were denied or kicked, we should probably go back to menu
    if (peer.joinStatus === "denied" || peer.error) {
      setCurrentScreen("menu");
    }
  }, [peer]);

  // Show status modal if there's an error or relevant join status
  // We don't show it for 'connecting' as that's handled by the UI state usually,
  // but if we want a specific modal for it we could.
  // For now, we only show for errors, denials, capacity, etc.
  return (
    <>
      {renderScreen()}
      {(peer.error ||
        (peer.joinStatus && peer.joinStatus !== "connecting")) && (
          <JoinStatusModal
            status={peer.joinStatus}
            error={peer.error}
            onClose={handleErrorClose}
          />
        )}
      <Analytics />
    </>
  );
}

export default App;
