import { Router } from "express";
import type { AiRuntime } from "../ai/aiRuntime.js";
import type { ChessService } from "../chessService.js";
import type { EventHub } from "../events.js";

function stateWithEvents(service: ChessService, events: EventHub) {
  return {
    ...service.getPublicState(),
    aiEvents: events.getAiEvents()
  };
}

export function createMatchRouter(service: ChessService, events: EventHub, ai: AiRuntime): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(stateWithEvents(service, events));
  });

  router.post("/reset", (_req, res) => {
    ai.reset();
    events.clearAiEvents();
    service.reset();
    const state = stateWithEvents(service, events);
    events.publishMatch(state);
    res.json(state);
  });

  router.post("/move", (req, res) => {
    const { from, to, promotion } = req.body as {
      from?: string;
      to?: string;
      promotion?: string;
    };
    if (!from || !to) {
      res.status(400).json({ error: "from and to are required." });
      return;
    }

    try {
      service.applyHumanMove(from, to, promotion);
      const state = stateWithEvents(service, events);
      events.publishMatch(state);
      ai.maybePlayTurn();
      res.json(stateWithEvents(service, events));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  router.get("/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    res.write(`event: match\ndata: ${JSON.stringify(stateWithEvents(service, events))}\n\n`);

    const unsubscribe = events.subscribe((event, payload) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    });

    req.on("close", unsubscribe);
  });

  return router;
}
