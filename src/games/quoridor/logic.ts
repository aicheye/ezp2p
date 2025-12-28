/**
 * Quoridor game logic.
 * Pure functions for game state management.
 */


export interface Position {
  row: number;
  col: number;
}

export interface Wall {
  /** Top-left corner position of the wall */
  row: number;
  col: number;
  /** Orientation: horizontal walls block vertical movement, vertical walls block horizontal movement */
  orientation: "horizontal" | "vertical";
}

export interface QuoridorState {
  /** Board size (9x9 standard) */
  gridSize: number;
  /** Pawn positions for each player (0-indexed) */
  pawns: Position[];
  /** List of placed walls */
  walls: Wall[];
  /** Walls remaining for each player */
  wallsRemaining: number[];
  /** Current player index */
  currentPlayer: number;
  /** Whether the game is over */
  isGameOver: boolean;
  /** Winner index (null if game not over or draw) */
  winner: number | null;
}

export interface PawnMove {
  type: "pawn";
  to: Position;
  playerId: number;
}

export interface WallMove {
  type: "wall";
  wall: Wall;
  playerId: number;
}

export type Move = PawnMove | WallMove;

/**
 * Create initial game state.
 */
export function createInitialState(playerCount: number = 2): QuoridorState {
  // Validate player count
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 2) {
    console.warn("[Quoridor] Only 2 players supported, defaulting to 2");
    playerCount = 2;
  }

  const gridSize = 9;
  const midCol = Math.floor(gridSize / 2);

  return {
    gridSize,
    pawns: [
      { row: gridSize - 1, col: midCol }, // P1 starts at bottom center
      { row: 0, col: midCol }, // P2 starts at top center
    ],
    walls: [],
    wallsRemaining: [10, 10], // Each player gets 10 walls
    currentPlayer: 0,
    isGameOver: false,
    winner: null,
  };
}

/**
 * Get goal row for a player.
 * P1 (index 0) wins by reaching row 0 (top).
 * P2 (index 1) wins by reaching row 8 (bottom).
 */
export function getGoalRow(playerIndex: number, gridSize: number): number {
  return playerIndex === 0 ? 0 : gridSize - 1;
}

/**
 * Check if a wall blocks movement between two adjacent cells.
 */
