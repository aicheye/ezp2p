import { DotsAndBoxes } from "./dots-and-boxes/index";
import { Quoridor } from "./quoridor/index";
import { TicTacToe } from "./tic-tac-toe/index";
import type { GameDefinition } from "./types";

/**
 * Central registry of all available games.
 * Add new games here to make them available in the lobby.
 */
export const gameRegistry: GameDefinition[] = [DotsAndBoxes, Quoridor, TicTacToe];

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
