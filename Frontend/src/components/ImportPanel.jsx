import { useEffect, useRef, useState } from "react";
import { TEMPLATE_COLUMNS } from "../parseHires.js";
import TypeBadge from "./TypeBadge.jsx";
import EditHireModal from "./EditHireModal.jsx";
// The downloadable template IS the repo-root sample file (single source of
// truth) — Vite inlines its contents at build time via the ?raw suffix.
import sampleCsv from "../../../sample-new-hires.csv?raw";

const EMPTY_FILTERS = {
  candidate: "",
  title: "",
  department: "",
  type: "",
  region: "",
  start: "",
};

const has = (text, q) => String(text).toLowerCase().includes(q.trim().toLowerCase());

const START_LABELS = {
  "mid-quarter": "Mid-quarter",
  "quarter-end": "Quarter end",
  "quarter-start": "Quarter start",
};
const startLabelOf = (t) => START_LABELS[t] || "Quarter start";

/** Does a hire match every active column filter? (case-insensitive substring) */
function matchesFilters(h, f) {
  // Type / Start match the human labels shown in the cells, not the raw enums.
  const typeLabel =
    h.employmentType === "CONTRACTOR"
      ? "contractor"
      : h.employmentType === "INTERN"
      ? "intern"
      : "full-time fte";
  const startLabel = startLabelOf(h.startTiming).toLowerCase();
  return (
    (!f.candidate || has(`${h.name} ${h.email}`, f.candidate)) &&
    (!f.title || has(h.title, f.title)) &&
    (!f.department || has(h.department, f.department)) &&
    (!f.type || has(typeLabel, f.type)) &&
    (!f.region || has(h.region, f.region)) &&
    (!f.start || has(startLabel, f.start))
  );
}

/**
 * Import-from-file panel. Before a file is loaded it shows a drag/drop +
 * browse dropzone; afterwards it shows the parsed candidates in a table with
 * per-row and select-all checkboxes. Selection state lives in App.
 */
