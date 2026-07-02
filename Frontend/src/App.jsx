import { useEffect, useRef, useState } from "react";
import {
  checkHealth,
  onboard,
  recordRemoved,
  recordOnboarded,
  saveCandidates,
  fetchSampleCsv,
  API_BASE,
} from "./api.js";
import { emailMode, sendWelcomeEmail } from "./email.js";
import { getSession, clearSession } from "./auth.js";
import { parseHiresFile, parseHiresText, normalizeHire, hiresToCsv } from "./parseHires.js";
import { setThemePref } from "./theme.js";
import { matchHire, tally } from "./assistant.js";
import HireForm from "./components/HireForm.jsx";
import ImportPanel from "./components/ImportPanel.jsx";
import AssistantPanel from "./components/AssistantPanel.jsx";
import Login from "./components/Login.jsx";
import SideMenu from "./components/SideMenu.jsx";
import BrandLogo from "./components/BrandLogo.jsx";
import OnboardingResult from "./components/OnboardingResult.jsx";
import OnboardingResultsList from "./components/OnboardingResultsList.jsx";
import Dashboard from "./components/Dashboard.jsx";
// The bundled sample roster, inlined at build time — the assistant can load it
// without a file picker. Repo-root file, two levels up from src/.
import sampleCsv from "../../sample-new-hires.csv?raw";

const EMPTY_HIRE = {
  name: "",
  email: "",
  title: "",
  department: "",
  employmentType: "FTE",
  country: "",
  city: "",
  region: "NA",
  startTiming: "quarter-start",
  greeting: "Dear",
};

const TABS = [
  { id: "import", label: "Import file" },
  { id: "form", label: "Add a new hire" },
];

// Auth gate: show the login page until a session exists, then the portal.
export default function App() {
  const [user, setUser] = useState(getSession);
  if (!user) return <Login onAuthed={setUser} />;
  return (
    <Portal
      user={user}
      onSignOut={() => {
        clearSession();
        setUser(null);
      }}
    />
  );
}

