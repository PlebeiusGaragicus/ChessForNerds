import { describe, expect, it } from "vitest";
import { ChessService } from "../server/src/chessService.js";

describe("ChessService", () => {
  it("generates legal opening moves and applies a human move", () => {
    const service = new ChessService();

    expect(service.getPublicState().legalMoves).toHaveLength(20);
    const move = service.applyHumanMove("e2", "e4");

    expect(move.san).toBe("e4");
    expect(service.currentTurn()).toBe("black");
    expect(service.getPublicState().legalMoves).toHaveLength(0);
  });

  it("uses current legal move ids for AI moves", () => {
    const service = new ChessService();
    service.applyHumanMove("e2", "e4");

    const legalMoves = service.listLegalMoves();
    const selected = legalMoves.find((move) => move.san === "e5");
    expect(selected).toBeDefined();

    const move = service.applyMoveById(selected!.id, "black", "Center claimed.");
    expect(move.san).toBe("e5");
    expect(move.quip).toBe("Center claimed.");
  });

  it("rejects stale or unknown move ids with a useful error", () => {
    const service = new ChessService();
    service.applyHumanMove("e2", "e4");
    service.listLegalMoves();

    expect(() => service.applyMoveById("m999", "black")).toThrow(/current legal set/);
  });

  it("marks deterministic fallback moves in history", () => {
    const service = new ChessService();
    service.applyHumanMove("e2", "e4");

    const fallback = service.applyFallbackMove("black");
    expect(fallback.fallback).toBe(true);
    expect(service.getPublicState().moveHistory.at(-1)?.fallback).toBe(true);
  });
});
