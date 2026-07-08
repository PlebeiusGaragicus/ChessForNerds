import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardPiece, LegalMove, PublicMatchState } from "../../shared/types.js";
import { startFx, type FxEngine } from "./fx.js";
import { startSpaceBackground } from "./spaceBackground.js";
import { buildHistoryBoards } from "./replay.js";

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

type FeedItem =
  | { kind: "event"; id: string; at: string; type: string; text: string }
  | { kind: "chat"; id: string; at: string; from: "human" | "pi"; text: string };

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
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [hoverPly, setHoverPly] = useState<number | null>(null);
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

  const feed = useMemo<FeedItem[]>(() => {
    if (!match) {
      return [];
    }
    // Chat lands in the feed as proper messages; thinking/tool/done chatter is
    // noise (the live "Pi is thinking..." indicator covers it).
    const meaningful = new Set(["move", "fallback", "error"]);
    const events = match.aiEvents
      .filter((event) => meaningful.has(event.type))
      .map<FeedItem>((event) => ({
        kind: "event",
        id: event.id,
        at: event.createdAt,
        type: event.type,
        text: event.message
      }));
    const chats = match.chat.map<FeedItem>((message) => ({
      kind: "chat",
      id: message.id,
      at: message.createdAt,
      from: message.from,
      text: message.text
    }));
    return [...events, ...chats].sort((a, b) => a.at.localeCompare(b.at));
  }, [match]);

  useEffect(() => {
    const log = chatLogRef.current;
    if (log) {
      log.scrollTop = log.scrollHeight;
    }
  }, [feed.length]);

  const legalFromSelected = useMemo(() => {
    if (!match || !selected) {
      return [];
    }
    return match.legalMoves.filter((move) => move.from === selected);
  }, [match, selected]);

  const historyBoards = useMemo(
    () => (match ? buildHistoryBoards(match.moveHistory) : []),
    [match]
  );

  // Drop any replay state that no longer exists (e.g. after a reset).
  useEffect(() => {
    if (hoverPly !== null && hoverPly >= historyBoards.length) {
      setHoverPly(null);
    }
  }, [historyBoards.length, hoverPly]);

  const shownPly = hoverPly;
  const isReplaying =
    shownPly !== null && shownPly < historyBoards.length - 1 && historyBoards.length > 0;
  const displayedBoard = isReplaying && match ? historyBoards[shownPly] : match?.board ?? [];

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
    if (previous === null || count !== previous + 1 || isReplaying) {
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
    if (!window.confirm("Reset the match and start over?")) {
      return;
    }
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
    if (isReplaying) {
      setHoverPly(null);
      return;
    }
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
    {historyBoards.length > 1 && (
      <nav
        className="timeline"
        aria-label="Game replay timeline"
        onMouseLeave={() => setHoverPly(null)}
      >
        {historyBoards.map((_, ply) => {
          const isLast = ply === historyBoards.length - 1;
          const record = ply > 0 ? match.moveHistory[ply - 1] : null;
          const label = isLast
            ? "Live"
            : record
              ? `${Math.ceil(ply / 2)}. ${record.color === "black" ? "… " : ""}${record.san}`
              : "Start";
          return (
            <span
              key={ply}
              title={label}
              className={`tick${shownPly === ply ? " active" : ""}${
                isLast ? " live" : ""
              }${record ? ` ${record.color}` : ""}`}
              onMouseEnter={() => setHoverPly(ply)}
            />
          );
        })}
      </nav>
    )}
    <main className="app">
      <header className="topbar">
        <span className="eyebrow">ChessForNerds</span>
        <div className="hero-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === "space" ? "classic" : "space"))}
            aria-pressed={theme === "space"}
          >
            {theme === "space" ? "😴 Boring mode" : "🚀 Space mode"}
          </button>
          <button onClick={reset}>Reset match</button>
        </div>
      </header>

      <section className="layout">
        <div className={`board${isReplaying ? " replaying" : ""}`} aria-label="Chess board">
          {isReplaying && shownPly !== null && (
            <div className="replay-chip" aria-live="polite">
              {shownPly === 0
                ? "Replay · start position"
                : `Replay · ${match.moveHistory[shownPly - 1].color} ${
                    match.moveHistory[shownPly - 1].san
                  } (${shownPly}/${historyBoards.length - 1})`}
            </div>
          )}
          {ranks.map((rank) =>
            files.map((file) => {
              const square = `${file}${rank}`;
              const piece = pieceAt(displayedBoard, square);
              const legalTarget =
                !isReplaying && legalFromSelected.some((move) => move.to === square);
              const isSelected = !isReplaying && selected === square;
              const inCheck = !isReplaying && checkedKingSquare === square;
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

        <aside className="panel status-panel" aria-label="Game status and table talk">
          <h2>{statusText(match)}</h2>
          {match.aiThinking && <p className="thinking">Pi is thinking...</p>}
          {error && <p className="error">{error}</p>}

          <ul className="feed" ref={chatLogRef}>
            {feed.map((item) =>
              item.kind === "chat" ? (
                <li key={item.id} className={`feed-chat ${item.from}`}>
                  <strong>{item.from === "pi" ? "Pi" : "You"}</strong> {item.text}
                </li>
              ) : (
                <li key={item.id} className="feed-event">
                  <span>{item.type}</span> {item.text}
                </li>
              )
            )}
            {feed.length === 0 && (
              <li className="chat-empty">No activity yet. Try to bait the Gambiteer.</li>
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
        </aside>
      </section>
    </main>
    </>
  );
}
