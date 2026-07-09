import { Chess, type Move, type Square } from "chess.js";
import type {
  BoardPiece,
  ChatMessage,
  GameStatus,
  LegalMove,
  MoveRecord,
  PlayerColor,
  PublicMatchState
} from "../../shared/types.js";

const MATCH_ID = "local";

interface MatchDoc {
  id: string;
  chess: Chess;
  humanColor: PlayerColor;
  aiColor: PlayerColor;
  turnNumber: number;
  moveHistory: MoveRecord[];
  chat: ChatMessage[];
  legalMenu: LegalMove[];
  aiThinking: boolean;
}

function toPlayerColor(color: "w" | "b"): PlayerColor {
  return color === "w" ? "white" : "black";
}

function toChessColor(color: PlayerColor): "w" | "b" {
  return color === "white" ? "w" : "b";
}

function buildLan(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function statusFor(chess: Chess): GameStatus {
  if (chess.isCheckmate()) {
    return "checkmate";
  }
  if (chess.isStalemate()) {
    return "stalemate";
  }
  if (chess.isDraw()) {
    return "draw";
  }
  return "active";
}

function boardFor(chess: Chess): BoardPiece[] {
  const pieces: BoardPiece[] = [];
  for (const rank of chess.board()) {
    for (const piece of rank) {
      if (!piece) {
        continue;
      }
      pieces.push({
        square: piece.square,
        type: piece.type,
        color: toPlayerColor(piece.color)
      });
    }
  }
  return pieces;
}

export class ChessService {
  private match = this.createMatch();

  reset(): PublicMatchState {
    this.match = this.createMatch();
    return this.getPublicState();
  }

  getPublicState(): PublicMatchState {
    const legalMoves =
      this.currentTurn() === this.match.humanColor ? this.listLegalMoves() : [];

    return {
      id: this.match.id,
      fen: this.match.chess.fen(),
      board: boardFor(this.match.chess),
      turn: this.currentTurn(),
      humanColor: this.match.humanColor,
      aiColor: this.match.aiColor,
      status: statusFor(this.match.chess),
      inCheck: this.match.chess.inCheck(),
      turnNumber: this.match.turnNumber,
      legalMoves,
      moveHistory: [...this.match.moveHistory],
      chat: [...this.match.chat],
      aiThinking: this.match.aiThinking,
      aiEvents: []
    };
  }

  loadFen(fen: string): PublicMatchState {
    this.match = {
      ...this.createMatch(),
      chess: new Chess(fen)
    };
    return this.getPublicState();
  }

  currentTurn(): PlayerColor {
    return toPlayerColor(this.match.chess.turn());
  }

  isAiTurn(): boolean {
    return this.status() === "active" && this.currentTurn() === this.match.aiColor;
  }

  status(): GameStatus {
    return statusFor(this.match.chess);
  }

  setAiThinking(value: boolean): void {
    this.match.aiThinking = value;
  }

  listLegalMoves(): LegalMove[] {
    const verboseMoves = this.match.chess.moves({ verbose: true });
    const legalMoves = verboseMoves.map((move, index) => ({
      id: `m${index + 1}`,
      from: move.from,
      to: move.to,
      san: move.san,
      lan: buildLan(move),
      promotion: move.promotion
    }));
    this.match.legalMenu = legalMoves;
    return legalMoves;
  }

  applyHumanMove(from: string, to: string, promotion = "q"): MoveRecord {
    if (this.currentTurn() !== this.match.humanColor) {
      throw new Error("move_rejected: it is not the human player's turn.");
    }
    return this.applyMove({ from, to, promotion }, this.match.humanColor);
  }

  applyMoveById(moveId: string, color: PlayerColor, quip?: string): MoveRecord {
    if (this.currentTurn() !== color) {
      throw new Error(`move_rejected: it is ${this.currentTurn()}'s turn, not ${color}'s.`);
    }

    const menu = this.match.legalMenu.length > 0 ? this.match.legalMenu : this.listLegalMoves();
    const selected = menu.find((move) => move.id === moveId);
    if (!selected) {
      const current = menu.map((move) => `${move.id} ${move.san}`).join(", ");
      throw new Error(
        `move_rejected: ${moveId} is not in the current legal set. Current legal moves: ${current}.`
      );
    }

    return this.applyMove(
      {
        from: selected.from,
        to: selected.to,
        promotion: selected.promotion ?? "q"
      },
      color,
      quip
    );
  }

  appendChat(from: ChatMessage["from"], text: string): ChatMessage {
    const cleaned = text.replace(/[^\S\r\n]+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trim();
    if (!cleaned) {
      throw new Error("chat_rejected: message is empty.");
    }

    const message: ChatMessage = {
      id: `chat${this.match.chat.length + 1}`,
      from,
      text: cleaned.slice(0, 200),
      turnNumber: this.match.turnNumber,
      createdAt: new Date().toISOString()
    };
    this.match.chat.push(message);
    return message;
  }

  renderVisibleState(color: PlayerColor): string {
    const rows = this.match.chess
      .board()
      .map((rank, index) => {
        const rankNumber = 8 - index;
        const cells = rank
          .map((piece) => {
            if (!piece) {
              return "..";
            }
            const symbol = piece.color === "w" ? piece.type.toUpperCase() : piece.type;
            return `${symbol}${piece.square}`;
          })
          .join(" ");
        return `${rankNumber}: ${cells}`;
      })
      .join("\n");
    const lastMove = this.match.moveHistory.at(-1);
    const recentChat = this.match.chat
      .slice(-6)
      .map((message) => `[${message.from}] ${message.text}`)
      .join("\n");
    return [
      `match ${this.match.id}`,
      `you are ${color}; turn ${this.match.turnNumber}; side to move: ${this.currentTurn()}`,
      `status: ${this.status()}${this.match.chess.inCheck() ? " (check)" : ""}`,
      `last move: ${lastMove ? `${lastMove.color} ${lastMove.san}` : "none"}`,
      "recent table talk:",
      recentChat || "none",
      "board:",
      rows,
      "files: a b c d e f g h"
    ].join("\n");
  }

  private createMatch(): MatchDoc {
    return {
      id: MATCH_ID,
      chess: new Chess(),
      humanColor: "white",
      aiColor: "black",
      turnNumber: 1,
      moveHistory: [],
      chat: [],
      legalMenu: [],
      aiThinking: false
    };
  }

  private applyMove(
    moveInput: { from: string; to: string; promotion?: string },
    color: PlayerColor,
    quip?: string
  ): MoveRecord {
    const turnBeforeMove = this.match.turnNumber;
    const move = this.match.chess.move({
      from: moveInput.from as Square,
      to: moveInput.to as Square,
      promotion: moveInput.promotion
    });
    if (!move) {
      throw new Error(
        `move_rejected: ${moveInput.from}-${moveInput.to} is illegal. Call list_legal_moves for valid options.`
      );
    }
    if (move.color !== toChessColor(color)) {
      throw new Error(`move_rejected: ${color} cannot move ${move.san}.`);
    }

    const record: MoveRecord = {
      id: `ply${this.match.moveHistory.length + 1}`,
      from: move.from,
      to: move.to,
      san: move.san,
      lan: buildLan(move),
      promotion: move.promotion,
      color,
      turnNumber: turnBeforeMove,
      quip
    };
    this.match.moveHistory.push(record);
    this.match.legalMenu = [];
    if (this.currentTurn() === "white") {
      this.match.turnNumber += 1;
    }
    // Move quips are Pi's table talk; surface them in the game chat rather
    // than burying them in the move record. Only AI move paths pass a quip.
    if (record.quip) {
      this.appendChat("pi", record.quip);
    }
    return record;
  }
}
