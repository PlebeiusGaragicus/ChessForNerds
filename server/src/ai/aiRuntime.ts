import type { ChessService } from "../chessService.js";
import type { EventHub } from "../events.js";
import { runFakePiChat, runFakePiTurn } from "./fakeRunner.js";
import { runRealPiChat, runRealPiTurn } from "./piRunner.js";
import { TurnTokenStore } from "./tokenStore.js";

const AI_TURN_TIMEOUT_MS = 30_000;
const AI_CHAT_TIMEOUT_MS = 20_000;
const FAKE_TURN_TOOLS = ["get_visible_state", "list_legal_moves", "submit_move"];
const REAL_TURN_TOOLS = ["submit_move"];
const CHAT_TOOLS = ["send_chat"];
const FALLBACK_CHAT_LINE = "The Gambiteer studies the board in silence.";

export class AiRuntime {
  private activeTurn: Promise<void> | null = null;
  private activeChat: Promise<void> | null = null;
  readonly tokens = new TurnTokenStore();

  constructor(
    private readonly service: ChessService,
    private readonly events: EventHub
  ) {}

  maybePlayTurn(): void {
    if (!this.service.isAiTurn() || this.activeTurn) {
      return;
    }

    this.activeTurn = this.playTurn().finally(() => {
      this.activeTurn = null;
    });
  }

  maybeReplyToChat(): void {
    // If it is (or is about to be) the AI's move, the reply arrives as a move
    // quip instead; a chat run and a turn run never overlap.
    if (this.activeTurn || this.activeChat || this.service.isAiTurn()) {
      return;
    }

    this.activeChat = this.replyToChat().finally(() => {
      this.activeChat = null;
    });
  }

  isThinking(): boolean {
    return this.activeTurn !== null || this.activeChat !== null;
  }

  reset(): void {
    this.tokens.clear();
    this.activeTurn = null;
    this.activeChat = null;
  }

  private useFakePi(): boolean {
    return process.env.CHESS_USE_FAKE_PI === "1";
  }

  private async playTurn(): Promise<void> {
    const beforeMoveCount = this.service.getPublicState().moveHistory.length;
    const turn = this.service.getPublicState();
    const token = this.tokens.mint({
      matchId: turn.id,
      player: turn.aiColor,
      turnNumber: turn.turnNumber,
      allowedTools: this.useFakePi() ? FAKE_TURN_TOOLS : REAL_TURN_TOOLS,
      ttlMs: AI_TURN_TIMEOUT_MS + 5_000
    });

    this.service.setAiThinking(true);
    this.events.publishMatch(this.service.getPublicState());
    this.events.publishAi("thinking", "Pi is thinking.");

    try {
      const runner = this.useFakePi() ? runFakePiTurn : runRealPiTurn;
      await this.withTimeout(
        runner({ token: token.token, service: this.service, events: this.events, tokens: this.tokens }),
        AI_TURN_TIMEOUT_MS
      );
      const afterMoveCount = this.service.getPublicState().moveHistory.length;
      if (afterMoveCount <= beforeMoveCount) {
        throw new Error("ai_turn_failed: agent ended without submitting a move.");
      }
      this.events.publishAi("done", "Pi turn completed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.events.publishAi("fallback", `AI fallback applied: ${message}`);
      this.service.applyFallbackMove(token.player);
    } finally {
      this.tokens.revoke(token.token);
      this.service.setAiThinking(false);
      this.events.publishMatch(this.service.getPublicState());
    }
  }

  private async replyToChat(): Promise<void> {
    const piChatCountBefore = this.countPiChat();
    const state = this.service.getPublicState();
    const token = this.tokens.mint({
      matchId: state.id,
      player: state.aiColor,
      turnNumber: state.turnNumber,
      allowedTools: CHAT_TOOLS,
      ttlMs: AI_CHAT_TIMEOUT_MS + 5_000
    });

    this.events.publishAi("thinking", "Pi is composing a chat reply.");

    try {
      const runner = this.useFakePi() ? runFakePiChat : runRealPiChat;
      await this.withTimeout(
        runner({ token: token.token, service: this.service, events: this.events, tokens: this.tokens }),
        AI_CHAT_TIMEOUT_MS
      );
      if (this.countPiChat() <= piChatCountBefore) {
        throw new Error("ai_chat_failed: agent ended without sending a chat reply.");
      }
      this.events.publishAi("done", "Pi chat reply delivered.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.events.publishAi("fallback", `AI chat fallback applied: ${message}`);
      this.service.appendChat("pi", FALLBACK_CHAT_LINE);
    } finally {
      this.tokens.revoke(token.token);
      this.events.publishMatch(this.service.getPublicState());
    }
  }

  private countPiChat(): number {
    return this.service.getPublicState().chat.filter((message) => message.from === "pi").length;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("deadline_exceeded")), timeoutMs);
        })
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}