export default function ImportPanel({
  hires,
  total,
  selectedKeys,
  onboardedKeys,
  fileName,
  parsing,
  error,
  disabled,
  onFile,
  onToggle,
  onToggleAll,
  onEditHire,
  onRemove,
  onClear,
}) {
  const allRef = useRef(null);
  const isSent = (key) => onboardedKeys?.has(key);
  // _key of the row awaiting remove confirmation (inline, no native dialog).
  const [confirmRemove, setConfirmRemove] = useState(null);
  // The hire currently open in the full-details edit modal (or null).
  const [editing, setEditing] = useState(null);

  // Per-column search. Display-only: filtering never changes which candidates
  // are selected, it just narrows what's shown. All matching is case-insensitive
  // substring against the same text the cell renders.
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const setFilter = (col) => (e) =>
    setFilters((f) => ({ ...f, [col]: e.target.value }));
  const anyFilter = Object.values(filters).some((v) => v.trim() !== "");

  const visible = hires.filter((h) => matchesFilters(h, filters));

  // Select-all reflects/acts on the visible rows that are still selectable
  // (invitation-sent candidates are excluded — they can't be picked again).
  const selectable = visible.filter((h) => !isSent(h._key));
  const visibleKeys = selectable.map((h) => h._key);
  const allSelected = selectable.length > 0 && selectable.every((h) => selectedKeys.has(h._key));
  const someSelected = selectable.some((h) => selectedKeys.has(h._key));

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  function pick(e) {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = ""; // allow re-selecting the same file
  }
  function drop(e) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && !disabled && !parsing) onFile(f);
  }

  // ---- empty state: dropzone -------------------------------------------
  if (!hires.length) {
    return (
      <div className="import">
        <label
          className={`dropzone ${parsing ? "busy" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={drop}
        >
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            hidden
            onChange={pick}
            disabled={disabled || parsing}
          />
          <span className="dz-icon">⬆️</span>
          <span className="dz-title">
            {parsing ? "Reading file…" : "Drop a CSV or XLSX file here, or click to browse"}
          </span>
          <span className="dz-hint">
            Columns: {TEMPLATE_COLUMNS.join(", ")} · only <em>name</em> and{" "}
            <em>email</em> are required
          </span>
        </label>
        <div className="dz-actions">
          <button className="btn-link" type="button" onClick={downloadTemplate}>
            ⬇ Download CSV template
          </button>
        </div>
        {error && <div className="import-error">{error}</div>}
      </div>
    );
  }

  // ---- loaded state: candidate table -----------------------------------
  return (
    <div className="import">
      <div className="import-toolbar">
        <div className="import-file">
          📄 <strong>{fileName}</strong> · {hires.length} of {total} rows imported
          {total > hires.length && (
            <span className="import-skip"> · {total - hires.length} skipped (missing name/email)</span>
          )}
        </div>
        <div className="import-tools">
          {anyFilter && (
            <span className="import-count">
              {visible.length} of {hires.length} shown
            </span>
          )}
          {onboardedKeys?.size > 0 && (
            <span className="import-count count-sent">{onboardedKeys.size} invitation{onboardedKeys.size === 1 ? "" : "s"} sent</span>
          )}
          <span className="import-count">{selectedKeys.size} selected</span>
          <button className="btn-link" type="button" onClick={onClear} disabled={disabled}>
            ↺ Re-upload
          </button>
        </div>
      </div>

      <div className="import-hint">
        ✎ Tip: click the ✎ icon to edit a candidate's details · use the search
        row to filter columns.
      </div>

      <div className="table-scroll">
        <table className="cand-table">
          <thead>
            <tr>
              <th className="c-check">
                <input
                  ref={allRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleAll(visibleKeys)}
                  disabled={disabled || selectable.length === 0}
                  aria-label="Select all visible candidates"
                />
              </th>
              <th>Candidate</th>
              <th>Title</th>
              <th>Department</th>
              <th>Type</th>
              <th>Region</th>
              <th>Start</th>
              <th className="c-actions" aria-label="Actions" />
            </tr>
            <tr className="filter-row">
              <th className="c-check">
                {anyFilter && (
                  <button
                    type="button"
                    className="filter-clear"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    title="Clear all filters"
                    aria-label="Clear all filters"
                  >
                    ✕
                  </button>
                )}
              </th>
              <th><FilterInput value={filters.candidate} onChange={setFilter("candidate")} placeholder="Search name / email" disabled={disabled} /></th>
              <th><FilterInput value={filters.title} onChange={setFilter("title")} placeholder="Title" disabled={disabled} /></th>
              <th><FilterInput value={filters.department} onChange={setFilter("department")} placeholder="Dept." disabled={disabled} /></th>
              <th><FilterInput value={filters.type} onChange={setFilter("type")} placeholder="Type" disabled={disabled} /></th>
              <th><FilterInput value={filters.region} onChange={setFilter("region")} placeholder="Region" disabled={disabled} /></th>
              <th><FilterInput value={filters.start} onChange={setFilter("start")} placeholder="Start" disabled={disabled} /></th>
              <th className="c-actions" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr className="no-match">
                <td colSpan={8}>No candidates match the current filters.</td>
              </tr>
            )}
            {visible.map((h) => {
              const sent = isSent(h._key);
              const sel = !sent && selectedKeys.has(h._key);
              return (
                <tr
                  key={h._key}
                  className={`${sel ? "sel" : ""} ${sent ? "sent-row" : ""}`}
                  onClick={() => !disabled && !sent && onToggle(h._key)}
                >
                  <td className="c-check">
                    {sent ? (
                      <span className="sent-check" title="Onboarding invitation sent">✓</span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={sel}
                        onChange={() => onToggle(h._key)}
                        disabled={disabled}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${h.name}`}
                      />
                    )}
                  </td>
                  <td>
                    <div className="cand-name">
                      {h.name}
                      {sent && <span className="sent-pill">Invitation sent</span>}
                    </div>
                    <div className="cand-email">{h.email}</div>
                  </td>
                  <td>{h.title}</td>
                  <td>{h.department}</td>
                  <td><TypeBadge type={h.employmentType} /></td>
                  <td>{h.region}</td>
                  <td>{startLabelOf(h.startTiming)}</td>
                  <td className="c-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="row-edit"
                        title={sent ? "Invitation already sent" : `Edit ${h.name}'s details`}
                        aria-label={`Edit ${h.name}`}
                        onClick={() => setEditing(h)}
                        disabled={disabled || sent}
                      >
                        ✎
                      </button>
                      {confirmRemove === h._key ? (
                        <span className="remove-confirm">
                          Remove?
                          <button
                            type="button"
                            className="rc-yes"
                            onClick={() => {
                              onRemove(h._key);
                              setConfirmRemove(null);
                            }}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            className="rc-no"
                            onClick={() => setConfirmRemove(null)}
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="row-remove"
                          title={`Remove ${h.name}`}
                          aria-label={`Remove ${h.name}`}
                          onClick={() => setConfirmRemove(h._key)}
                          disabled={disabled}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditHireModal
          hire={editing}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            const ok = onEditHire(editing._key, data);
            if (ok !== false) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** A compact per-column search box for the filter row. */
function FilterInput({ value, onChange, placeholder, disabled }) {
  return (
    <input
      className="filter-input"
      type="search"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck={false}
      aria-label={placeholder}
    />
  );
}

/** Download the shared sample-new-hires.csv as the import template. */
function downloadTemplate() {
  const blob = new Blob([sampleCsv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sample-new-hires.csv";
  a.click();
  URL.revokeObjectURL(url);
}
