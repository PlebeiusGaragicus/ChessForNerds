import cors from "cors";
import express from "express";
import { AiRuntime } from "./ai/aiRuntime.js";
import { EventHub } from "./events.js";
import { chessService } from "./matchStore.js";
import { createAiInternalRouter } from "./routes/aiInternal.js";
import { createMatchRouter } from "./routes/match.js";

export function createApp() {
  const app = express();
  const events = new EventHub();
  const ai = new AiRuntime(chessService, events);

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/match", createMatchRouter(chessService, events, ai));
  app.use("/api/ai", createAiInternalRouter(chessService, events, ai));

  return { app, service: chessService, events, ai };
}
