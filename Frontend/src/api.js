// Thin client for the Java backend.
const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

/** Probe the backend on startup; resolves to the health payload or throws. */
export async function checkHealth() {
  const res = await fetch(`${BASE}/api/health`);
  if (!res.ok) throw new Error(`Onboarding service unavailable (${res.status})`);
  return res.json();
}

/**
 * Run onboarding for one new hire — an object captured by the form or one row
 * of an imported CSV/XLSX file. Returns the personalised plan.
 */
export const onboard = (hire) => post("/api/onboard", hire);

/** Persist a removed candidate to the backend's removed-candidates.csv. */
export const recordRemoved = (hire) => post("/api/removed", hire);

/** Persist an onboarded (invitation-sent) candidate to onboarded-candidates.csv. */
export const recordOnboarded = (hire) => post("/api/onboarded", hire);

/**
 * The working candidate roster, persisted on the backend as candidates.csv so
 * it survives a page refresh. GET returns raw CSV (parse with parseHiresText).
 */
export async function fetchCandidatesCsv() {
  const res = await fetch(`${BASE}/api/candidates`);
  if (!res.ok) throw new Error(`/api/candidates failed (${res.status})`);
  return res.text();
}

/** The curated sample roster (sample-new-hires.csv) as raw CSV text, including
 *  any edits mirrored back to it — so the assistant's "import sample" is current. */
export async function fetchSampleCsv() {
  const res = await fetch(`${BASE}/api/sample`);
  if (!res.ok) throw new Error(`/api/sample failed (${res.status})`);
  return res.text();
}

/** Replace the persisted roster with the given CSV text. */
export async function saveCandidates(csv) {
  const res = await fetch(`${BASE}/api/candidates`, {
    method: "POST",
    headers: { "Content-Type": "text/csv" },
    body: csv,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`/api/candidates save failed (${res.status}): ${text}`);
  }
  return res.json();
}

/** Dashboard history: parsed onboarded / removed records (newest first). */
export const fetchOnboarded = () => getRecords("/api/onboarded");
export const fetchRemoved = () => getRecords("/api/removed");

// Fixed column order written by the backend; map positionally so the header
// label of the first column ("Sent At" vs "Removed At") doesn't matter.
const RECORD_FIELDS = [
  "at", "name", "email", "title", "department",
  "type", "country", "city", "region", "start", "greeting",
];

async function getRecords(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  const rows = parseCsv(await res.text());
  return rows
    .slice(1) // drop header
    .filter((r) => r.some((c) => c !== ""))
    .map((r) => Object.fromEntries(RECORD_FIELDS.map((f, i) => [f, r[i] ?? ""])));
}

/** Parse CSV text into an array of string arrays, honouring quoted fields. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export { BASE as API_BASE };
