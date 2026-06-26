import { useState } from "react";
import OnboardingResult from "./OnboardingResult.jsx";
import TypeBadge from "./TypeBadge.jsx";

// Renders a batch of onboarding plans (one per selected candidate) as a
// summary bar plus a collapsible accordion — keeps many results scannable.
export default function OnboardingResultsList({ results }) {
  const total = results.length;
  const actions = results.reduce(
    (n, r) => n + (r.toolCalls || []).filter((s) => s.status !== "retry").length,
    0
  );
  const flags = results.reduce((n, r) => n + (r.complianceFlags || []).length, 0);

  return (
    <div className="batch">
      <div className="batch-summary">
        <span className="batch-check">✓</span>
        Onboarded <strong>{total}</strong> candidate{total === 1 ? "" : "s"} · {actions}{" "}
        actions · {flags} compliance flag{flags === 1 ? "" : "s"} raised
      </div>

      {results.map((r, i) => (
        <BatchItem key={`${r.persona.id}#${i}`} result={r} defaultOpen={i === 0} />
      ))}
    </div>
  );
}

function BatchItem({ result, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const hire = result.persona;
  const actions = (result.toolCalls || []).filter((s) => s.status !== "retry").length;
  const flags = (result.complianceFlags || []).length;

  return (
    <div className={`batch-item ${open ? "open" : ""}`}>
      <button className="batch-head" onClick={() => setOpen((o) => !o)}>
        <span className="batch-avatar">{initials(hire.name)}</span>
        <span className="batch-id">
          <span className="batch-name">{hire.name}</span>
          <span className="batch-meta">
            {hire.title} · {hire.city}, {hire.country}
          </span>
        </span>
        <TypeBadge type={hire.employmentType} />
        <span className="batch-counts">
          {actions} actions{flags ? ` · ${flags} flags` : ""}
        </span>
        <span className="batch-chev">{open ? "▾" : "▸"}</span>
      </button>
      {open && <OnboardingResult result={result} embedded />}
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
