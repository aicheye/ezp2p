import { useMemo } from "react";
import type { Position, QuoridorState, Wall, WallEndpoint } from "./logic";
import { getValidPawnMoves, getValidWallEndpoints, getValidWallStartCorners } from "./logic";
import "./styles.css";

interface BoardProps {
  state: QuoridorState;
  localPlayerIndex: number;
  isMyTurn: boolean;
  wallMode: boolean;
  selectedCorner: Position | null;
  onCellClick: (pos: Position) => void;
  onCornerClick: (pos: Position) => void;
  onCornerHover: (pos: Position | null) => void;
  hoveredCorner: Position | null;
}

const CELL_SIZE = 44;
const CORNER_SIZE = 12;
const WALL_THICKNESS = 8;
const WALL_LENGTH = 2 * CELL_SIZE + CORNER_SIZE;

/**
 * Quoridor game board component.
 */
export function Board({
  state,
  localPlayerIndex,
  isMyTurn,
  wallMode,
  selectedCorner,
  onCellClick,
  onCornerClick,
  onCornerHover,
  hoveredCorner,
}: BoardProps) {
  const { gridSize, pawns, walls } = state;

  // Calculate valid moves for current player
  const validMoves = useMemo(() => {
    if (!isMyTurn || wallMode) return [];
    return getValidPawnMoves(state, localPlayerIndex);
  }, [state, localPlayerIndex, isMyTurn, wallMode]);

  // Calculate valid wall start corners
  const validWallCorners = useMemo(() => {
    if (!isMyTurn || !wallMode || selectedCorner) return [];
    return getValidWallStartCorners(state, localPlayerIndex);
  }, [state, localPlayerIndex, isMyTurn, wallMode, selectedCorner]);

  // Calculate valid wall endpoints from selected corner (now an array)
  const validEndpoints = useMemo((): WallEndpoint[] => {
    if (!isMyTurn || !wallMode || !selectedCorner) {
      return [];
    }
    return getValidWallEndpoints(state, selectedCorner, localPlayerIndex);
  }, [state, selectedCorner, localPlayerIndex, isMyTurn, wallMode]);

  // Find if a position is a valid endpoint and get the associated wall
  const findEndpoint = (pos: Position): WallEndpoint | undefined => {
    return validEndpoints.find(
      (ep) => ep.position.row === pos.row && ep.position.col === pos.col
    );
  };

  // Preview wall based on hovered endpoint
  const previewWall = useMemo((): Wall | null => {
    if (!selectedCorner || !hoveredCorner) return null;

    const endpoint = findEndpoint(hoveredCorner);
    return endpoint?.wall ?? null;
  }, [selectedCorner, hoveredCorner, validEndpoints]);

  const boardSize = gridSize * CELL_SIZE + (gridSize - 1) * CORNER_SIZE;

  // Render cells
  const cells = useMemo(() => {
    const result = [];
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const isValidMove = validMoves.some(m => m.row === row && m.col === col);
        const left = col * (CELL_SIZE + CORNER_SIZE);
        const top = row * (CELL_SIZE + CORNER_SIZE);

        result.push(
          <div
            key={`cell-${row}-${col}`}
            className={`qr-cell ${isValidMove && isMyTurn && !wallMode ? "qr-cell--valid" : ""}`}
            style={{
              position: "absolute",
              left,
              top,
              width: CELL_SIZE,
              height: CELL_SIZE,
            }}
            onClick={() => isValidMove && isMyTurn && !wallMode && onCellClick({ row, col })}
          />
        );
      }
    }
    return result;
  }, [gridSize, validMoves, isMyTurn, wallMode, onCellClick]);

  // Render pawns
  const pawnElements = useMemo(() => {
    return pawns.map((pos, playerIdx) => {
      const left = pos.col * (CELL_SIZE + CORNER_SIZE) + CELL_SIZE / 2;
      const top = pos.row * (CELL_SIZE + CORNER_SIZE) + CELL_SIZE / 2;

      return (
        <div
          key={`pawn-${playerIdx}`}
          className={`qr-pawn qr-pawn--p${playerIdx + 1}`}
          style={{
            position: "absolute",
            left,
            top,
            transform: "translate(-50%, -50%)",
          }}
        />
      );
    });
  }, [pawns]);

  // Render corners (wall start/end points)
  const corners = useMemo(() => {
    const result = [];
    // Iterate from 0 to gridSize to cover all potential endpoints (including edges)
    // Standard internal corners are 0 to gridSize-2.
    // Endpoints can extend to gridSize.
    for (let row = 0; row <= gridSize; row++) {
      for (let col = 0; col <= gridSize; col++) {
        // Validation checks
        const isValidStart = validWallCorners.some(c => c.row === row && c.col === col);
        const isSelected = selectedCorner?.row === row && selectedCorner?.col === col;

        // Check if this corner is a valid endpoint for the selected corner
        const isEndpoint = selectedCorner
          ? validEndpoints.some(ep => ep.position.row === row && ep.position.col === col)
          : false;

        // Is it a standard internal corner (always visible)?
        const isInternal = row <= gridSize - 2 && col <= gridSize - 2;

        // Only render if it's relevant (internal, or useful for interaction)
        if (!isInternal && !isValidStart && !isEndpoint && !isSelected) {
          continue;
        }

        const left = (col + 1) * CELL_SIZE + col * CORNER_SIZE;
        const top = (row + 1) * CELL_SIZE + row * CORNER_SIZE;

        const isClickable = (wallMode && isMyTurn && (isValidStart || isEndpoint)) || isSelected;
        const showGlow = wallMode && isMyTurn && (isValidStart || isEndpoint || isSelected);

        result.push(
          <div
            key={`corner-${row}-${col}`}
            className={`qr-corner ${showGlow ? "qr-corner--active" : ""} ${isSelected ? "qr-corner--selected" : ""} ${isEndpoint ? "qr-corner--endpoint" : ""}`}
            style={{
              position: "absolute",
              left,
              top,
              width: CORNER_SIZE,
              height: CORNER_SIZE,
              cursor: isClickable ? "pointer" : "default",
              // Ensure corners are above walls if they overlap (though pointer-events on walls helps)
              zIndex: 25,
            }}
            onClick={() => isClickable && onCornerClick({ row, col })}
            onMouseEnter={() => isEndpoint && onCornerHover({ row, col })}
            onMouseLeave={() => onCornerHover(null)}
          />
        );
      }
    }
    return result;
  }, [gridSize, validWallCorners, selectedCorner, validEndpoints, wallMode, isMyTurn, onCornerClick, onCornerHover]);

  // Render placed walls
  const wallElements = useMemo(() => {
    return walls.map((wall, idx) => {
      // Wall position: corner at (row, col) is the top-left of the wall
      // The wall extends 2 cells in the given direction
      const cornerLeft = (wall.col + 1) * CELL_SIZE + wall.col * CORNER_SIZE;
      const cornerTop = (wall.row + 1) * CELL_SIZE + wall.row * CORNER_SIZE;

      if (wall.orientation === "horizontal") {
        return (
          <div
            key={`wall-${idx}`}
            className="qr-wall qr-wall--placed"
            style={{
              position: "absolute",
              left: cornerLeft + CORNER_SIZE,
              top: cornerTop + (CORNER_SIZE - WALL_THICKNESS) / 2,
              width: WALL_LENGTH,
              height: WALL_THICKNESS,
              pointerEvents: "none",
            }}
          />
        );
      } else {
        return (
          <div
            key={`wall-${idx}`}
            className="qr-wall qr-wall--placed"
            style={{
              position: "absolute",
              left: cornerLeft + (CORNER_SIZE - WALL_THICKNESS) / 2,
              top: cornerTop + CORNER_SIZE,
              width: WALL_THICKNESS,
              height: WALL_LENGTH,
              pointerEvents: "none",
            }}
          />
        );
      }
    });
  }, [walls]);

  // Render preview wall
  const previewWallElement = useMemo(() => {
    if (!previewWall) return null;

    const cornerLeft = (previewWall.col + 1) * CELL_SIZE + previewWall.col * CORNER_SIZE;
    const cornerTop = (previewWall.row + 1) * CELL_SIZE + previewWall.row * CORNER_SIZE;

    if (previewWall.orientation === "horizontal") {
      return (
        <div
          className={`qr-wall qr-wall--preview qr-wall--p${localPlayerIndex + 1}`}
          style={{
            position: "absolute",
            left: cornerLeft + CORNER_SIZE,
            top: cornerTop + (CORNER_SIZE - WALL_THICKNESS) / 2,
            width: WALL_LENGTH,
            height: WALL_THICKNESS,
            pointerEvents: "none",
          }}
        />
      );
    } else {
      return (
        <div
          className={`qr-wall qr-wall--preview qr-wall--p${localPlayerIndex + 1}`}
          style={{
            position: "absolute",
            left: cornerLeft + (CORNER_SIZE - WALL_THICKNESS) / 2,
            top: cornerTop + CORNER_SIZE,
            width: WALL_THICKNESS,
            height: WALL_LENGTH,
            pointerEvents: "none",
          }}
        />
      );
    }
  }, [previewWall, localPlayerIndex]);

  return (
    <div
      className="qr-board"
      style={{
        width: boardSize,
        height: boardSize,
        position: "relative",
      }}
    >
      {cells}
      {corners}
      {wallElements}
      {previewWallElement}
      {pawnElements}
    </div>
  );
}
