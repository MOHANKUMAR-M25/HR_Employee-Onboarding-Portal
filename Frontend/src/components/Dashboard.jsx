import { useEffect, useMemo, useState } from "react";
import { fetchOnboarded, fetchRemoved } from "../api.js";
import TypeBadge from "./TypeBadge.jsx";

// HR analytics: pulls the persisted onboarding history + removed list from the
// backend and shows counts, breakdowns, and searchable tables.
export default function Dashboard() {
  const [onboarded, setOnboarded] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [on, rm] = await Promise.all([fetchOnboarded(), fetchRemoved()]);
      setOnboarded(on);
      setRemoved(rm);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const byRegion = useMemo(() => countBy(onboarded, "region"), [onboarded]);
  const byType = useMemo(() => countBy(onboarded, "type"), [onboarded]);
  const byDept = useMemo(() => countBy(onboarded, "department"), [onboarded]);

  return (
    <section className="dashboard">
      <div className="dash-head">
        <div>
          <div className="step-label">HR Dashboard</div>
          <p className="dash-sub">Onboarding analytics across all sessions (persisted on the backend).</p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <div className="banner banner-error">
          Couldn't load dashboard data ({error}). Is the backend running?
        </div>
      )}

      <div className="stat-cards">
        <StatCard n={onboarded.length} label="Invitations sent" tone="ok" />
        <StatCard n={removed.length} label="Removed candidates" tone="warn" />
        <StatCard n={Object.keys(byRegion).length} label="Regions covered" />
        <StatCard
          n={onboarded.filter((r) => r.type === "INTERN").length}
          label="Interns onboarded"
        />
      </div>

      <div className="dash-grid">
        <Breakdown title="By region" data={byRegion} total={onboarded.length} />
        <Breakdown title="By employment type" data={byType} total={onboarded.length} labeller={typeLabel} />
        <Breakdown title="By department" data={byDept} total={onboarded.length} />
      </div>

      <HistoryTable
        title="Onboarding history"
        rows={onboarded}
        atLabel="Sent"
        empty="No invitations sent yet."
      />
      <HistoryTable
        title="Removed candidates"
        rows={removed}
        atLabel="Removed"
        empty="No candidates have been removed."
      />
    </section>
  );
}

function StatCard({ n, label, tone }) {
  return (
    <div className={`stat-card ${tone ? `tone-${tone}` : ""}`}>
      <span className="stat-card-n">{n}</span>
      <span className="stat-card-label">{label}</span>
    </div>
  );
}

function Breakdown({ title, data, total, labeller }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div className="card breakdown">
      <div className="section-label">{title}</div>
      {entries.length === 0 ? (
        <div className="dash-empty">No data yet.</div>
      ) : (
        entries.map(([key, count]) => (
          <div key={key} className="bar-row">
            <span className="bar-label">{labeller ? labeller(key) : key || "—"}</span>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${total ? Math.round((count / total) * 100) : 0}%` }}
              />
            </div>
            <span className="bar-count">{count}</span>
          </div>
        ))
      )}
    </div>
  );
}

function HistoryTable({ title, rows, atLabel, empty }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? rows.filter((r) =>
          `${r.name} ${r.email} ${r.title} ${r.department} ${r.region} ${r.type}`
            .toLowerCase()
            .includes(needle)
        )
      : rows;
    // newest first
    return [...list].reverse();
  }, [rows, q]);

  return (
    <div className="card dash-history">
      <div className="dash-history-head">
        <div className="section-label">
          {title} <span className="dash-count">{rows.length}</span>
        </div>
        <input
          className="filter-input dash-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, dept…"
          aria-label={`Search ${title}`}
        />
      </div>
      <div className="table-scroll">
        <table className="cand-table">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Title</th>
              <th>Department</th>
              <th>Type</th>
              <th>Region</th>
              <th>{atLabel}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr className="no-match">
                <td colSpan={6}>{q ? "No matches." : empty}</td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr key={`${r.email}#${i}`}>
                  <td>
                    <div className="cand-name">{r.name}</div>
                    <div className="cand-email">{r.email}</div>
                  </td>
                  <td>{r.title}</td>
                  <td>{r.department}</td>
                  <td><TypeBadge type={r.type} /></td>
                  <td>{r.region}</td>
                  <td className="dash-at">{formatAt(r.at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function countBy(rows, key) {
  return rows.reduce((acc, r) => {
    const k = r[key] || "—";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

function typeLabel(t) {
  return t === "CONTRACTOR" ? "Contractor" : t === "INTERN" ? "Intern" : "Full-time";
}

function formatAt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString();
}
