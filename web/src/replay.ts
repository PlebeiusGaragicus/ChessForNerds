import { Chess } from "chess.js";
import type { BoardPiece, MoveRecord } from "../../shared/types.js";

function boardFrom(chess: Chess): BoardPiece[] {
  const pieces: BoardPiece[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell) {
        pieces.push({
          square: cell.square,
          type: cell.type,
          color: cell.color === "w" ? "white" : "black"
        });
      }
    }
  }
  return pieces;
}

/**
 * Rebuild the board state after each ply by replaying SAN from the standard
 * start position. Index 0 is the initial position, index N is after move N.
 * If a move fails to apply (e.g. a match loaded from a custom FEN), the
 * timeline simply stops at the last reconstructable ply.
 */
export function buildHistoryBoards(moveHistory: MoveRecord[]): BoardPiece[][] {
  const chess = new Chess();
  const boards: BoardPiece[][] = [boardFrom(chess)];
  for (const move of moveHistory) {
    try {
      chess.move(move.san);
    } catch {
      break;
    }
    boards.push(boardFrom(chess));
  }
  return boards;
}