function wallBlocksMovement(
  walls: Wall[],
  from: Position,
  to: Position
): boolean {
  // For each wall, explicitly enumerate the two adjacent cell pairs it blocks.
  for (const wall of walls) {
    if (wall.orientation === "horizontal") {
      // Blocks movement between (r - 1, c) <-> (r, c) and (r - 1, c+1) <-> (r, c+1)
      const a1 = { row: wall.row - 1, col: wall.col };
      const b1 = { row: wall.row, col: wall.col };
      const a2 = { row: wall.row - 1, col: wall.col + 1 };
      const b2 = { row: wall.row, col: wall.col + 1 };

      if (
        (from.row === a1.row && from.col === a1.col && to.row === b1.row && to.col === b1.col) ||
        (from.row === b1.row && from.col === b1.col && to.row === a1.row && to.col === a1.col) ||
        (from.row === a2.row && from.col === a2.col && to.row === b2.row && to.col === b2.col) ||
        (from.row === b2.row && from.col === b2.col && to.row === a2.row && to.col === a2.col)
      ) {
        return true;
      }
    } else {
      // Vertical: blocks (r, c - 1) <-> (r, c) and (r+1, c - 1) <-> (r+1, c)
      const a1 = { row: wall.row, col: wall.col - 1 };
      const b1 = { row: wall.row, col: wall.col };
      const a2 = { row: wall.row + 1, col: wall.col - 1 };
      const b2 = { row: wall.row + 1, col: wall.col };
      if (
        (from.row === a1.row && from.col === a1.col && to.row === b1.row && to.col === b1.col) ||
        (from.row === b1.row && from.col === b1.col && to.row === a1.row && to.col === a1.col) ||
        (from.row === a2.row && from.col === a2.col && to.row === b2.row && to.col === b2.col) ||
        (from.row === b2.row && from.col === b2.col && to.row === a2.row && to.col === a2.col)
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if two cells are adjacent and not blocked by a wall.
 */
function canMoveBetween(
  state: QuoridorState,
  from: Position,
  to: Position
): boolean {
  const { gridSize, walls } = state;

  // Check bounds
  if (to.row < 0 || to.row >= gridSize || to.col < 0 || to.col >= gridSize) {
    return false;
  }

  // Check if adjacent (orthogonal only)
  const dr = Math.abs(to.row - from.row);
  const dc = Math.abs(to.col - from.col);
  if (!((dr === 1 && dc === 0) || (dr === 0 && dc === 1))) {
    return false;
  }

  // Check for wall blocking
  return !wallBlocksMovement(walls, from, to);
}

/**
 * Get valid pawn moves for a player.
 * Includes normal moves and jumps over opponent.
 */
export function getValidPawnMoves(
  state: QuoridorState,
  playerIndex: number
): Position[] {
  const { pawns } = state;
  const myPos = pawns[playerIndex];
  const opponentPos = pawns[1 - playerIndex];
  const validMoves: Position[] = [];

  const directions = [
    { dr: -1, dc: 0 }, // North
    { dr: 1, dc: 0 }, // South
    { dr: 0, dc: -1 }, // West
    { dr: 0, dc: 1 }, // East
  ];

  for (const { dr, dc } of directions) {
    const newPos = { row: myPos.row + dr, col: myPos.col + dc };

    // Check if we can move to this cell
    if (!canMoveBetween(state, myPos, newPos)) continue;

    // Check if opponent is there
    if (newPos.row === opponentPos.row && newPos.col === opponentPos.col) {
      // Try to jump over opponent
      const jumpPos = { row: newPos.row + dr, col: newPos.col + dc };

      if (canMoveBetween(state, newPos, jumpPos)) {
        // Can jump straight over
        validMoves.push(jumpPos);
      } else {
        // Can't jump straight, try diagonal jumps
        const lateralDirs =
          dr === 0
            ? [
                { dr: -1, dc: 0 },
                { dr: 1, dc: 0 },
              ]
            : [
                { dr: 0, dc: -1 },
                { dr: 0, dc: 1 },
              ];

        for (const lat of lateralDirs) {
          const diagPos = {
            row: opponentPos.row + lat.dr,
            col: opponentPos.col + lat.dc,
          };
          if (
            canMoveBetween(state, opponentPos, diagPos) &&
            !(diagPos.row === myPos.row && diagPos.col === myPos.col)
          ) {
            validMoves.push(diagPos);
          }
        }
      }
    } else {
      // Normal move to empty cell
      validMoves.push(newPos);
    }
  }

  return validMoves;
}

/**
 * Check if two walls overlap.
 */
function wallsOverlap(w1: Wall, w2: Wall): boolean {
  if (w1.orientation === w2.orientation) {
    if (w1.orientation === "horizontal") {
      // Same row, overlapping columns
      return w1.row === w2.row && Math.abs(w1.col - w2.col) < 2;
    } else {
      // Same column, overlapping rows
      return w1.col === w2.col && Math.abs(w1.row - w2.row) < 2;
    }
  } else {
    // Prohibit perpendicular crossing (forming a '+' intersection).
    // A horizontal wall at (r,c) spans corners (r,c) -> (r,c+2).
    // A vertical wall at (r-1,c+1) spans corners (r-1,c+1) -> (r+1,c+1).
    // Those two form a crossing; detect both orderings.
    if (w1.orientation === "horizontal" && w2.orientation === "vertical") {
      return w1.row === w2.row + 1 && w1.col + 1 === w2.col;
    }
    if (w1.orientation === "vertical" && w2.orientation === "horizontal") {
      return w1.row + 1 === w2.row && w1.col === w2.col + 1;
    }
    return false;
  }
}

/**
 * BFS to check if a player can reach their goal row.
 */
function hasPathToGoal(state: QuoridorState, playerIndex: number): boolean {
  const { gridSize, pawns } = state;
  const startPos = pawns[playerIndex];
  const goalRow = getGoalRow(playerIndex, gridSize);

  const visited = new Set<string>();
  const queue: Position[] = [startPos];
  visited.add(`${startPos.row},${startPos.col}`);

  const directions = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.row === goalRow) {
      return true;
    }

    for (const { dr, dc } of directions) {
      const next = { row: current.row + dr, col: current.col + dc };
      const key = `${next.row},${next.col}`;

      if (!visited.has(key) && canMoveBetween(state, current, next)) {
        visited.add(key);
        queue.push(next);
      }
    }
  }

  return false;
}

/**
 * Endpoint info for wall placement.
 */
export interface WallEndpoint {
  position: Position;
  wall: Wall;
}

/**
 * Get valid wall endpoints from a given starting corner.
 * Returns positions that are exactly 2 corners away in all 4 cardinal directions,
 * along with the wall that would be placed.
 */
export function getValidWallEndpoints(
  state: QuoridorState,
  startCorner: Position,
  playerIndex: number
): WallEndpoint[] {
  const { gridSize, walls, wallsRemaining } = state;
  const endpoints: WallEndpoint[] = [];

  // Can't place if no walls remaining
  if (wallsRemaining[playerIndex] <= 0) {
    return endpoints;
  }

  // Helper to check if a wall can be placed
  const canPlace = (wall: Wall): boolean => {
    // Check bounds depending on orientation to prevent "edge-only" walls.
    // Horizontal walls block movement between rows (r-1) <-> r and span cols c and c+1.
    // Valid horizontal wall coords: row in [1, gridSize-1], col in [0, gridSize-2].
    if (wall.orientation === "horizontal") {
      if (wall.row < 1 || wall.row > gridSize - 1) return false;
      if (wall.col < 0 || wall.col > gridSize - 2) return false;
    } else {
      // Vertical walls block movement between cols (c-1) <-> c and span rows r and r+1.
      // Valid vertical wall coords: row in [0, gridSize-2], col in [1, gridSize-1].
      if (wall.row < 0 || wall.row > gridSize - 2) return false;
      if (wall.col < 1 || wall.col > gridSize - 1) return false;
    }

    // Check no overlap
    if (walls.some((w) => wallsOverlap(wall, w))) return false;

    // Check paths remain
    const testState = { ...state, walls: [...walls, wall] };
    return hasPathToGoal(testState, 0) && hasPathToGoal(testState, 1);
  };

  // Horizontal wall extending RIGHT: click corner is at left end of wall
  // Wall positioned at (startCorner.row, startCorner.col)
  // allow starting corners that place the wall endpoint on the outer edge
  if (startCorner.col <= gridSize - 2) {
    const wall: Wall = {
      row: startCorner.row,
      col: startCorner.col,
      orientation: "horizontal",
    };
    if (canPlace(wall)) {
      endpoints.push({
        position: { row: startCorner.row, col: startCorner.col + 2 },
        wall,
      });
    }
  }

  // Horizontal wall extending LEFT: click corner is at right end of wall
  // Wall positioned at (startCorner.row, startCorner.col - 2)
  if (startCorner.col >= 2) {
    const wall: Wall = {
      row: startCorner.row,
      col: startCorner.col - 2,
      orientation: "horizontal",
    };
    if (canPlace(wall)) {
      endpoints.push({
        position: { row: startCorner.row, col: startCorner.col - 2 },
        wall,
      });
    }
  }

  // Vertical wall extending DOWN: click corner is at top end of wall
  // Wall positioned at (startCorner.row, startCorner.col)
  // allow starting corners that place the wall endpoint on the outer edge
  if (startCorner.row <= gridSize - 2) {
    const wall: Wall = {
      row: startCorner.row,
      col: startCorner.col,
      orientation: "vertical",
    };
    if (canPlace(wall)) {
      endpoints.push({
        position: { row: startCorner.row + 2, col: startCorner.col },
        wall,
      });
    }
  }

  // Vertical wall extending UP: click corner is at bottom end of wall
  // Wall positioned at (startCorner.row - 2, startCorner.col)
  if (startCorner.row >= 2) {
    const wall: Wall = {
      row: startCorner.row - 2,
      col: startCorner.col,
      orientation: "vertical",
    };
    if (canPlace(wall)) {
      endpoints.push({
        position: { row: startCorner.row - 2, col: startCorner.col },
        wall,
      });
    }
  }

  return endpoints;
}

/**
 * Get all valid corners where a wall can start.
 */
export function getValidWallStartCorners(
  state: QuoridorState,
  playerIndex: number
): Position[] {
  const { gridSize, wallsRemaining } = state;
  const corners: Position[] = [];

  if (wallsRemaining[playerIndex] <= 0) {
    return corners;
  }

  // Corners are at intersections
  for (let row = 0; row <= gridSize; row++) {
    for (let col = 0; col <= gridSize; col++) {
      const endpoints = getValidWallEndpoints(state, { row, col }, playerIndex);
      if (endpoints.length > 0) {
        corners.push({ row, col });
      }
    }
  }

  return corners;
}

/**
 * Check if a wall placement is valid.
 */
export function canPlaceWall(
  state: QuoridorState,
  wall: Wall,
  playerIndex: number
): boolean {
  const { gridSize, walls, wallsRemaining } = state;

  // Check walls remaining
  if (wallsRemaining[playerIndex] <= 0) return false;

  // Check bounds
  if (wall.row < 0 || wall.row > gridSize) return false;
  if (wall.col < 0 || wall.col > gridSize) return false;

  // Check no overlap
  if (walls.some((w) => wallsOverlap(wall, w))) return false;

  // Check paths remain
  const testState = { ...state, walls: [...walls, wall] };
  return hasPathToGoal(testState, 0) && hasPathToGoal(testState, 1);
}

/**
 * Apply a move to the game state.
 */
export function applyMove(state: QuoridorState, move: Move): QuoridorState {
  const { playerId } = move;
  const playerCount = state.pawns.length;

  const newState: QuoridorState = {
    ...state,
    pawns: [...state.pawns],
    walls: [...state.walls],
    wallsRemaining: [...state.wallsRemaining],
  };

  if (move.type === "pawn") {
    // Move pawn
    newState.pawns[playerId] = { ...move.to };

    // Check win condition
    const goalRow = getGoalRow(playerId, state.gridSize);
    if (move.to.row === goalRow) {
      newState.isGameOver = true;
      newState.winner = playerId;
    }
  } else {
    // Place wall
    newState.walls.push({ ...move.wall });
    newState.wallsRemaining[playerId]--;
  }

  // Switch turns if game not over
  if (!newState.isGameOver) {
    newState.currentPlayer = (playerId + 1) % playerCount;
  }

  return newState;
}

/**
 * Validate a move for the consensus system.
 */
export function validateMove(
  state: QuoridorState,
  move: Move,
  playerIndex: number
): boolean {
  // Check if it's the player's turn
  if (state.currentPlayer !== playerIndex) return false;

  // Check if playerId matches
  if (move.playerId !== playerIndex) return false;

  // Check if game is over
  if (state.isGameOver) return false;

  if (move.type === "pawn") {
    // Validate pawn move
    const validMoves = getValidPawnMoves(state, playerIndex);
    return validMoves.some(
      (pos) => pos.row === move.to.row && pos.col === move.to.col
    );
  } else {
    // Validate wall placement
    return canPlaceWall(state, move.wall, playerIndex);
  }
}
