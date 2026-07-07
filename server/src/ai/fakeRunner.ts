import type { ChessService } from "../chessService.js";
import type { EventHub } from "../events.js";
import type { TurnTokenStore } from "./tokenStore.js";

export interface AiRunnerInput {
  token: string;
  service: ChessService;
  events: EventHub;
  tokens: TurnTokenStore;
}

export async function runFakePiTurn(input: AiRunnerInput): Promise<void> {
  input.events.publishAi("thinking", "Fake pi is reading the board.");
  await new Promise((resolve) => setTimeout(resolve, 25));
  const token = input.tokens.validate(input.token, "list_legal_moves");
  const legalMoves = input.service.listLegalMoves();
  input.events.publishAi("tool_result", `Listed ${legalMoves.length} legal moves.`);
  const selected = legalMoves[0];
  if (!selected) {
    throw new Error("fake_pi_failed: no legal move was available.");
  }
  input.tokens.validate(input.token, "submit_move").usedSubmit = true;
  const move = input.service.applyMoveById(selected.id, token.player, "A precise little move.");
  input.events.publishAi("move", `Fake pi played ${move.san}.`);
}

export async function runFakePiChat(input: AiRunnerInput): Promise<void> {
  input.events.publishAi("thinking", "Fake pi is composing a reply.");
  await new Promise((resolve) => setTimeout(resolve, 25));
  input.tokens.validate(input.token, "send_chat");
  const lastHuman = input.service
    .getPublicState()
    .chat.filter((message) => message.from === "human")
    .at(-1);
  const reply = input.service.appendChat(
    "pi",
    lastHuman ? `Bold words for someone in your position.` : `Your move, friend.`
  );
  input.events.publishAi("chat", `Fake pi replied: ${reply.text}`);
}
