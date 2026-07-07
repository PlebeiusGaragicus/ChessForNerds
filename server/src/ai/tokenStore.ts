import { randomUUID } from "node:crypto";
import type { PlayerColor } from "../../../shared/types.js";

export interface TurnToken {
  token: string;
  matchId: string;
  player: PlayerColor;
  turnNumber: number;
  allowedTools: Set<string>;
  expiresAt: number;
  usedSubmit: boolean;
}

export class TurnTokenStore {
  private readonly tokens = new Map<string, TurnToken>();

  mint(input: {
    matchId: string;
    player: PlayerColor;
    turnNumber: number;
    allowedTools: string[];
    ttlMs: number;
  }): TurnToken {
    const turnToken: TurnToken = {
      token: randomUUID(),
      matchId: input.matchId,
      player: input.player,
      turnNumber: input.turnNumber,
      allowedTools: new Set(input.allowedTools),
      expiresAt: Date.now() + input.ttlMs,
      usedSubmit: false
    };
    this.tokens.set(turnToken.token, turnToken);
    return turnToken;
  }

  validate(token: string | undefined, toolName: string): TurnToken {
    if (!token) {
      throw new Error("auth_rejected: missing turn token.");
    }
    const turnToken = this.tokens.get(token);
    if (!turnToken) {
      throw new Error("auth_rejected: unknown turn token.");
    }
    if (Date.now() > turnToken.expiresAt) {
      this.tokens.delete(token);
      throw new Error("auth_rejected: turn token expired.");
    }
    if (!turnToken.allowedTools.has(toolName)) {
      throw new Error(`auth_rejected: tool ${toolName} is not allowed for this turn.`);
    }
    return turnToken;
  }

  revoke(token: string): void {
    this.tokens.delete(token);
  }

  clear(): void {
    this.tokens.clear();
  }
}