function Portal({ user, onSignOut }) {
  const [view, setView] = useState("onboard"); // onboard | dashboard
  const [tab, setTab] = useState("import"); // import | form
  const [menuOpen, setMenuOpen] = useState(false); // left side menu drawer
  const [form, setForm] = useState(EMPTY_HIRE);

  // imported-from-file state
  const [importedHires, setImportedHires] = useState([]);
  const [importTotal, setImportTotal] = useState(0);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [importFileName, setImportFileName] = useState("");
  const [importParsing, setImportParsing] = useState(false);
  const [importError, setImportError] = useState(null);

  // monotonic counter for unique keys on manually-added hires
  const addedCount = useRef(0);
  // Last roster CSV we persisted — so we save only real changes and never POST
  // the initial empty roster on mount.
  const lastSaved = useRef(null);

  // run state
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total } | null
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null); // transient success note (e.g. "Added …")
  const [backendUp, setBackendUp] = useState(null);
  // Once a run completes the button locks until new data arrives (import/add),
  // so the same batch can't be onboarded twice by accident.
  const [onboardingLocked, setOnboardingLocked] = useState(false);
  // Keys of candidates whose onboarding invitation has been sent — marked in
  // the table and no longer selectable.
  const [onboardedKeys, setOnboardedKeys] = useState(() => new Set());

  // Live mirror of the candidate state for the AI assistant's tools. They run
  // outside React's render cycle (inside an async command), so they read/write
  // this ref to see the latest values synchronously between steps.
  const live = useRef({ hires: [], selectedKeys: new Set(), onboardedKeys: new Set() });
  useEffect(() => { live.current.hires = importedHires; }, [importedHires]);
  useEffect(() => { live.current.selectedKeys = selectedKeys; }, [selectedKeys]);
  useEffect(() => { live.current.onboardedKeys = onboardedKeys; }, [onboardedKeys]);

  // bulk welcome-email state (sent automatically once plans are generated)
  const [emailProgress, setEmailProgress] = useState(null); // { done, total } | null
  const [emailSummary, setEmailSummary] = useState(null); // { sent, failed:[{name,error}] } | null

  // Probe the backend on mount.
  useEffect(() => {
    checkHealth()
      .then(() => setBackendUp(true))
      .catch((e) => {
        setBackendUp(false);
        setError(e.message);
      });
  }, []);

  // The roster is intentionally NOT auto-loaded on page refresh — the table
  // starts empty so the assistant's prompts (and manual import/add) drive it from
  // a clean slate. Use "import the sample" or the Import tab to load the saved
  // sample-new-hires.csv (with your edits).

  // Persist roster changes (import, add, edit, remove) so edits flow to
  // sample-new-hires.csv. Debounced; skips the initial empty mount and no-op
  // changes so it never needlessly clears the file.
  useEffect(() => {
    const csv = hiresToCsv(importedHires);
    if (lastSaved.current === null) {
      lastSaved.current = csv; // remember the initial (empty) state; don't POST it
      return;
    }
    if (csv === lastSaved.current) return;
    lastSaved.current = csv;
    const t = setTimeout(() => {
      saveCandidates(csv).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [importedHires]);

  // Clear a stale plan when the chosen source changes.
  useEffect(() => {
    setResults([]);
    setError(null);
    setEmailSummary(null);
  }, [tab]);

  // Notices (added / removed) are brief — auto-dismiss after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  // ---- import handlers --------------------------------------------------
  async function handleFile(file) {
    setImportParsing(true);
    setImportError(null);
    setResults([]);
    setEmailSummary(null);
    setNotice(null);
    setOnboardingLocked(false);
    setOnboardedKeys(new Set());
    try {
      const { hires, total } = await parseHiresFile(file);
      setImportFileName(file.name);
      setImportTotal(total);
      if (hires.length === 0) {
        setImportedHires([]);
        setSelectedKeys(new Set());
        setImportError("No usable rows found — each candidate needs at least a name and email.");
      } else {
        setImportedHires(hires);
        setSelectedKeys(new Set(hires.map((h) => h._key))); // select all by default
      }
    } catch (e) {
      setImportError(`Couldn't read that file — use a .csv or .xlsx export. (${e.message})`);
    } finally {
      setImportParsing(false);
    }
  }

  function toggleKey(key) {
    setOnboardingLocked(false); // a changed selection is a new batch to run
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  // Toggle the given keys (the rows currently visible after filtering). If every
  // one is already selected, clear them; otherwise add them — selections of
  // rows hidden by a filter are left untouched.
  function toggleAll(keys) {
    setOnboardingLocked(false); // a changed selection is a new batch to run
    const target = keys && keys.length ? keys : importedHires.map((h) => h._key);
    setSelectedKeys((prev) => {
      const allSel = target.every((k) => prev.has(k));
      const next = new Set(prev);
      target.forEach((k) => (allSel ? next.delete(k) : next.add(k)));
      return next;
    });
  }
  // Edit a candidate's full details (from the row edit modal). Re-normalises the
  // edited fields and keeps the same _key so selection/identity is preserved.
  // Returns false when the edit is invalid so the modal can stay open.
  function updateHire(key, data) {
    const norm = normalizeHire(data, 0);
    if (!norm) {
      setError("A candidate needs at least a name and a work email.");
      return false;
    }
    setImportedHires((prev) =>
      prev.map((h) => (h._key === key ? { ...norm, _key: key } : h))
    );
    setError(null);
    setNotice(`Updated ${norm.name}'s details.`);
    return true;
  }

  // Drop a candidate from the list (e.g. they didn't join). Cleans up its
  // selection / invitation-sent state and the row total so counts stay honest.
  function removeHire(key) {
    const removed = importedHires.find((h) => h._key === key);
    setImportedHires((prev) => prev.filter((h) => h._key !== key));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setOnboardedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setImportTotal((t) => Math.max(0, t - 1));
    setError(null);
    if (!removed) return;
    setNotice(`Removed ${removed.name} from the candidate list.`);
    // Persist to the backend's removed-candidates.csv (best-effort).
    const { _key, ...hire } = removed;
    recordRemoved(hire)
      .then(() => setNotice(`Removed ${removed.name} — saved to removed-candidates.csv.`))
      .catch(() =>
        setNotice(`Removed ${removed.name} (couldn't save to file — is the backend running?).`)
      );
  }
  function clearImport() {
    setImportedHires([]);
    setImportTotal(0);
    setSelectedKeys(new Set());
    setImportFileName("");
    setImportError(null);
    setResults([]);
    setEmailSummary(null);
    setNotice(null);
    setOnboardingLocked(false);
    setOnboardedKeys(new Set());
  }

  // Normalise + append a hire to the shared candidate list (selected, unlocked).
  // Shared by the form and the AI assistant. Returns the created hire or null.
  function addHireCore(data) {
    const hire = normalizeHire(data, 0);
    if (!hire) return null;
    hire._key = `manual-${addedCount.current++}-${(hire.email || "").toLowerCase()}`;
    setImportedHires((prev) => [...prev, hire]);
    setSelectedKeys((prev) => new Set(prev).add(hire._key));
    setImportTotal((t) => t + 1);
    setImportFileName((prev) => prev || "Manually added candidates");
    setOnboardingLocked(false);
    return hire;
  }

  // Add a hand-entered hire to the shared candidate list instead of onboarding
  // it directly, then take the user to the candidate table to onboard it.
  function handleAddHire() {
    if (!form.name.trim() || !form.email.trim()) {
      setError("Please enter at least the new hire's name and work email.");
      return;
    }
    const hire = addHireCore(form);
    if (!hire) {
      setError("Please enter at least the new hire's name and work email.");
      return;
    }
    setForm(EMPTY_HIRE);
    setError(null);
    setNotice(`Added ${hire.name} to the candidate list — select and onboard below.`);
    setTab("import");
  }

  // ---- run --------------------------------------------------------------
  // Onboard an explicit list of hires: generate each plan, then bulk-send the
  // invitations. Shared by the Onboard button and the AI assistant. Returns a
  // summary { total, sent, failed } for the caller (e.g. the agent) to report.
  async function runOnboarding(hires) {
    if (!hires.length) return { total: 0, sent: 0, failed: 0 };
    const payloads = hires.map(({ _key, ...rest }) => rest);

    setRunning(true);
    setError(null);
    setNotice(null);
    setResults([]);
    setEmailSummary(null);
    setProgress({ done: 0, total: payloads.length });

    const out = [];
    let summary = { total: hires.length, sent: 0, failed: payloads.length };
    try {
      for (let i = 0; i < payloads.length; i++) {
        out.push(await onboard(payloads[i]));
        setProgress({ done: i + 1, total: payloads.length });
      }
      setResults(out);
      setProgress(null);
      // Pass aligned keys so we can mark the ones whose invitation actually sent.
      const r = await sendEmails(out, hires.map((h) => h._key));
      summary = { total: hires.length, sent: r.sent, failed: r.failed };
    } catch (e) {
      setError(e.message);
      setResults(out); // keep whatever succeeded
      summary = { total: hires.length, sent: 0, failed: hires.length, error: e.message };
    } finally {
      setRunning(false);
      setProgress(null);
      setOnboardingLocked(true); // require fresh data before another run
    }
    return summary;
  }

  async function handleRun() {
    const chosen = importedHires.filter((h) => selectedKeys.has(h._key));
    if (chosen.length === 0) {
      setError("Select at least one candidate to onboard.");
      return;
    }
    await runOnboarding(chosen);
  }

  // Bulk-send the generated welcome email to each onboarded candidate. Per-email
  // failures are collected (not thrown) so one bad address can't abort the rest.
  async function sendEmails(plans, keys = []) {
    if (plans.length === 0) return { sent: 0, failed: 0 };
    setEmailProgress({ done: 0, total: plans.length });
    let sent = 0;
    const failed = [];
    const sentKeys = [];
    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      try {
        await sendWelcomeEmail(plan.email, plan.persona.name, "ADLC");
        sent++;
        if (keys[i]) sentKeys.push(keys[i]);
        // Log to the persistent onboarding history for the dashboard (best-effort).
        recordOnboarded(plan.persona).catch(() => {});
      } catch (e) {
        failed.push({ name: plan.persona.name, error: e.message });
      }
      setEmailProgress({ done: i + 1, total: plans.length });
    }
    setEmailProgress(null);
    setEmailSummary({ sent, failed });
    // Mark the invitation-sent candidates and drop them from the selection so
    // they can't be picked again. (Failed sends stay selectable to retry.)
    if (sentKeys.length) {
      setOnboardedKeys((prev) => new Set([...prev, ...sentKeys]));
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        sentKeys.forEach((k) => next.delete(k));
        return next;
      });
    }
    return { sent, failed: failed.length };
  }

  // ---- AI assistant tool layer -----------------------------------------
  // The functions the offline assistant can call. Each reads/writes the `live`
  // mirror so a multi-step command (e.g. "import then onboard interns") sees
  // the latest data between steps, and mirrors the change into React state.
  const slim = (h) => ({ name: h.name, title: h.title, type: h.employmentType, region: h.region, email: h.email });
  const assistantTools = {
    importSample: async () => {
      // Prefer the live sample-new-hires.csv from the backend (it carries any
      // saved edits); fall back to the build-time bundle when offline.
      let csv = sampleCsv;
      try {
        const fetched = await fetchSampleCsv();
        if (fetched && fetched.trim()) csv = fetched;
      } catch {
        /* backend offline — use the bundled sample */
      }
      const { hires } = parseHiresText(csv);
      const keys = new Set(hires.map((h) => h._key));
      setImportedHires(hires);
      setSelectedKeys(keys);
      setImportTotal(hires.length);
      setImportFileName("sample-new-hires.csv (via assistant)");
      setOnboardedKeys(new Set());
      setOnboardingLocked(false);
      setResults([]);
      setEmailSummary(null);
      setError(null);
      live.current = { hires, selectedKeys: keys, onboardedKeys: new Set() };
      return { count: hires.length };
    },
    addHire: (data) => {
      const hire = addHireCore(data);
      if (!hire) return { error: "I need at least a name and a work email to add someone." };
      live.current.hires = [...live.current.hires, hire];
      live.current.selectedKeys = new Set(live.current.selectedKeys).add(hire._key);
      return { hire };
    },
    selectAll: () => {
      const sel = live.current.hires.filter((h) => !live.current.onboardedKeys.has(h._key));
      const keys = new Set(sel.map((h) => h._key));
      setSelectedKeys(keys);
      setOnboardingLocked(false);
      live.current.selectedKeys = keys;
      return { matched: sel.length, names: sel.map((h) => h.name) };
    },
    select: (criteria) => {
      const m = live.current.hires.filter((h) => !live.current.onboardedKeys.has(h._key) && matchHire(h, criteria));
      const keys = new Set(m.map((h) => h._key));
      setSelectedKeys(keys);
      setOnboardingLocked(false);
      live.current.selectedKeys = keys;
      return { matched: m.length, names: m.map((h) => h.name) };
    },
    deselect: (criteria) => {
      const drop = new Set(live.current.hires.filter((h) => matchHire(h, criteria)).map((h) => h._key));
      const keys = new Set([...live.current.selectedKeys].filter((k) => !drop.has(k)));
      setSelectedKeys(keys);
      live.current.selectedKeys = keys;
      return { matched: drop.size };
    },
    clearSelection: () => {
      setSelectedKeys(new Set());
      live.current.selectedKeys = new Set();
      return {};
    },
    onboardCriteria: async (criteria) => {
      const m = live.current.hires.filter((h) => !live.current.onboardedKeys.has(h._key) && matchHire(h, criteria));
      if (!m.length) return { matched: 0, total: 0, sent: 0, failed: 0, names: [] };
      setSelectedKeys(new Set(m.map((h) => h._key)));
      const sum = await runOnboarding(m);
      return { ...sum, matched: m.length, names: m.map((h) => h.name) };
    },
    onboardSelected: async () => {
      const chosen = live.current.hires.filter(
        (h) => live.current.selectedKeys.has(h._key) && !live.current.onboardedKeys.has(h._key)
      );
      if (!chosen.length) return { matched: 0, total: 0, sent: 0, failed: 0, names: [] };
      const sum = await runOnboarding(chosen);
      return { ...sum, matched: chosen.length, names: chosen.map((h) => h.name) };
    },
    remove: (name) => {
      const h = live.current.hires.find((x) => `${x.name} ${x.email}`.toLowerCase().includes(String(name).toLowerCase()));
      if (!h) return { error: `I couldn't find a candidate matching "${name}".` };
      removeHire(h._key);
      live.current.hires = live.current.hires.filter((x) => x._key !== h._key);
      return { removed: h.name };
    },
    removeMatching: (criteria) => {
      const matches = live.current.hires.filter((h) => matchHire(h, criteria));
      matches.forEach((h) => removeHire(h._key));
      const gone = new Set(matches.map((h) => h._key));
      live.current.hires = live.current.hires.filter((h) => !gone.has(h._key));
      return { removed: matches.map((h) => h.name) };
    },
    list: (criteria) => ({
      candidates: live.current.hires.filter((h) => matchHire(h, criteria)).map(slim),
      total: live.current.hires.length,
    }),
    count: (criteria) => ({
      count: live.current.hires.filter((h) => matchHire(h, criteria)).length,
      total: live.current.hires.length,
    }),
    stats: () => {
      const hires = live.current.hires;
      return {
        total: hires.length,
        selected: live.current.selectedKeys.size,
        sent: live.current.onboardedKeys.size,
        byType: tally(hires.map((h) => h.employmentType)),
        byRegion: tally(hires.map((h) => h.region)),
      };
    },
    setView: ({ view }) => { setView(view); return { view }; },
    setTheme: ({ pref }) => { setThemePref(pref); return { pref }; },
  };

  const selectedCount = selectedKeys.size;
  const runDisabled =
    running || backendUp === false || selectedCount === 0 || onboardingLocked;

  const runLabel = (() => {
    if (running) {
      if (emailProgress) {
        return `Sending emails ${emailProgress.done}/${emailProgress.total}…`;
      }
      return progress && progress.total > 1
        ? `Onboarding ${progress.done}/${progress.total}…`
        : "Onboarding…";
    }
    if (onboardingLocked) {
      return "✓ Onboarded — import or add a hire to run again";
    }
    if (selectedCount > 0) {
      return `▶ Onboard ${selectedCount} candidate${selectedCount === 1 ? "" : "s"}`;
    }
    return "▶ Start onboarding";
  })();

  return (
    <div className={`layout ${menuOpen ? "menu-open" : ""}`}>
      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={user}
        onSignOut={onSignOut}
        backendUp={backendUp}
      />
      <div className="app">
      <header className="app-header">
        <div className="brand">
          <BrandLogo />
          <span className="brand-divider" />
          <div className="brand-text">
            <h1>Employee Onboarding</h1>
            <p>Personalised, policy-aware onboarding for every new hire</p>
          </div>
        </div>
      </header>

      <nav className="main-nav">
        <button
          className="menu-btn nav-menu-btn"
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          title="Menu"
        >
          <svg width="34" height="34" viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="18" fill="#1d9bf0" />
            <rect x="10" y="12" width="16" height="2.8" rx="1.4" fill="#fff" />
            <rect x="10" y="16.6" width="16" height="2.8" rx="1.4" fill="#fff" />
            <rect x="10" y="21.2" width="16" height="2.8" rx="1.4" fill="#fff" />
          </svg>
        </button>
        <button
          className={`nav-tab ${view === "onboard" ? "active" : ""}`}
          onClick={() => setView("onboard")}
        >
          Onboarding
        </button>
        <button
          className={`nav-tab ${view === "dashboard" ? "active" : ""}`}
          onClick={() => setView("dashboard")}
        >
          Dashboard
        </button>
      </nav>

      {view === "dashboard" ? (
        <Dashboard />
      ) : (
        <>
      {backendUp === false && (
        <div className="banner banner-error">
          Can't reach the onboarding service at <code>{API_BASE}</code>. Start it
          with <code>backend/run.ps1</code>, then reload.
        </div>
      )}

      <section className="setup card">
        <div className="step-label">Step 1 · Who are you onboarding?</div>

        <div className="source-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`source-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
              disabled={running}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "import" && (
          <ImportPanel
            hires={importedHires}
            total={importTotal}
            selectedKeys={selectedKeys}
            onboardedKeys={onboardedKeys}
            fileName={importFileName}
            parsing={importParsing}
            error={importError}
            disabled={running}
            onFile={handleFile}
            onToggle={toggleKey}
            onToggleAll={toggleAll}
            onEditHire={updateHire}
            onRemove={removeHire}
            onClear={clearImport}
          />
        )}
        {tab === "form" && (
          <HireForm value={form} onChange={setForm} disabled={running} />
        )}

        <div className="setup-foot">
          {tab === "form" ? (
            <>
              <div className="step-label">
                Step 2 · Add to the candidate list
                {importedHires.length > 0 && (
                  <span className="foot-note"> · {importedHires.length} candidate{importedHires.length === 1 ? "" : "s"} ready</span>
                )}
              </div>
              <button
                className="btn btn-primary run-btn"
                onClick={handleAddHire}
                disabled={running}
              >
                ➕ Add candidate
              </button>
            </>
          ) : (
            <>
              <div className="step-label">Step 2 · Run it</div>
              <button
                className="btn btn-primary run-btn"
                onClick={handleRun}
                disabled={runDisabled}
              >
                {runLabel}
              </button>
            </>
          )}
        </div>
      </section>

      {error && <div className="banner banner-error">{error}</div>}

      {notice && !error && <div className="banner banner-ok">{notice}</div>}

      {emailSummary && (
        <div className={`banner ${emailSummary.failed.length ? "banner-warn" : "banner-ok"}`}>
          {emailMode === "live" ? "✓ Sent" : "✓ Mock-sent"} {emailSummary.sent} welcome
          email{emailSummary.sent === 1 ? "" : "s"}
          {emailMode !== "live" && " (set EmailJS keys in .env to send for real)"}
          {emailSummary.failed.length > 0 && (
            <>
              {" "}· {emailSummary.failed.length} failed:
              <ul className="email-fail-list">
                {emailSummary.failed.map((f, i) => (
                  <li key={i}>
                    <strong>{f.name}</strong> — {f.error}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <section className="output">
        {results.length > 1 ? (
          <OnboardingResultsList results={results} />
        ) : results.length === 1 ? (
          <OnboardingResult result={results[0]} />
        ) : (
          <Placeholder running={running} progress={progress} />
        )}
      </section>
        </>
      )}

      <footer className="app-footer">
        Cognisoft Employee Onboarding · React + Vite frontend · zero-dependency
        Java onboarding agent
      </footer>

      {/* Floating chatbot launcher (bottom-right) — opens the AI assistant. */}
      <AssistantPanel tools={assistantTools} />
      </div>
    </div>
  );
}

function Placeholder({ running, progress }) {
  const text = running
    ? progress && progress.total > 1
      ? `Onboarding ${progress.done} of ${progress.total} candidates…`
      : "Building a personalised onboarding plan…"
    : `Choose or import a hire and press "Start onboarding" to generate their plan.`;
  return (
    <div className="panel panel-empty">
      <div className="empty-inner">
        <span className="empty-mark">⌁</span>
        <span className="empty-text">{text}</span>
      </div>
    </div>
  );
}
