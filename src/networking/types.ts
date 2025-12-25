import { z } from "zod";

/**
 * Basic Schemas
 */

export const PlayerInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  isHost: z.boolean(),
  isReady: z.boolean().optional(),
  isConnected: z.boolean().optional(),
  isInGame: z.boolean().optional(),
});

export const LobbySettingsSchema = z.object({
  requiresRequest: z.boolean(),
  gameSettings: z.record(z.string(), z.any()), // Allow lenient settings for now, or stricter if possible
});

export const PendingJoinRequestSchema = z.object({
  playerId: z.string(),
  playerName: z.string(),
  timestamp: z.number(),
});

/**
 * Payload Schemas
 */

export const JoinRequestPayloadSchema = z.object({
  playerName: z.string(),
  playerId: z.string(),
  sessionToken: z.string().nullable().optional(),
});

export const JoinAcceptedPayloadSchema = z.object({
  players: z.array(PlayerInfoSchema),
  selectedGame: z.string().nullable(),
  lobbySettings: LobbySettingsSchema,
  isGameStarted: z.boolean().optional(),
  sessionToken: z.string().nullable().optional(),
});

export const JoinRejectReasonSchema = z.enum([
  "not-found",
  "capacity-reached",
  "in-game",
  "denied",
]);

export const JoinRejectedPayloadSchema = z.object({
  reason: JoinRejectReasonSchema,
});

export const PlayerJoinedPayloadSchema = z.object({
  player: PlayerInfoSchema,
});

export const PlayerLeftPayloadSchema = z.object({
  playerId: z.string(),
});

export const PlayerReadyPayloadSchema = z.object({
  playerId: z.string(),
  isReady: z.boolean(),
});

export const PlayerKickedPayloadSchema = z.object({
  playerId: z.string(),
});

export const GameSelectedPayloadSchema = z.object({
  gameId: z.string(),
});

export const GameStartPayloadSchema = z.object({
  gameId: z.string(),
  players: z.array(PlayerInfoSchema),
  initialState: z.unknown().optional(),
});

export const GameMessagePayloadSchema = z.object({
  type: z.string(),
  data: z.unknown(),
  senderId: z.string().optional(),
});

export const GameForfeitPayloadSchema = z.object({
  playerId: z.string(),
});

export const LobbySettingsPayloadSchema = z.object({
  settings: LobbySettingsSchema,
});

/**
 * Message Types and Union Schema
 */

const BaseMessageSchema = z.object({
  senderId: z.string().min(1),
  timestamp: z.number(),
});

// We construct the discriminated union manually for better Type inference and readability
export const LobbyMessageSchema = z.discriminatedUnion("type", [
  BaseMessageSchema.extend({
    type: z.literal("join-request"),
    payload: JoinRequestPayloadSchema,
  }),
  BaseMessageSchema.extend({
    type: z.literal("join-accepted"),
    payload: JoinAcceptedPayloadSchema,
  }),
  BaseMessageSchema.extend({
    type: z.literal("join-rejected"),
    payload: JoinRejectedPayloadSchema,
  }),
  BaseMessageSchema.extend({
    type: z.literal("join-pending"),
    payload: z.object({}),
  }),
  BaseMessageSchema.extend({
    type: z.literal("join-approved"),
    payload: z.object({}),
  }),
  BaseMessageSchema.extend({
    type: z.literal("join-denied"),
    payload: z.object({}),
  }),
  BaseMessageSchema.extend({
    type: z.literal("player-joined"),
    payload: PlayerJoinedPayloadSchema,
  }),
  BaseMessageSchema.extend({
    type: z.literal("player-left"),
    payload: PlayerLeftPayloadSchema,
  }),
  BaseMessageSchema.extend({
    type: z.literal("player-ready"),
    payload: PlayerReadyPayloadSchema,
  }),
  BaseMessageSchema.extend({
    type: z.literal("player-kicked"),
    payload: PlayerKickedPayloadSchema,
  }),
  BaseMessageSchema.extend({
    type: z.literal("host-left"),
    payload: z.object({}),
  }),
  BaseMessageSchema.extend({
    type: z.literal("game-selected"),
    payload: GameSelectedPayloadSchema,
  }),
  BaseMessageSchema.extend({
    type: z.literal("game-start"),
    payload: GameStartPayloadSchema,
  }),
  BaseMessageSchema.extend({
    type: z.literal("game-message"),
    payload: GameMessagePayloadSchema,
  }),
  BaseMessageSchema.extend({
    type: z.literal("game-forfeit"),
    payload: GameForfeitPayloadSchema,
  }),
  BaseMessageSchema.extend({
    type: z.literal("lobby-settings"),
    payload: LobbySettingsPayloadSchema,
  }),
  BaseMessageSchema.extend({ type: z.literal("ping"), payload: z.unknown() }),
  BaseMessageSchema.extend({ type: z.literal("pong"), payload: z.unknown() }),
]);

/**
 * Inferred Types
 */

export type LobbyMessage = z.infer<typeof LobbyMessageSchema>;
export type LobbyMessageType = LobbyMessage["type"];

export type PlayerInfo = z.infer<typeof PlayerInfoSchema>;
export type LobbySettings = z.infer<typeof LobbySettingsSchema>;
export type PendingJoinRequest = z.infer<typeof PendingJoinRequestSchema>;
export type JoinRejectReason = z.infer<typeof JoinRejectReasonSchema>;

export type JoinRequestPayload = z.infer<typeof JoinRequestPayloadSchema>;
export type JoinAcceptedPayload = z.infer<typeof JoinAcceptedPayloadSchema>;
export type JoinRejectedPayload = z.infer<typeof JoinRejectedPayloadSchema>;
export type PlayerJoinedPayload = z.infer<typeof PlayerJoinedPayloadSchema>;
export type PlayerLeftPayload = z.infer<typeof PlayerLeftPayloadSchema>;
export type PlayerReadyPayload = z.infer<typeof PlayerReadyPayloadSchema>;
export type PlayerKickedPayload = z.infer<typeof PlayerKickedPayloadSchema>;
export type GameSelectedPayload = z.infer<typeof GameSelectedPayloadSchema>;
export type GameStartPayload = z.infer<typeof GameStartPayloadSchema>;
export type GameMessagePayload = z.infer<typeof GameMessagePayloadSchema>;
export type GameForfeitPayload = z.infer<typeof GameForfeitPayloadSchema>;
export type LobbySettingsPayload = z.infer<typeof LobbySettingsPayloadSchema>;

/**
 * Helpers
 */

export function createMessage<T>(
  type: LobbyMessageType,
  payload: T,
  senderId: string,
): LobbyMessage {
  return {
    type,
    payload: payload as any, // Cast because generic T makes strict inference hard here without a map
    senderId,
    timestamp: Date.now(),
  } as LobbyMessage;
}

/**
 * SECURITY: Validate incoming message structure using Zod.
 * Returns the validated message or null if invalid.
 */
export function validateMessage(data: unknown): LobbyMessage | null {
  const result = LobbyMessageSchema.safeParse(data);

  if (!result.success) {
    console.warn(
      "[P2P] SECURITY: Invalid message structure:",
      result.error.format(),
    );
    return null;
  }

  return result.data;
}
