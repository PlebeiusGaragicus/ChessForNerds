import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AiRunnerInput } from "./fakeRunner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

function buildPrompt(input: AiRunnerInput): string {
  const token = input.tokens.validate(input.token, "get_visible_state");
  const state = input.service.renderVisibleState(token.player);
  return [
    "/skill:play-turn",
    "/skill:persona-gambiteer",
    "",
    "It is your move. Use the chess tools to choose and submit exactly one move.",
    "",
    "Current board:",
    state
  ].join("\n");
}

export async function runRealPiTurn(input: AiRunnerInput): Promise<void> {
  const token = input.tokens.validate(input.token, "get_visible_state");
  const prompt = buildPrompt(input);
  const extensionPath = path.join(repoRoot, ".pi/extensions/chess-tools.ts");
  const playTurnSkill = path.join(repoRoot, ".pi/skills/play-turn/SKILL.md");
  const personaSkill = path.join(repoRoot, ".pi/skills/persona-gambiteer/SKILL.md");
  const child = spawn("pi", [
    "--mode",
    "rpc",
    "--no-builtin-tools",
    "--extension",
    extensionPath,
    "--skill",
    playTurnSkill,
    "--skill",
    personaSkill,
    "--tools",
    "get_visible_state,list_legal_moves,submit_move"
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CHESS_API_URL: process.env.CHESS_API_URL ?? "http://localhost:3001",
      CHESS_MATCH_ID: token.matchId,
      CHESS_PLAYER: token.player,
      CHESS_TURN_TOKEN: token.token,
      CHESS_ALLOWED_TOOLS: "get_visible_state,list_legal_moves,submit_move"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  input.events.publishAi("thinking", "pi process started.");

  const failures: string[] = [];
  child.stderr.on("data", (chunk) => {
    const message = String(chunk).trim();
    if (message) {
      input.events.publishAi("error", message);
    }
  });
  child.stdout.on("data", (chunk) => {
    const message = String(chunk).trim();
    if (message) {
      input.events.publishAi("tool_call", message.slice(0, 300));
    }
  });

  child.stdin.write(JSON.stringify({ id: "turn-1", type: "prompt", prompt }) + "\n");
  child.stdin.end();

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        failures.push(`pi exited with code ${code ?? "unknown"}`);
        reject(new Error(failures.join("; ")));
      }
    });
  });
}
