import { useMemo } from "react";
import type { DotsAndBoxesState, Line } from "./logic";
import "./styles.css";

interface BoardProps {
  state: DotsAndBoxesState;
  localPlayerIndex: number;
  isMyTurn: boolean;
  onLineClick: (line: Line) => void;
}

const DOT_SIZE = 12;

/**
 * Dots and Boxes game board component.
 */
export function Board({
  state,
  localPlayerIndex,
  isMyTurn,
  onLineClick,
}: BoardProps) {
  const { gridSize, horizontalLines, verticalLines, boxes } = state;

  const { lineLength, gap } = useMemo(() => {
    // Determine available width (accounting for padding)
    const availableWidth =
      typeof window !== "undefined"
        ? Math.min(window.innerWidth - 60, 400)
        : 250;

    // Basic scaling: 3x3 gets ~60px lines, 8x8 gets ~30px lines
    const lineLength = Math.max(
      20,
      Math.min(
        60,
        Math.floor((availableWidth - gridSize * DOT_SIZE) / (gridSize - 1)),
      ),
    );
    return {
      lineLength,
      gap: lineLength + DOT_SIZE,
    };
  }, [gridSize]);

  const boardSize = useMemo(() => {
    return (gridSize - 1) * gap + DOT_SIZE;
  }, [gridSize, gap]);

  // Generate dots
  const dots = useMemo(() => {
    const result = [];
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        result.push(
          <div
            key={`dot-${row}-${col}`}
            className="dab-dot"
            style={{
              position: "absolute",
              left: col * gap,
              top: row * gap,
            }}
          />,
        );
      }
    }
    return result;
  }, [gridSize, gap]);

  // Generate horizontal lines
  const hLines = useMemo(() => {
    const result = [];
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize - 1; col++) {
        const drawnBy = horizontalLines[row][col];
        const isDrawn = drawnBy !== null;

        result.push(
          <div
            key={`h-${row}-${col}`}
            className={`dab-line dab-line--horizontal ${isDrawn
              ? `dab-line--drawn dab-line--p${drawnBy + 1}`
              : ""
              } ${!isDrawn && isMyTurn ? `dab-line--preview-p${localPlayerIndex + 1}` : ""}`}
            style={{
              left: col * gap + DOT_SIZE,
              top: row * gap + DOT_SIZE / 2,
              width: lineLength,
            }}
            onClick={() =>
              !isDrawn &&
              isMyTurn &&
              onLineClick({ type: "horizontal", row, col })
            }
          />,
        );
      }
    }
    return result;
  }, [
    gridSize,
    horizontalLines,
    isMyTurn,
    localPlayerIndex,
    onLineClick,
    gap,
    lineLength,
  ]);

  // Generate vertical lines
  const vLines = useMemo(() => {
    const result = [];
    for (let row = 0; row < gridSize - 1; row++) {
      for (let col = 0; col < gridSize; col++) {
        const drawnBy = verticalLines[row][col];
        const isDrawn = drawnBy !== null;

        result.push(
          <div
            key={`v-${row}-${col}`}
            className={`dab-line dab-line--vertical ${isDrawn
              ? `dab-line--drawn dab-line--p${drawnBy + 1}`
              : ""
              } ${!isDrawn && isMyTurn ? `dab-line--preview-p${localPlayerIndex + 1}` : ""}`}
            style={{
              left: col * gap + DOT_SIZE / 2,
              top: row * gap + DOT_SIZE,
              height: lineLength,
            }}
            onClick={() =>
              !isDrawn &&
              isMyTurn &&
              onLineClick({ type: "vertical", row, col })
            }
          />,
        );
      }
    }
    return result;
  }, [
    gridSize,
    verticalLines,
    isMyTurn,
    localPlayerIndex,
    onLineClick,
    gap,
    lineLength,
  ]);

  // Generate completed boxes
  const boxElements = useMemo(() => {
    const result = [];
    for (let row = 0; row < gridSize - 1; row++) {
      for (let col = 0; col < gridSize - 1; col++) {
        const owner = boxes[row][col];
        if (owner !== null) {
          result.push(
            <div
              key={`box-${row}-${col}`}
              className={`dab-box dab-box--p${owner + 1}`}
              style={{
                left: col * gap + DOT_SIZE,
                top: row * gap + DOT_SIZE,
                width: lineLength,
                height: lineLength,
              }}
            >
              <span style={{ fontSize: `${lineLength * 0.4}px` }}>
                {owner === 0
                  ? "★"
                  : owner === 1
                    ? "◆"
                    : owner === 2
                      ? "●"
                      : "▲"}
              </span>
            </div>,
          );
        }
      }
    }
    return result;
  }, [gridSize, boxes, gap, lineLength]);

  return (
    <div
      className="dab-board"
      style={{
        width: boardSize,
        height: boardSize,
        position: "relative",
      }}
    >
      {boxElements}
      {dots}
      {hLines}
      {vLines}
    </div>
  );
}
