import { useCallback, useMemo, useState } from "react";
import { Modal } from "../../components/arcade";
import { audio } from "../../sound/audio";
import { useGameEngine } from "../hooks";
import type { GameDefinition, GameProps } from "../types";
import "./styles.css";

type PawnPos = { r: number; c: number };

type QuoridorState = {
  size: number; // board cells per side (typically 9)
  pawns: PawnPos[]; // positions per player index
  walls: string[]; // serialized blocked edges like "r1,c1|r2,c2"
  wallsPlaced: number[]; // count of walls placed by each player
  currentPlayer: number;
  isGameOver: boolean;
  winner: number | null;
};

type Move =
  | { type: "move"; to: PawnPos; playerId: number }
  | { type: "place_wall"; orientation: "h" | "v"; row: number; col: number; playerId: number };

function edgeKey(a: PawnPos, b: PawnPos) {
  const [r1, c1] = [a.r, a.c];
  const [r2, c2] = [b.r, b.c];
  if (r1 < r2 || (r1 === r2 && c1 <= c2)) return `${r1},${c1}|${r2},${c2}`;
  return `${r2},${c2}|${r1},${c1}`;
}

function neighbors(pos: PawnPos, size: number) {
  const dirs = [
    { r: -1, c: 0 },
    { r: 1, c: 0 },
    { r: 0, c: -1 },
    { r: 0, c: 1 },
  ];
  return dirs
    .map((d) => ({ r: pos.r + d.r, c: pos.c + d.c }))
    .filter((p) => p.r >= 0 && p.r < size && p.c >= 0 && p.c < size);
}

function hasPath(start: PawnPos, goalTest: (p: PawnPos) => boolean, size: number, wallsSet: Set<string>) {
  const q: PawnPos[] = [start];
  const seen = new Set<string>([`${start.r},${start.c}`]);
  while (q.length) {
    const cur = q.shift()!;
    if (goalTest(cur)) return true;
    for (const nb of neighbors(cur, size)) {
      const e = edgeKey(cur, nb);
      if (wallsSet.has(e)) continue;
      const key = `${nb.r},${nb.c}`;
      if (seen.has(key)) continue;
      seen.add(key);
      q.push(nb);
    }
  }
  return false;
}

function createInitialState(playerCount: number): QuoridorState {
  const size = 9;
  // Initial pawn positions: 2-player (top/bottom center). For >2, place around edges.
  const center = Math.floor(size / 2);
  const pawns: PawnPos[] = [];
  if (playerCount === 2) {
    pawns.push({ r: 0, c: center });
    pawns.push({ r: size - 1, c: center });
  } else if (playerCount === 3) {
    pawns.push({ r: 0, c: center });
    pawns.push({ r: size - 1, c: center });
    pawns.push({ r: center, c: size - 1 });
  } else {
    // up to 4 players
    pawns.push({ r: 0, c: center });
    pawns.push({ r: size - 1, c: center });
    pawns.push({ r: center, c: size - 1 });
    pawns.push({ r: center, c: 0 });
  }

  const wallsPlaced = new Array(playerCount).fill(0);
  return {
    size,
    pawns,
    walls: [],
    wallsPlaced,
    currentPlayer: 0,
    isGameOver: false,
    winner: null,
  };
}

