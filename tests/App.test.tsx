import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../web/src/App.js";
import type { PublicMatchState } from "../shared/types.js";

class MockEventSource {
  static instances: MockEventSource[] = [];
  onclose?: () => void;

  constructor(public readonly url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener = vi.fn();
  close = vi.fn(() => this.onclose?.());
}

const initialState: PublicMatchState = {
  id: "local",
  fen: "start",
  board: [
    { square: "e1", type: "k", color: "white" },
    { square: "e8", type: "k", color: "black" }
  ],
  turn: "white",
  humanColor: "white",
  aiColor: "black",
  status: "active",
  inCheck: false,
  turnNumber: 1,
  legalMoves: [],
  moveHistory: [],
  chat: [],
  aiThinking: false,
  aiEvents: []
};

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(initialState), { status: 200 }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    MockEventSource.instances.length = 0;
  });

  it("renders the chess board and status after loading state", async () => {
    render(<App />);

    expect(await screen.findByText("ChessForNerds")).toBeInTheDocument();
    expect(await screen.findByText("Your turn")).toBeInTheDocument();
    expect(screen.getByLabelText("e1")).toHaveTextContent("♔");
  });
});
