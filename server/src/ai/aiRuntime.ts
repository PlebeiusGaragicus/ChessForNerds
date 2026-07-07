import type { ChessService } from "../chessService.js";
import type { EventHub } from "../events.js";
import { runFakePiTurn } from "./fakeRunner.js";
import { runRealPiTurn } from "./piRunner.js";
import { TurnTokenStore } from "./tokenStore.js";

const AI_TURN_TIMEOUT_MS = 30_000;
const AI_TOOLS = ["get_visible_state", "list_legal_moves", "submit_move"];
const REAL_PI_TOOLS = ["submit_move"];

export class AiRuntime {
  private activeTurn: Promise<void> | null = null;
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

  isThinking(): boolean {
    return this.activeTurn !== null;
  }

  reset(): void {
    this.tokens.clear();
    this.activeTurn = null;
  }

  private async playTurn(): Promise<void> {
    const beforeMoveCount = this.service.getPublicState().moveHistory.length;
    const turn = this.service.getPublicState();
    const token = this.tokens.mint({
      matchId: turn.id,
      player: turn.aiColor,
      turnNumber: turn.turnNumber,
      allowedTools: process.env.CHESS_USE_FAKE_PI === "1" ? AI_TOOLS : REAL_PI_TOOLS,
      ttlMs: AI_TURN_TIMEOUT_MS + 5_000
    });

    this.service.setAiThinking(true);
    this.events.publishMatch(this.service.getPublicState());
    this.events.publishAi("thinking", "Pi is thinking.");

    try {
      const runner = process.env.CHESS_USE_FAKE_PI === "1" ? runFakePiTurn : runRealPiTurn;
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