function validateMove(state: QuoridorState, move: Move, playerIndex: number) {
  if (state.isGameOver) return false;
  if (move.playerId !== playerIndex) return false;
  const size = state.size;
  const wallsSet = new Set(state.walls);

  if (move.type === "move") {
    const from = state.pawns[playerIndex];
    const to = move.to;
    // bounds
    if (to.r < 0 || to.r >= size || to.c < 0 || to.c >= size) return false;
    // occupied
    for (let i = 0; i < state.pawns.length; i++) {
      if (i !== playerIndex && state.pawns[i].r === to.r && state.pawns[i].c === to.c) return false;
    }
    // adjacent
    const dr = to.r - from.r;
    const dc = to.c - from.c;
    const dist = Math.abs(dr) + Math.abs(dc);
    if (dist === 1) {
      // ensure no wall between
      const e = edgeKey(from, to);
      if (wallsSet.has(e)) return false;
      return true;
    }
    // jump over opponent (simple straight jump)
    if (dist === 2 && (Math.abs(dr) === 2 || Math.abs(dc) === 2)) {
      const mid = { r: (from.r + to.r) / 2, c: (from.c + to.c) / 2 } as PawnPos;
      const occupier = state.pawns.find((p) => p.r === mid.r && p.c === mid.c);
      if (!occupier) return false;
      // no wall between from->mid and mid->to
      if (wallsSet.has(edgeKey(from, mid)) || wallsSet.has(edgeKey(mid, to))) return false;
      return true;
    }

    return false;
  }

  if (move.type === "place_wall") {
    const { orientation, row, col } = move;
    // wall placement must be within the (size-1)x(size-1) grid of wall positions
    if (row < 0 || col < 0 || row >= size - 1 || col >= size - 1) return false;
    // check player has walls left
    const maxWalls = state.pawns.length === 2 ? 10 : Math.floor(20 / state.pawns.length);
    if ((state.wallsPlaced[playerIndex] ?? 0) >= maxWalls) return false;

    // determine the two edges the wall would block
    const edgesToBlock: string[] = [];
    if (orientation === "h") {
      // horizontal between row,row+1 at columns col and col+1
      const a1 = { r: row, c: col };
      const b1 = { r: row + 1, c: col };
      const a2 = { r: row, c: col + 1 };
      const b2 = { r: row + 1, c: col + 1 };
      edgesToBlock.push(edgeKey(a1, b1));
      edgesToBlock.push(edgeKey(a2, b2));
    } else {
      // vertical between col,col+1 at rows row and row+1
      const a1 = { r: row, c: col };
      const b1 = { r: row, c: col + 1 };
      const a2 = { r: row + 1, c: col };
      const b2 = { r: row + 1, c: col + 1 };
      edgesToBlock.push(edgeKey(a1, b1));
      edgesToBlock.push(edgeKey(a2, b2));
    }

    // cannot overlap existing walls (if edges already blocked)
    for (const e of edgesToBlock) if (wallsSet.has(e)) return false;

    // simulate placement and ensure every player still has a path to their goal side
    const newWalls = new Set(state.walls);
    edgesToBlock.forEach((e) => newWalls.add(e));

    for (let i = 0; i < state.pawns.length; i++) {
      const start = state.pawns[i];
      const goalTest = (p: PawnPos) => {
        if (i === 0) return p.r === size - 1; // player0 aims bottom
        if (i === 1) return p.r === 0; // player1 aims top
        // other players aim opposite edge heuristically
        if (i === 2) return p.c === 0;
        return p.c === size - 1;
      };
      if (!hasPath(start, goalTest, size, newWalls)) return false;
    }

    return true;
  }

  return false;
}

function applyMove(state: QuoridorState, move: Move): QuoridorState {
  const next: QuoridorState = JSON.parse(JSON.stringify(state));
  const player = move.playerId;
  if (move.type === "move") {
    next.pawns[player] = { r: move.to.r, c: move.to.c };
    // check win
    if (player === 0 && move.to.r === next.size - 1) {
      next.isGameOver = true;
      next.winner = player;
    }
    if (player === 1 && move.to.r === 0) {
      next.isGameOver = true;
      next.winner = player;
    }
  } else if (move.type === "place_wall") {
    const { orientation, row, col } = move;
    if (orientation === "h") {
      const a1 = { r: row, c: col };
      const b1 = { r: row + 1, c: col };
      const a2 = { r: row, c: col + 1 };
      const b2 = { r: row + 1, c: col + 1 };
      next.walls.push(edgeKey(a1, b1));
      next.walls.push(edgeKey(a2, b2));
    } else {
      const a1 = { r: row, c: col };
      const b1 = { r: row, c: col + 1 };
      const a2 = { r: row + 1, c: col };
      const b2 = { r: row + 1, c: col + 1 };
      next.walls.push(edgeKey(a1, b1));
      next.walls.push(edgeKey(a2, b2));
    }
    next.wallsPlaced[player] = (next.wallsPlaced[player] ?? 0) + 1;
  }

  // advance turn if not game over
  if (!next.isGameOver) next.currentPlayer = (next.currentPlayer + 1) % next.pawns.length;
  return next;
}

