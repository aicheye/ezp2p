import type React from "react";

/**
 * Game definition for the registry.
 * Each game must implement this interface to be playable.
 */
export interface GameDefinition {
  /** Unique identifier for the game */
  id: string;
  /** Display name */
  name: string;
  /** Minimum players required */
  minPlayers: number;
  /** Maximum players supported */
  maxPlayers: number;
  /** Short description */
  description: string;
  /** The game component to render */
  component: React.ComponentType<GameProps>;
  /** Optional component for game-specific settings in the lobby */
  settingsComponent?: React.ComponentType<GameSettingsProps>;
  /** Validator for moves to prevent cheating. If provided, the game engine will enforce consensus. */
  validateMove?: (state: any, move: any, playerIndex: number) => boolean;
}

/**
 * Props passed to game settings component in lobby.
 */
export interface GameSettingsProps {
  /** Whether the local player is the host */
  isHost: boolean;
  /** Current settings for this game */
  settings: Record<string, any>;
  /** Callback to update a setting */
  onUpdateSetting: (key: string, value: any) => void;
}

/**
 * Props passed to every game component.
 */
export interface GameProps {
  /** List of players in the game */
  players: GamePlayer[];
  /** ID of the local player */
  localPlayerId: string;
  /** Whether it's currently this player's turn */
  isMyTurn: boolean;
  /** Send a game message to peers */
  sendMessage: (message: GameMessage) => void;
  /** Latest message received from peers */
  lastMessage: GameMessage | null;
  /** Callback when game ends */
  onGameEnd: (result: GameResult) => void;
  /** Callback to forfeit the game */
  onForfeit?: () => void;
  /** Callback to exit game and return to menu (cleans up connection) */
  onExit?: () => void;
  /** Callback to return to lobby (keeps connection) */
  onReturnToLobby?: () => void;
  /** IDs of players who have disconnected (for multi-player support) */
  disconnectedPlayerIds?: string[];
  /** Custom settings for this specific game (e.g. grid size) */
  gameSettings?: Record<string, any>;
}

/**
 * Player in a game session.
 */
export interface GamePlayer {
  id: string;
  name: string;
  index: number; // 0 for P1, 1 for P2, etc.
  isHost: boolean;
  isConnected?: boolean; // True if player is still connected
}

/**
 * Generic game message sent between peers.
 */
export interface GameMessage {
  type: string;
  payload: unknown;
  senderId: string;
  timestamp: number;
}

/**
 * Result when a game ends.
 */
export interface GameResult {
  winnerId: string | null; // null for draw
  scores: Record<string, number>;
  reason: "complete" | "forfeit" | "disconnect";
}
