import { useEffect, useRef, useState } from "react";
import { runAssistant } from "../assistant.js";

// A few one-click prompts to make the demo discoverable.
const SUGGESTIONS = [
  "Import the sample candidates",
  "Select all interns in Asia",
  "Onboard everyone in APAC",
  "How many contractors?",
  "Pipeline summary",
  "Open the dashboard",
];

/**
 * The in-portal AI Assistant, as a floating chatbot. A launcher button sits in
 * the bottom-right corner; clicking it opens a chat window. The user types a
 * plain-English instruction; the (offline) engine turns it into a plan of
 * portal actions, runs them via the `tools` wired in App, and shows the plan +
 * results like a real agent.
 */
export default function AssistantPanel({ tools }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState([]); // { role: "user" | "agent", ... }
  const log = useRef(null);
  const field = useRef(null);

  // Keep the transcript scrolled to the latest message.
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [turns, busy, open]);

  // Focus the input when the window opens.
  useEffect(() => {
    if (open && field.current) field.current.focus();
  }, [open]);

  async function send(text) {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    setInput("");
    setTurns((t) => [...t, { role: "user", text: msg }]);
    setBusy(true);
    try {
      const res = await runAssistant(msg, tools);
      setTurns((t) => [...t, { role: "agent", ...res }]);
    } catch (e) {
      setTurns((t) => [...t, { role: "agent", reply: `Something went wrong: ${e.message}`, actions: [] }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="asst-dock">
      {open && (
        <div className="asst-window" role="dialog" aria-label="Onboarding agent">
          <header className="asst-head">
            <span className="asst-spark" aria-hidden>✦</span>
            <div className="asst-title">
              <h2>Onboarding Agent</h2>
              <p>Tell me what to do — 100% offline, no API.</p>
            </div>
            <span className="asst-badge">agentic</span>
            <button type="button" className="asst-close" onClick={() => setOpen(false)} aria-label="Close assistant">
              ✕
            </button>
          </header>

          <div className="asst-log" ref={log}>
            {turns.length === 0 && (
              <div className="asst-hello">
                Hi! I can import candidates, add a hire, select &amp; onboard people, remove
                someone, answer questions, and switch views — just describe it. Try one below or
                type <code>help</code>.
              </div>
            )}
            {turns.map((t, i) =>
              t.role === "user" ? (
                <div key={i} className="asst-msg user">
                  <span className="asst-bubble">{t.text}</span>
                </div>
              ) : (
                <AgentTurn key={i} turn={t} />
              )
            )}
            {busy && (
              <div className="asst-msg agent">
                <span className="asst-bubble working">
                  <span className="asst-dots"><i /><i /><i /></span> working…
                </span>
              </div>
            )}
          </div>

          <div className="asst-suggest">
            {SUGGESTIONS.map((sug) => (
              <button key={sug} type="button" className="asst-chip" onClick={() => send(sug)} disabled={busy}>
                {sug}
              </button>
            ))}
          </div>

          <form className="asst-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input
              ref={field}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. onboard all interns in Asia"
              disabled={busy}
              aria-label="Assistant command"
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
              Send
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className={`asst-fab ${open ? "open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close agent" : "Open the onboarding agent"}
        aria-expanded={open}
        title={open ? "Close agent" : "Ask the onboarding agent"}
      >
        {open ? (
          <span className="asst-fab-ico" aria-hidden>✕</span>
        ) : (
          <span className="asst-fab-inner">
            <span className="asst-fab-ico" aria-hidden>✦</span>
            <span className="asst-fab-label">Ask</span>
          </span>
        )}
      </button>
    </div>
  );
}

/** One agent reply: the plan, the executed tool calls, the summary + details. */
function AgentTurn({ turn }) {
  const { understood, actions = [], reply, lines = [] } = turn;
  return (
    <div className="asst-msg agent">
      <div className="asst-bubble">
        {understood && (
          <div className="asst-plan">
            <span className="asst-plan-k">Plan</span> {understood}
          </div>
        )}
        {actions.length > 0 && (
          <ul className="asst-actions">
            {actions.map((a, i) => (
              <li key={i} className={a.ok ? "ok" : "fail"}>
                <span className="asst-act-ico">{a.ok ? "✓" : "✗"}</span>
                <span className="asst-act-label">{a.label}</span>
                {a.note && <span className="asst-act-note">{a.note}</span>}
              </li>
            ))}
          </ul>
        )}
        {reply && <div className="asst-reply">{reply}</div>}
        {lines.length > 0 && (
          <ul className="asst-lines">
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