function QuoridorGame(props: GameProps) {
  const {
    players,
    localPlayerId,
    sendMessage,
    onGameEnd,
    onForfeit,
    onExit,
    onReturnToLobby,
    disconnectedPlayerIds = [],
  } = props;

  const initialState = useMemo(() => createInitialState(players.length), [players.length]);
  const [opponentLeftMessage, setOpponentLeftMessage] = useState<"left" | "forfeit" | null>(null);

  const { gameState, proposeMove, pendingMove, localPlayerIndex } = useGameEngine<QuoridorState, Move>({
    ...props,
    initialState,
    validateMove,
    applyMove,
    onMoveApplied: (newState, _move) => {
      if (newState.isGameOver) {
        const scores: Record<string, number> = {};
        players.forEach((p, i) => {
          scores[p.id] = newState.winner === i ? 1 : 0;
        });
        onGameEnd({ winnerId: newState.winner !== null ? players[newState.winner].id : null, scores, reason: "complete" });
      }
    },
    onMessage: (message) => {
      if (message.type === "player-left") {
        const payload = message.payload as { playerId: string };
        if (payload.playerId !== props.localPlayerId) setOpponentLeftMessage("left");
      }
      if (message.type === "forfeit") {
        const payload = message.payload as { playerId: string };
        if (payload.playerId !== props.localPlayerId) setOpponentLeftMessage("forfeit");
      }
    },
  });

  const [showConfirmExit, setShowConfirmExit] = useState(false);
  const opponentDisconnected = disconnectedPlayerIds.some((id) => id !== localPlayerId);

  const opponentLeft = opponentLeftMessage !== null;

  const currentTurnIsLocal = gameState.currentPlayer === localPlayerIndex;

  // Interaction handlers
  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (!currentTurnIsLocal || gameState.isGameOver || opponentLeft || opponentDisconnected || !!pendingMove) return;
      try {
        audio.playLongBlip();
      } catch { }
      proposeMove({ type: "move", to: { r, c }, playerId: localPlayerIndex });
    },
    [currentTurnIsLocal, gameState.isGameOver, opponentLeft, opponentDisconnected, pendingMove, proposeMove, localPlayerIndex],
  );

  const handleForfeit = () => {
    sendMessage({ type: "forfeit", payload: { playerId: localPlayerId }, senderId: localPlayerId, timestamp: Date.now() });
    if (onForfeit) {
      const scores: Record<string, number> = {};
      players.forEach((p) => (scores[p.id] = 0));
      onGameEnd({ winnerId: players.find((p) => p.id !== localPlayerId)?.id ?? null, scores, reason: "forfeit" });
      onForfeit();
    }
  };

  const handleExit = () => {
    sendMessage({ type: "player-left", payload: { playerId: localPlayerId }, senderId: localPlayerId, timestamp: Date.now() });
    onExit?.();
  };

  // Simple UI rendering
  const size = gameState.size;
  const cellSize = 38;

  // wallMode removed — orientation is inferred on click (prefer horizontal)

  // compute legal single-step / jump moves for the local player to highlight
  const legalMoves = useMemo(() => {
    if (!currentTurnIsLocal) return new Set<string>();
    const s = new Set<string>();
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const mv: Move = { type: "move", to: { r, c }, playerId: localPlayerIndex };
        if (validateMove(gameState, mv, localPlayerIndex)) s.add(`${r},${c}`);
      }
    }
    return s;
  }, [gameState, currentTurnIsLocal, localPlayerIndex, size]);

  // wall grid helpers (drawn and preview eligibility)
  // wall grid helpers were simplified; validation is computed inline per-anchor

  const [hoverAnchor, setHoverAnchor] = useState<null | { r: number; c: number; orientation: "h" | "v" | null }>(null);

  return (
    <div style={{ padding: "1rem", textAlign: "center" }}>
      <h2 style={{ marginBottom: "0.5rem" }}>QUORIDOR</h2>

      <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginBottom: "0.75rem" }}>
        {players.map((p, i) => {
          const isLocal = p.id === localPlayerId;
          const isTurn = gameState.currentPlayer === i && !gameState.isGameOver;
          return (
            <div key={p.id} className={`qu-player qu-player--p${i + 1} ${isTurn ? "qu-player--active" : ""}`} style={{ textAlign: "center" }}>
              <div className="pixel-text qu-player__name">{isLocal ? "YOU" : p.name}</div>
              <div className="qu-player__turn" style={{ fontSize: "0.9rem" }}>{isTurn ? "YOUR TURN" : ""}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "inline-block", position: "relative", userSelect: "none" }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${size}, ${cellSize}px)`, gap: 8, position: "relative" }}>
          {Array.from({ length: size * size }).map((_, idx) => {
            const r = Math.floor(idx / size);
            const c = idx % size;
            const pawnIdx = gameState.pawns.findIndex((p) => p.r === r && p.c === c);
            const isPawn = pawnIdx >= 0;
            const isLegal = legalMoves.has(`${r},${c}`);
            return (
              <div
                key={`${r}-${c}`}
                onClick={() => handleCellClick(r, c)}
                className={`qu-cell ${isLegal ? "qu-cell--legal" : ""}`}
                style={{
                  width: cellSize,
                  height: cellSize,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  cursor: currentTurnIsLocal && !gameState.isGameOver ? "pointer" : "not-allowed",
                }}
              >
                {isPawn ? <div className={`qu-pawn qu-pawn--p${pawnIdx + 1}`}></div> : null}
              </div>
            );
          })}
          {/* Wall anchors overlay (size-1 x size-1) */}
          {Array.from({ length: (size - 1) * (size - 1) }).map((_, idx) => {
            const wr = Math.floor(idx / (size - 1));
            const wc = idx % (size - 1);
            const left = wc * (cellSize + 8) + cellSize;
            const top = wr * (cellSize + 8) + cellSize;
            // check if horizontal or vertical wall would be legal at this anchor
            const canPlaceH = validateMove(
              gameState,
              { type: "place_wall", orientation: "h", row: wr, col: wc, playerId: localPlayerIndex },
              localPlayerIndex,
            );
            const canPlaceV = validateMove(
              gameState,
              { type: "place_wall", orientation: "v", row: wr, col: wc, playerId: localPlayerIndex },
              localPlayerIndex,
            );

            // detect already-placed walls by checking the underlying blocked edges
            const wallsSet = new Set(gameState.walls);
            const hA1 = { r: wr, c: wc };
            const hB1 = { r: wr + 1, c: wc };
            const hA2 = { r: wr, c: wc + 1 };
            const hB2 = { r: wr + 1, c: wc + 1 };
            const vA1 = { r: wr, c: wc };
            const vB1 = { r: wr, c: wc + 1 };
            const vA2 = { r: wr + 1, c: wc };
            const vB2 = { r: wr + 1, c: wc + 1 };
            const isDrawnH = wallsSet.has(edgeKey(hA1, hB1)) && wallsSet.has(edgeKey(hA2, hB2));
            const isDrawnV = wallsSet.has(edgeKey(vA1, vB1)) && wallsSet.has(edgeKey(vA2, vB2));

            // Only render anchors if the wall is already placed or the local player can place one here
            if (!isDrawnH && !isDrawnV && !(currentTurnIsLocal && (canPlaceH || canPlaceV))) {
              return null;
            }

            const wallWidth = cellSize * 2 + 8;
            const wallHeight = 12;
            return (
              <div
                key={`anchor-${wr}-${wc}`}
                style={{ position: "absolute", left, top }}
                onMouseEnter={() => {
                  if (!currentTurnIsLocal) return;
                  const inferred: "h" | "v" | null = canPlaceH ? "h" : canPlaceV ? "v" : null;
                  setHoverAnchor({ r: wr, c: wc, orientation: inferred });
                }}
                onMouseLeave={() => setHoverAnchor(null)}
              >
                {isDrawnH ? (
                  <div className="qu-wall qu-wall--h qu-wall--drawn" style={{ width: wallWidth, height: wallHeight }} />
                ) : (
                  <>
                    <div
                      className={`qu-wall-anchor qu-wall-anchor--h ${currentTurnIsLocal && canPlaceH ? `qu-wall-anchor--preview-p${localPlayerIndex + 1}` : ""}`}
                      style={{ width: wallWidth, height: wallHeight }}
                      onClick={() => {
                        if (!currentTurnIsLocal) return;
                        if (canPlaceH) proposeMove({ type: "place_wall", orientation: "h", row: wr, col: wc, playerId: localPlayerIndex });
                      }}
                    />
                    {/* preview visual when hovered */}
                    {hoverAnchor && hoverAnchor.r === wr && hoverAnchor.c === wc && hoverAnchor.orientation === "h" ? (
                      <div className={`qu-wall qu-wall--h qu-wall--preview-p${localPlayerIndex + 1}`} style={{ width: wallWidth, height: wallHeight }} />
                    ) : null}
                  </>
                )}

                {isDrawnV ? (
                  <div className="qu-wall qu-wall--v qu-wall--drawn" style={{ width: wallHeight, height: wallWidth }} />
                ) : (
                  <>
                    <div
                      className={`qu-wall-anchor qu-wall-anchor--v ${currentTurnIsLocal && canPlaceV ? `qu-wall-anchor--preview-p${localPlayerIndex + 1}` : ""}`}
                      style={{ width: wallHeight, height: wallWidth }}
                      onClick={() => {
                        if (!currentTurnIsLocal) return;
                        if (!canPlaceH && canPlaceV) proposeMove({ type: "place_wall", orientation: "v", row: wr, col: wc, playerId: localPlayerIndex });
                      }}
                    />
                    {hoverAnchor && hoverAnchor.r === wr && hoverAnchor.c === wc && hoverAnchor.orientation === "v" ? (
                      <div className={`qu-wall qu-wall--v qu-wall--preview-p${localPlayerIndex + 1}`} style={{ width: wallHeight, height: wallWidth }} />
                    ) : null}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* No wall-mode controls: clicking an available anchor infers orientation (horizontal preferred) */}

      {/* Action Buttons */}
      {!gameState.isGameOver && !opponentLeft && (
        <div style={{ marginTop: "0.75rem" }}>
          <button className="arcade-btn arcade-btn--small arcade-btn--secondary" onClick={() => setShowConfirmExit(true)}>EXIT</button>
          <button className="arcade-btn arcade-btn--small arcade-btn--danger" style={{ marginLeft: 8 }} onClick={handleForfeit}>FORFEIT</button>
        </div>
      )}

      {/* Game Over Modal */}
      <Modal
        isOpen={gameState.isGameOver}
        title={gameState.winner === null ? "DRAW!" : gameState.winner === localPlayerIndex ? "YOU WIN!" : "YOU LOSE!"}
        variant={gameState.winner === localPlayerIndex ? "primary" : gameState.winner === null ? "secondary" : "danger"}
        actions={<button className="arcade-btn" onClick={() => (onReturnToLobby ? onReturnToLobby() : onExit?.())}>{onReturnToLobby ? "RETURN TO LOBBY" : "EXIT"}</button>}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          {gameState.winner !== null ? (
            <div className="pixel-text color-accent" style={{ fontSize: "1rem" }}>WINNER: {players[gameState.winner]?.name.toUpperCase()}</div>
          ) : (
            <div className="pixel-text color-dim" style={{ fontSize: "1rem" }}>STALEMATE</div>
          )}
        </div>
      </Modal>

      {/* Confirm Exit Modal */}
      <Modal isOpen={showConfirmExit} title="EXIT GAME?" variant="warning" onClose={() => setShowConfirmExit(false)} actions={<><button className="arcade-btn arcade-btn--secondary" onClick={() => setShowConfirmExit(false)}>CANCEL</button><button className="arcade-btn arcade-btn--danger" onClick={handleExit}>EXIT</button></>}>
        <p className="terminal-text color-dim" style={{ fontSize: "1.25rem" }}>This will count as a forfeit.</p>
      </Modal>
    </div>
  );
}

export const Quoridor: GameDefinition = {
  id: "quoridor",
  name: "QUORIDOR",
  minPlayers: 2,
  maxPlayers: 4,
  description: "Classic Quoridor — block opponents and reach the opposite side.",
  component: QuoridorGame,
  validateMove,
};
