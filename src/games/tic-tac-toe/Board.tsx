import type { TicTacToeState } from "./logic";

interface BoardProps {
  state: TicTacToeState;
  isMyTurn: boolean;
  onCellClick: (row: number, col: number) => void;
}

export function Board({ state, isMyTurn, onCellClick }: BoardProps) {
  const getCellContent = (playerId: number | null) => {
    if (playerId === 0) return "X";
    if (playerId === 1) return "O";
    return null;
  };

  const getCellClassName = (
    row: number,
    col: number,
    playerId: number | null,
  ) => {
    let className = "ttt-cell";

    if (playerId === 0) className += " ttt-cell--x";
    if (playerId === 1) className += " ttt-cell--o";

    const isWinningCell = state.winningLine?.some(
      ([r, c]) => r === row && c === col,
    );
    if (isWinningCell) {
      if (state.winner === 0) className += " ttt-cell--winner"; // Will inherit color from text color set by ttt-cell--x
      if (state.winner === 1) className += " ttt-cell--winner"; // Will inherit color from text color set by ttt-cell--o
    }

    return className;
  };

  return (
    <div className="ttt-board">
      {state.board.map((rowArr, rowIndex) =>
        rowArr.map((cellOwner, colIndex) => (
          <button
            key={`${rowIndex}-${colIndex}`}
            className={getCellClassName(rowIndex, colIndex, cellOwner)}
            onClick={() => onCellClick(rowIndex, colIndex)}
            disabled={cellOwner !== null || !isMyTurn}
            style={{
              cursor:
                cellOwner !== null || !isMyTurn ? "not-allowed" : "pointer",
              padding: "0.5rem 0 0.25rem 0.5rem",
            }}
          >
            {getCellContent(cellOwner)}
          </button>
        )),
      )}
    </div>
  );
}
