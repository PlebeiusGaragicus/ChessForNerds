import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardPiece, LegalMove, PublicMatchState } from "../../shared/types.js";
import { startFx, type FxEngine } from "./fx.js";
import { startSpaceBackground } from "./spaceBackground.js";

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const ranks = [8, 7, 6, 5, 4, 3, 2, 1];

const pieceGlyph: Record<string, string> = {
  whitek: "♔",
  whiteq: "♕",
  whiter: "♖",
  whiteb: "♗",
  whiten: "♘",
  whitep: "♙",
  blackk: "♚",
  blackq: "♛",
  blackr: "♜",
  blackb: "♝",
  blackn: "♞",
  blackp: "♟"
};

function pieceAt(board: BoardPiece[], square: string): BoardPiece | undefined {
  return board.find((piece) => piece.square === square);
}

function statusText(match: PublicMatchState): string {
  if (match.status === "active") {
    return `${match.turn === match.humanColor ? "Your" : "Pi's"} turn${
      match.inCheck ? " (check)" : ""
    }`;
  }
  return `${match.status}${match.inCheck ? " by check" : ""}`;
}

function squareCenter(square: string): { x: number; y: number } | null {
  const el = document.querySelector(`.board [aria-label="${square}"]`);
  if (!el) {
    return null;
  }
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

type Theme = "space" | "classic";

function initialTheme(): Theme {
  try {
    return localStorage.getItem("cfn-theme") === "classic" ? "classic" : "space";
  } catch {
    return "space";
  }
}

export function App() {
  const [match, setMatch] = useState<PublicMatchState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [chatText, setChatText] = useState("");
  const [chatExpanded, setChatExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const chatLogRef = useRef<HTMLUListElement | null>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fxRef = useRef<FxEngine | null>(null);
  const seenMoveCount = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("cfn-theme", theme);
    } catch {
      // Private browsing or blocked storage; theme just won't persist.
    }
  }, [theme]);

  useEffect(() => {
    if (!fxCanvasRef.current) {
      return;
    }
    const engine = startFx(fxCanvasRef.current);
    fxRef.current = engine;
    return () => {
      fxRef.current = null;
      engine.destroy();
    };
  }, []);

  useEffect(() => {
    if (theme !== "space" || !bgCanvasRef.current) {
      return;
    }
    return startSpaceBackground(bgCanvasRef.current);
  }, [theme]);

  useEffect(() => {
    if (theme !== "space") {
      return;
    }
    let lastX = -100;
    let lastY = -100;
    function onMove(event: MouseEvent) {
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (dx * dx + dy * dy < 64) {
        return;
      }
      lastX = event.clientX;
      lastY = event.clientY;
      fxRef.current?.trail(event.clientX, event.clientY);
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [theme]);

  useEffect(() => {
    void refresh();
    const events = new EventSource("/api/match/events");
    events.addEventListener("match", (event) => {
      setMatch(JSON.parse((event as MessageEvent).data) as PublicMatchState);
    });
    events.addEventListener("ai-event", () => {
      void refresh();
    });
    return () => events.close();
  }, []);

  useEffect(() => {
    const log = chatLogRef.current;
    if (log) {
      log.scrollTop = log.scrollHeight;
    }
  }, [match?.chat.length, chatExpanded]);

  const legalFromSelected = useMemo(() => {
    if (!match || !selected) {
      return [];
    }
    return match.legalMoves.filter((move) => move.from === selected);
  }, [match, selected]);

  const checkedKingSquare = useMemo(() => {
    if (!match || !match.inCheck) {
      return null;
    }
    return (
      match.board.find((piece) => piece.type === "k" && piece.color === match.turn)?.square ?? null
    );
  }, [match]);

  useEffect(() => {
    if (!match) {
      return;
    }
    const count = match.moveHistory.length;
    const previous = seenMoveCount.current;
    seenMoveCount.current = count;
    if (previous === null || count !== previous + 1) {
      return;
    }
    const move = match.moveHistory[count - 1];
    const from = squareCenter(move.from);
    const to = squareCenter(move.to);
    const fx = fxRef.current;
    if (!from || !to || !fx) {
      return;
    }
    const capture = move.san.includes("x");
    const hue = move.color === "white" ? 190 : 335;
    fx.laser(from.x, from.y, to.x, to.y, hue, () => {
      fx.explosion(to.x, to.y, capture ? 1.15 : 0.3);
    });
  }, [match]);

  async function refresh() {
    const response = await fetch("/api/match");
    setMatch((await response.json()) as PublicMatchState);
  }

  async function reset() {
    setSelected(null);
    setError(null);
    const response = await fetch("/api/match/reset", { method: "POST" });
    setMatch((await response.json()) as PublicMatchState);
  }

  async function submitMove(move: LegalMove) {
    setError(null);
    const response = await fetch("/api/match/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: move.from, to: move.to, promotion: move.promotion ?? "q" })
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Move rejected.");
      return;
    }
    setSelected(null);
    setMatch(body as PublicMatchState);
  }

  async function submitChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/match/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: chatText })
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Chat rejected.");
      return;
    }
    setChatText("");
    setMatch(body as PublicMatchState);
  }

  function onSquareClick(square: string) {
    if (!match || match.turn !== match.humanColor || match.status !== "active") {
      return;
    }

    const destination = legalFromSelected.find((move) => move.to === square);
    if (destination) {
      void submitMove(destination);
      return;
    }

    const hasLegalMove = match.legalMoves.some((move) => move.from === square);
    setSelected(hasLegalMove ? square : null);
  }

  const backdrop = (
    <>
      {theme === "space" && <canvas ref={bgCanvasRef} className="space-bg" aria-hidden="true" />}
      <canvas ref={fxCanvasRef} className="fx-layer" aria-hidden="true" />
    </>
  );

  if (!match) {
    return (
      <>
        {backdrop}
        <main className="app">Loading chess board...</main>
      </>
    );
  }

  return (
    <>
    {backdrop}
    <main className="app">
      <section className="hero">
        <div>
          <p className="eyebrow">ChessForNerds</p>
          <h1>Play chess against pi</h1>
          <p>
            The server owns the rules. Pi only sees legal move IDs and submits one move
            when it is Black's turn.
          </p>
        </div>
        <div className="hero-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === "space" ? "classic" : "space"))}
            aria-pressed={theme === "space"}
          >
            {theme === "space" ? "☀️ Classic mode" : "🚀 Space mode"}
          </button>
          <button onClick={reset}>Reset match</button>
        </div>
      </section>

      <section className="layout">
        <aside className="panel history-panel" aria-label="Move history">
          <h3>Move History</h3>
          <ol className="history">
            {match.moveHistory.map((move) => (
              <li key={move.id}>
                <strong>{move.color}</strong> {move.san}
                {move.quip ? <span className="quip"> “{move.quip}”</span> : null}
                {move.fallback ? <span className="fallback"> fallback</span> : null}
              </li>
            ))}
          </ol>
        </aside>

        <div className="board" aria-label="Chess board">
          {ranks.map((rank) =>
            files.map((file) => {
              const square = `${file}${rank}`;
              const piece = pieceAt(match.board, square);
              const legalTarget = legalFromSelected.some((move) => move.to === square);
              const isSelected = selected === square;
              const inCheck = checkedKingSquare === square;
              return (
                <button
                  key={square}
                  className={`square ${(rank + files.indexOf(file)) % 2 === 0 ? "light" : "dark"}${
                    isSelected ? " selected" : ""
                  }${legalTarget ? " legal" : ""}${inCheck ? " in-check" : ""}`}
                  onClick={() => onSquareClick(square)}
                  aria-label={square}
                >
                  <span className={`piece${piece ? ` ${piece.color}` : ""}`}>
                    {piece ? pieceGlyph[`${piece.color}${piece.type}`] : ""}
                  </span>
                  <span className="coord">{square}</span>
                  {inCheck && (
                    <svg className="crosshair" viewBox="0 0 100 100" aria-hidden="true">
                      <circle className="ch-outer" cx="50" cy="50" r="41" />
                      <circle className="ch-inner" cx="50" cy="50" r="28" />
                      <line x1="50" y1="1" x2="50" y2="18" />
                      <line x1="50" y1="82" x2="50" y2="99" />
                      <line x1="1" y1="50" x2="18" y2="50" />
                      <line x1="82" y1="50" x2="99" y2="50" />
                      <circle className="ch-dot" cx="50" cy="50" r="2.5" />
                    </svg>
                  )}
                </button>
              );
            })
          )}
        </div>

        <aside className="panel status-panel" aria-label="AI status">
          <h2>{statusText(match)}</h2>
          {match.aiThinking && <p className="thinking">Pi is thinking...</p>}
          {error && <p className="error">{error}</p>}

          <h3>Pi Status</h3>
          <ul className="events">
            {match.aiEvents.slice(-8).map((event) => (
              <li key={event.id}>
                <span>{event.type}</span> {event.message}
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <section className={`chat-dock panel${chatExpanded ? " expanded" : ""}`} aria-label="Table talk">
        <div className="chat-dock-header">
          <h3>Table Talk</h3>
          <button
            type="button"
            className="chat-toggle"
            onClick={() => setChatExpanded((open) => !open)}
            aria-expanded={chatExpanded}
          >
            {chatExpanded ? "Collapse" : `Expand (${match.chat.length})`}
          </button>
        </div>
        <ul className="chat" ref={chatLogRef}>
          {(chatExpanded ? match.chat : match.chat.slice(-1)).map((message) => (
            <li key={message.id}>
              <strong>{message.from}</strong> {message.text}
            </li>
          ))}
          {match.chat.length === 0 && (
            <li className="chat-empty">No table talk yet. Try to bait the Gambiteer.</li>
          )}
        </ul>
        <form className="chat-form" onSubmit={submitChat}>
          <input
            value={chatText}
            maxLength={200}
            onChange={(event) => setChatText(event.target.value)}
            placeholder="Try to bait the Gambiteer..."
          />
          <button type="submit" disabled={!chatText.trim()}>
            Send
          </button>
        </form>
      </section>
    </main>
    </>
  );
}
