# ChessForNerds

This repo attempts to make tangible the thesis outlined in [docs/methodology.md](docs/methodology.md) - namely, that applications can be ai-enhanced with the [`pi` coding agent](https://www.pi.dev) with custom tooling instead of heavy directed-graph-based frameworks like LangGraph.

This application is a simple game of Chess in the browser. The opponent will be our pi agent.

## Run

```bash
npm install
npm run dev
```

By default, Black is played by the real `pi` agent through the scoped chess
extension. Use `npm run dev:fake` only for deterministic development tests.
