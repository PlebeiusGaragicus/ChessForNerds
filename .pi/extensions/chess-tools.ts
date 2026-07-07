import { Type } from "@sinclair/typebox";

const apiUrl = process.env.CHESS_API_URL ?? "http://localhost:3001";
const token = process.env.CHESS_TURN_TOKEN ?? "";
const allowedTools = new Set(
  (process.env.CHESS_ALLOWED_TOOLS ?? "")
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean)
);

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text);
  }
  return text;
}

const tools = {
  get_visible_state: {
    name: "get_visible_state",
    description:
      "Return your current view of the chess match: board, side to move, check status, and last move.",
    parameters: Type.Object({}),
    execute: async () => request("/api/ai/visible-state")
  },
  list_legal_moves: {
    name: "list_legal_moves",
    description:
      "Return every legal move for this turn. You must choose one listed move id for submit_move.",
    parameters: Type.Object({}),
    execute: async () => request("/api/ai/legal-moves")
  },
  submit_move: {
    name: "submit_move",
    description:
      "Commit exactly one move by id from list_legal_moves. This ends your turn. Include an optional short quip.",
    parameters: Type.Object({
      moveId: Type.String(),
      quip: Type.Optional(Type.String({ maxLength: 200 }))
    }),
    execute: async ({ moveId, quip }: { moveId: string; quip?: string }) =>
      request("/api/ai/submit-move", {
        method: "POST",
        body: JSON.stringify({ moveId, quip })
      })
  }
};

export default function register(pi: {
  registerTool: (tool: (typeof tools)[keyof typeof tools]) => void;
}) {
  for (const [name, tool] of Object.entries(tools)) {
    if (allowedTools.has(name)) {
      pi.registerTool(tool);
    }
  }
}
