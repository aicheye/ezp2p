/**
 * Tic Tac Toe game logic.
 * Pure functions for game state management.
 */


export interface TicTacToeState {
  /** Board: [row][col] = playerId who marked it, or null */
  board: (number | null)[][];
  /** Current player index */
  currentPlayer: number;
  /** Whether the game is over */
  isGameOver: boolean;
  /** Winner index (null if draw or game not over) */
  winner: number | null;
  /** Coordinates of the winning line for highlighting */
  winningLine: [number, number][] | null;
}

export interface Move {
  row: number;
  col: number;
  playerId: number;
}

/**
 * Create initial game state.
 */
export function createInitialState(playerCount: number = 2): TicTacToeState {
  // Tic Tac Toe is strictly 2 players
  if (playerCount !== 2) {
    console.warn(
      "[Game] Tic Tac Toe requires exactly 2 players. Defaulting to 2.",
    );
  }

  return {
    board: Array(3)
      .fill(null)
      .map(() => Array(3).fill(null)),
    currentPlayer: 0,
    isGameOver: false,
    winner: null,
    winningLine: null,
  };
}

/**
 * Check if a cell is already occupied.
 */
export function isCellOccupied(
  state: TicTacToeState,
  row: number,
  col: number,
): boolean {
  return state.board[row]?.[col] !== null;
}

/**
 * Check for a win or draw.
 */
function checkWin(board: (number | null)[][]): {
  winner: number | null;
  line: [number, number][] | null;
  isDraw: boolean;
} {
  const size = 3;

  // Check rows
  for (let r = 0; r < size; r++) {
    if (
      board[r][0] !== null &&
      board[r][0] === board[r][1] &&
      board[r][1] === board[r][2]
    ) {
      return {
        winner: board[r][0],
        line: [
          [r, 0],
          [r, 1],
          [r, 2],
        ],
        isDraw: false,
      };
    }
  }

  // Check columns
  for (let c = 0; c < size; c++) {
    if (
      board[0][c] !== null &&
      board[0][c] === board[1][c] &&
      board[1][c] === board[2][c]
    ) {
      return {
        winner: board[0][c],
        line: [
          [0, c],
          [1, c],
          [2, c],
        ],
        isDraw: false,
      };
    }
  }

  // Check diagonals
  if (
    board[0][0] !== null &&
    board[0][0] === board[1][1] &&
    board[1][1] === board[2][2]
  ) {
    return {
      winner: board[0][0],
      line: [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
      isDraw: false,
    };
  }

  if (
    board[0][2] !== null &&
    board[0][2] === board[1][1] &&
    board[1][1] === board[2][0]
  ) {
    return {
      winner: board[0][2],
      line: [
        [0, 2],
        [1, 1],
        [2, 0],
      ],
      isDraw: false,
    };
  }

  // Check draw
  const isFull = board.every((row) => row.every((cell) => cell !== null));
  if (isFull) {
    return { winner: null, line: null, isDraw: true };
  }

  return { winner: null, line: null, isDraw: false };
}

/**
 * Apply a move to the game state.
 */
export function applyMove(state: TicTacToeState, move: Move): TicTacToeState {
  // Clone state
  const newState: TicTacToeState = {
    ...state,
    board: state.board.map((row) => [...row]),
  };

  // Apply move
  newState.board[move.row][move.col] = move.playerId;

  // Check win condition
  const { winner, line, isDraw } = checkWin(newState.board);

  if (winner !== null) {
    newState.isGameOver = true;
    newState.winner = winner;
    newState.winningLine = line;
  } else if (isDraw) {
    newState.isGameOver = true;
    newState.winner = null; // Draw
  } else {
    // Switch turn
    newState.currentPlayer = (state.currentPlayer + 1) % 2;
  }

  return newState;
}

/**
 * Validator for moves to prevent cheating.
 */
export function validateMove(
  state: TicTacToeState,
  move: Move,
  playerIndex: number,
): boolean {
  // 1. Check if it's the player's turn
  if (state.currentPlayer !== playerIndex) return false;

  // 2. Check if playerId in move matches playerIndex
  if (move.playerId !== playerIndex) return false;

  // 3. Check if game is over
  if (state.isGameOver) return false;

  // 4. Check bounds
  if (move.row < 0 || move.row > 2 || move.col < 0 || move.col > 2)
    return false;

  // 5. Check if cell is occupied
  if (isCellOccupied(state, move.row, move.col)) return false;

  return true;
}
