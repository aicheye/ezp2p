import type { DataConnection } from "peerjs";
import type {
  GameMessagePayload,
  JoinRejectReason,
  LobbyMessage,
  LobbySettings,
  PendingJoinRequest,
  PlayerInfo,
} from "./types";
import { createMessage } from "./types";

export interface PeerContext {
  // State Types
  isHost: boolean;
  localPlayerId: string;
  players: PlayerInfo[];
  selectedGame: string | null;
  lobbySettings: LobbySettings;
  isGameStarted: boolean;
  pendingRequests: PendingJoinRequest[];

  // Refs (Mutable state)
  rateLimit: Map<string, { count: number; resetAt: number }>;
  connections: Map<string, DataConnection>;
  peerIdToLogicalId: Map<string, string>;
  hostConnection: DataConnection | null;
  sessionTokens: Map<string, string>;
  reconnectionTimers: Map<string, ReturnType<typeof setTimeout>>;
  mySessionToken: string | null;

  // Setters / Actions
  setPlayers: React.Dispatch<React.SetStateAction<PlayerInfo[]>>;
  setPendingRequests: React.Dispatch<
    React.SetStateAction<PendingJoinRequest[]>
  >;
  setJoinStatus: React.Dispatch<
    React.SetStateAction<
      JoinRejectReason | "connecting" | "waiting-approval" | null
    >
  >;
  setStatus: React.Dispatch<
    React.SetStateAction<"disconnected" | "connecting" | "connected" | "error">
  >;
  setSelectedGame: React.Dispatch<React.SetStateAction<string | null>>;
  setLobbySettings: React.Dispatch<React.SetStateAction<LobbySettings>>;
  setIsGameStarted: React.Dispatch<React.SetStateAction<boolean>>;
  setLastGameMessage: React.Dispatch<
    React.SetStateAction<GameMessagePayload | null>
  >;
  setError: React.Dispatch<React.SetStateAction<string | null>>;

  // Complexity Helpers
  cleanup: (options?: { keepError?: boolean; keepState?: boolean }) => void;
  broadcast: (message: LobbyMessage, excludeId?: string) => void;
  sendToHost: (message: LobbyMessage) => void;
  createMessage: typeof createMessage;
}
