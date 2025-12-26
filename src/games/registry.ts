import { DotsAndBoxes } from "./dots-and-boxes/index";
import { TicTacToe } from "./tic-tac-toe/index";
import { Quoridor } from "./quoridor/index";
import type { GameDefinition } from "./types";

/**
 * Central registry of all available games.
 * Add new games here to make them available in the lobby.
 */
export const gameRegistry: GameDefinition[] = [DotsAndBoxes, TicTacToe, Quoridor];

/**
 * Get a game definition by ID.
 */
export function getGame(id: string): GameDefinition | undefined {
  return gameRegistry.find((game) => game.id === id);
}

/**
 * Get all available games.
 */
export function getAllGames(): GameDefinition[] {
  return gameRegistry;
}
