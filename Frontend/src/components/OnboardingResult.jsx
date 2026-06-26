import { useReveal } from "../useReveal.js";
import EmailPreview from "./EmailPreview.jsx";
import TypeBadge from "./TypeBadge.jsx";

// Friendly, HR-facing labels for the agent's underlying tool calls.
const TOOL_META = {
  hr_lookup: { title: "Profile loaded", icon: "👤" },
  policy_rag: { title: "Policies retrieved", icon: "📄" },
  email_service: { title: "Welcome email drafted", icon: "✉️" },
  slack_api: { title: "Slack workspace invite", icon: "💬" },
  hris: { title: "HR system updated", icon: "🗂️" },
  itsm: { title: "IT provisioning", icon: "💻" },
  workday: { title: "Payroll & benefits", icon: "💳" },
  calendar: { title: "Orientation scheduled", icon: "📅" },
};

const STATUS_ICON = { done: "✓", retry: "↻", error: "✗" };

export default function OnboardingResult({ result, embedded = false }) {
  const steps = result.toolCalls || [];
  const flags = result.complianceFlags || [];
  const skipped = result.skipped || [];
  const citations = result.citations || [];
  const key = result.persona.id;

  const shown = useReveal(steps.length, { delay: 360, key });
  const done = shown >= steps.length;
  const completed = steps.filter((s) => s.status !== "retry").length;

  return (
    <div className={`panel result-panel ${embedded ? "embedded" : ""}`}>
      {embedded ? (
        <div className="embedded-summary">{result.summary}</div>
      ) : (
        <ResultHeader
          hire={result.persona}
          summary={result.summary}
          stats={{ completed, flags: flags.length, skipped: skipped.length }}
        />
      )}

      <div className="result-grid">
        <section className="result-main">
          <div className="section-label">Onboarding plan</div>
          <ol className="plan">
            {steps.map((s, i) => {
              const meta = TOOL_META[s.tool] || { title: s.tool, icon: "•" };
              return (
                <li
                  key={i}
                  className={`plan-step status-${s.status} ${i < shown ? "in" : "pending"}`}
                >
                  <span className={`plan-icon icon-${s.status}`}>
                    {STATUS_ICON[s.status] || "•"}
                  </span>
                  <div className="plan-body">
                    <div className="plan-title">
                      <span className="plan-emoji">{meta.icon}</span>
                      {meta.title}
                      <span className="plan-tool">{s.tool}</span>
                    </div>
                    <div className="plan-detail">{s.result}</div>
                    {s.reflection && (
                      <div className="plan-reflection">↳ {s.reflection}</div>
                    )}
                    {s.docs && (
                      <div className="plan-docs">
                        {s.docs.map((d, j) => (
                          <div key={j} className="doc">
                            <span className="doc-src">{d.source}</span>
                            <span className="doc-sec">{d.section}</span>
                            <span className="doc-snip">“{d.snippet}”</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {done && result.reasoning?.length > 0 && (
            <details className="reasoning">
              <summary>How the agent planned this onboarding</summary>
              <ol className="reasoning-list">
                {result.reasoning.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>
            </details>
          )}
        </section>

        <aside className="result-side">
          {done && flags.length > 0 && (
            <div className="card flags-card">
              <div className="section-label">Compliance &amp; approvals</div>
              {flags.map((f, i) => (
                <div key={i} className={`flag flag-${f.level}`}>
                  <span className="flag-level">{f.level}</span>
                  <span className="flag-text">{f.text}</span>
                  {f.source && <span className="flag-src">{f.source}</span>}
                </div>
              ))}
            </div>
          )}

          {done && skipped.length > 0 && (
            <div className="card">
              <div className="section-label">Not applicable for this hire</div>
              <ul className="skip-list">
                {skipped.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {done && citations.length > 0 && (
            <div className="card">
              <div className="section-label">Policies applied</div>
              <ul className="cite-list">
                {citations.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {done && (
        <EmailPreview email={result.email} />
      )}
    </div>
  );
}

function ResultHeader({ hire, summary, stats }) {
  return (
    <div className="result-head">
      <div className="result-hire">
        <div className="result-avatar">{initials(hire.name)}</div>
        <div>
          <h2>{hire.name}</h2>
          <div className="result-meta">
            {hire.title} · {hire.department} · {hire.city}, {hire.country}
          </div>
          <TypeBadge type={hire.employmentType} />
        </div>
      </div>
      <div className="result-stats">
        <Stat n={stats.completed} label="actions" />
        <Stat n={stats.flags} label="compliance" tone={stats.flags ? "warn" : "ok"} />
        <Stat n={stats.skipped} label="skipped" />
      </div>
      <p className="result-summary">{summary}</p>
    </div>
  );
}

function Stat({ n, label, tone }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ""}`}>
      <span className="stat-n">{n}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function initials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}
