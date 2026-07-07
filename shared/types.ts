export type PlayerColor = "white" | "black";

export type GameStatus =
  | "active"
  | "checkmate"
  | "stalemate"
  | "draw"
  | "resigned";

export type PieceSymbol = "p" | "n" | "b" | "r" | "q" | "k";

export interface BoardPiece {
  square: string;
  type: PieceSymbol;
  color: PlayerColor;
}

export interface LegalMove {
  id: string;
  from: string;
  to: string;
  san: string;
  lan: string;
  promotion?: string;
}

export interface MoveRecord extends LegalMove {
  color: PlayerColor;
  turnNumber: number;
  quip?: string;
  fallback?: boolean;
}

export interface ChatMessage {
  id: string;
  from: "human" | "pi";
  text: string;
  turnNumber: number;
  createdAt: string;
}

export interface AiEvent {
  id: string;
  type:
    | "thinking"
    | "tool_call"
    | "tool_result"
    | "move"
    | "fallback"
    | "error"
    | "done";
  message: string;
  createdAt: string;
}

export interface PublicMatchState {
  id: string;
  fen: string;
  board: BoardPiece[];
  turn: PlayerColor;
  humanColor: PlayerColor;
  aiColor: PlayerColor;
  status: GameStatus;
  inCheck: boolean;
  turnNumber: number;
  legalMoves: LegalMove[];
  moveHistory: MoveRecord[];
  chat: ChatMessage[];
  aiThinking: boolean;
  aiEvents: AiEvent[];
}
