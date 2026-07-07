import { Router } from "express";
import type { AiRuntime } from "../ai/aiRuntime.js";
import type { ChessService } from "../chessService.js";
import type { EventHub } from "../events.js";

function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer ")) {
    return undefined;
  }
  return header.slice("Bearer ".length);
}

export function createAiInternalRouter(
  service: ChessService,
  events: EventHub,
  ai: AiRuntime
): Router {
  const router = Router();

  router.get("/visible-state", (req, res) => {
    try {
      const token = ai.tokens.validate(bearerToken(req.header("authorization")), "get_visible_state");
      res.type("text/plain").send(service.renderVisibleState(token.player));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(401).json({ error: message });
    }
  });

  router.get("/legal-moves", (req, res) => {
    try {
      ai.tokens.validate(bearerToken(req.header("authorization")), "list_legal_moves");
      const legalMoves = service.listLegalMoves();
      events.publishAi("tool_result", `Legal moves: ${legalMoves.map((move) => `${move.id} ${move.san}`).join(", ")}`);
      res
        .type("text/plain")
        .send(legalMoves.map((move) => `${move.id} ${move.san} (${move.lan})`).join("\n"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(401).json({ error: message });
    }
  });

  router.post("/submit-move", (req, res) => {
    try {
      const token = ai.tokens.validate(bearerToken(req.header("authorization")), "submit_move");
      if (token.usedSubmit) {
        res.status(409).json({ error: "move_rejected: submit_move was already used this turn." });
        return;
      }
      if (service.currentTurn() !== token.player || service.getPublicState().turnNumber !== token.turnNumber) {
        res.status(409).json({ error: "move_rejected: this turn token is stale." });
        return;
      }
      const { moveId, quip } = req.body as { moveId?: string; quip?: string };
      if (!moveId) {
        res.status(400).json({ error: "moveId is required." });
        return;
      }
      token.usedSubmit = true;
      const move = service.applyMoveById(moveId, token.player, quip?.slice(0, 200));
      events.publishAi("move", `Pi played ${move.san}${move.quip ? `: ${move.quip}` : ""}`);
      res.json({ ok: true, move });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  return router;
}
