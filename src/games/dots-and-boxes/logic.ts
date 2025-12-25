/**
 * Dots and Boxes game logic.
 * Pure functions for game state management.
 */

export interface DotsAndBoxesState {
  /** Grid size (number of dots per side) */
  gridSize: number;
  /** Horizontal lines: [row][col] = playerId who drew it, or null */
  horizontalLines: (number | null)[][];
  /** Vertical lines: [row][col] = playerId who drew it, or null */
  verticalLines: (number | null)[][];
  /** Boxes: [row][col] = playerId who completed it, or null */
  boxes: (number | null)[][];
  /** Current player index */
  currentPlayer: number;
  /** Scores for each player */
  scores: number[];
  /** Whether the game is over */
  isGameOver: boolean;
  /** Winner indices (can be multiple for ties) */
  winners: number[];
}

export interface Line {
  type: "horizontal" | "vertical";
  row: number;
  col: number;
}

export interface Move {
  line: Line;
  playerId: number;
}

/**
 * Create initial game state.
 * Validates inputs to prevent crashes from malicious values.
 */
export function createInitialState(
  playerCount: number = 2,
  gridSize: number = 5,
): DotsAndBoxesState {
  // SECURITY: Validate inputs - clamp to safe ranges
  if (!Number.isInteger(gridSize) || gridSize < 3 || gridSize > 10) {
    console.warn("[Game] Invalid gridSize, defaulting to 5:", gridSize);
    gridSize = 5;
  }
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 4) {
    console.warn("[Game] Invalid playerCount, defaulting to 2:", playerCount);
    playerCount = 2;
  }

  const numBoxRows = gridSize - 1;
  const numBoxCols = gridSize - 1;

  return {
    gridSize,
    // Horizontal lines: gridSize rows, gridSize-1 columns
    horizontalLines: Array(gridSize)
      .fill(null)
      .map(() => Array(numBoxCols).fill(null)),
    // Vertical lines: gridSize-1 rows, gridSize columns
    verticalLines: Array(numBoxRows)
      .fill(null)
      .map(() => Array(gridSize).fill(null)),
    // Boxes: gridSize-1 rows, gridSize-1 columns
    boxes: Array(numBoxRows)
      .fill(null)
      .map(() => Array(numBoxCols).fill(null)),
    currentPlayer: 0,
    scores: Array(playerCount).fill(0),
    isGameOver: false,
    winners: [],
  };
}

/**
 * Check if a line has already been drawn.
 */
export function isLineDrawn(state: DotsAndBoxesState, line: Line): boolean {
  if (line.type === "horizontal") {
    return state.horizontalLines[line.row]?.[line.col] !== null;
  } else {
    return state.verticalLines[line.row]?.[line.col] !== null;
  }
}

/**
 * Check if a box is complete (all 4 sides drawn).
 */
function isBoxComplete(
  state: DotsAndBoxesState,
  row: number,
  col: number,
): boolean {
  const top = state.horizontalLines[row]?.[col] !== null;
  const bottom = state.horizontalLines[row + 1]?.[col] !== null;
  const left = state.verticalLines[row]?.[col] !== null;
  const right = state.verticalLines[row]?.[col + 1] !== null;
  return top && bottom && left && right;
}

/**
 * Apply a move to the game state.
 * Returns the new state and whether boxes were completed.
 */
export function applyMove(
  state: DotsAndBoxesState,
  move: Move,
): DotsAndBoxesState {
  const { line, playerId } = move;
  const playerCount = state.scores.length;

  // Clone state
  const newState: DotsAndBoxesState = {
    ...state,
    horizontalLines: state.horizontalLines.map((row) => [...row]),
    verticalLines: state.verticalLines.map((row) => [...row]),
    boxes: state.boxes.map((row) => [...row]),
    scores: [...state.scores],
  };

  // Draw the line
  if (line.type === "horizontal") {
    newState.horizontalLines[line.row][line.col] = playerId;
  } else {
    newState.verticalLines[line.row][line.col] = playerId;
  }

  // Check for completed boxes
  let boxesCompleted = 0;
  const numBoxRows = state.gridSize - 1;
  const numBoxCols = state.gridSize - 1;

  // Check which boxes could be affected by this line
  const boxesToCheck: [number, number][] = [];

  if (line.type === "horizontal") {
    // Horizontal line can complete box above or below
    if (line.row > 0) boxesToCheck.push([line.row - 1, line.col]);
    if (line.row < numBoxRows) boxesToCheck.push([line.row, line.col]);
  } else {
    // Vertical line can complete box to left or right
    if (line.col > 0) boxesToCheck.push([line.row, line.col - 1]);
    if (line.col < numBoxCols) boxesToCheck.push([line.row, line.col]);
  }

  for (const [boxRow, boxCol] of boxesToCheck) {
    if (
      newState.boxes[boxRow][boxCol] === null &&
      isBoxComplete(newState, boxRow, boxCol)
    ) {
      newState.boxes[boxRow][boxCol] = playerId;
      newState.scores[playerId]++;
      boxesCompleted++;
    }
  }

  // Check if game is over
  const totalBoxes = numBoxRows * numBoxCols;
  const completedBoxes = newState.scores.reduce((sum, score) => sum + score, 0);

  if (completedBoxes === totalBoxes) {
    newState.isGameOver = true;

    // Find winners (highest score)
    let maxScore = -1;
    let winners: number[] = [];

    newState.scores.forEach((score, index) => {
      if (score > maxScore) {
        maxScore = score;
        winners = [index];
      } else if (score === maxScore) {
        winners.push(index);
      }
    });

    newState.winners = winners;
  } else {
    // Only switch turns if no boxes were completed
    if (boxesCompleted === 0) {
      newState.currentPlayer = (playerId + 1) % playerCount;
    }
  }

  return newState;
}

/**
 * Get all possible moves for the current state.
 */
export function getPossibleMoves(state: DotsAndBoxesState): Line[] {
  const moves: Line[] = [];

  // Check horizontal lines
  for (let row = 0; row < state.gridSize; row++) {
    for (let col = 0; col < state.gridSize - 1; col++) {
      if (state.horizontalLines[row][col] === null) {
        moves.push({ type: "horizontal", row, col });
      }
    }
  }

  // Check vertical lines
  for (let row = 0; row < state.gridSize - 1; row++) {
    for (let col = 0; col < state.gridSize; col++) {
      if (state.verticalLines[row][col] === null) {
        moves.push({ type: "vertical", row, col });
      }
    }
  }

  return moves;
}

/**
 * Validator for moves to prevent cheating.
 */
export function validateMove(
  state: DotsAndBoxesState,
  move: Move,
  playerIndex: number,
): boolean {
  // 1. Check if it's the player's turn
  if (state.currentPlayer !== playerIndex) return false;

  // 2. Check if playerId in move matches playerIndex
  if (move.playerId !== playerIndex) return false;

  // 3. Check if game is over
  if (state.isGameOver) return false;

  // 4. Check if line is already drawn
  if (isLineDrawn(state, move.line)) return false;

  // 5. Basic row/col bounds check
  const { line } = move;
  if (line.type === "horizontal") {
    if (
      line.row < 0 ||
      line.row >= state.gridSize ||
      line.col < 0 ||
      line.col >= state.gridSize - 1
    )
      return false;
  } else {
    if (
      line.row < 0 ||
      line.row >= state.gridSize - 1 ||
      line.col < 0 ||
      line.col >= state.gridSize
    )
      return false;
  }

  return true;
}
