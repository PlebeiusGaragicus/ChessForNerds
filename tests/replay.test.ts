import { describe, expect, it } from "vitest";
import { buildHistoryBoards } from "../web/src/replay.js";
import type { MoveRecord } from "../shared/types.js";

function record(san: string, index: number): MoveRecord {
  const color = index % 2 === 0 ? "white" : "black";
  return {
    id: `m${index}`,
    from: "",
    to: "",
    san,
    lan: "",
    color,
    turnNumber: Math.floor(index / 2) + 1
  };
}

describe("buildHistoryBoards", () => {
  it("returns just the start position for an empty history", () => {
    const boards = buildHistoryBoards([]);
    expect(boards).toHaveLength(1);
    expect(boards[0]).toHaveLength(32);
    expect(boards[0]).toContainEqual({ square: "e2", type: "p", color: "white" });
  });

  it("rebuilds one board state per ply", () => {
    const boards = buildHistoryBoards(["e4", "d5", "exd5"].map(record));
    expect(boards).toHaveLength(4);
    // After 1. e4 the pawn has left e2.
    expect(boards[1]).toContainEqual({ square: "e4", type: "p", color: "white" });
    expect(boards[1].some((p) => p.square === "e2")).toBe(false);
    // After the capture there are 31 pieces and a white pawn sits on d5.
    expect(boards[3]).toHaveLength(31);
    expect(boards[3]).toContainEqual({ square: "d5", type: "p", color: "white" });
  });

  it("stops at the last reconstructable ply on invalid SAN", () => {
    const boards = buildHistoryBoards(["e4", "Qxa8"].map(record));
    expect(boards).toHaveLength(2);
  });
});
