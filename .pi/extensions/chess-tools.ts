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

function textResult(text: string) {
  return {
    content: [{ type: "text", text }]
  };
}

const tools = {
  get_visible_state: {
    name: "get_visible_state",
    label: "Visible State",
    description:
      "Return your current view of the chess match: board, side to move, check status, and last move.",
    parameters: Type.Object({}),
    execute: async () => textResult(await request("/api/ai/visible-state"))
  },
  list_legal_moves: {
    name: "list_legal_moves",
    label: "List Legal Moves",
    description:
      "Return every legal move for this turn. You must choose one listed move id for submit_move.",
    parameters: Type.Object({}),
    execute: async () => textResult(await request("/api/ai/legal-moves"))
  },
  submit_move: {
    name: "submit_move",
    label: "Submit Move",
    description:
      "Commit exactly one move by id from list_legal_moves. This ends your turn. Include an optional short quip.",
    parameters: Type.Object({
      moveId: Type.String(),
      quip: Type.Optional(Type.String({ maxLength: 200 }))
    }),
    execute: async (
      _toolCallId: string,
      params: { moveId: string; quip?: string }
    ) =>
      textResult(
        await request("/api/ai/submit-move", {
          method: "POST",
          body: JSON.stringify({ moveId: params.moveId, quip: params.quip })
        })
      )
  },
  send_chat: {
    name: "send_chat",
    label: "Send Chat",
    description:
      "Say something in-character to your opponent. Keep it under 200 characters. Chat never changes the game state.",
    parameters: Type.Object({
      message: Type.String({ maxLength: 200 })
    }),
    execute: async (_toolCallId: string, params: { message: string }) =>
      textResult(
        await request("/api/ai/chat", {
          method: "POST",
          body: JSON.stringify({ message: params.message })
        })
      )
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
