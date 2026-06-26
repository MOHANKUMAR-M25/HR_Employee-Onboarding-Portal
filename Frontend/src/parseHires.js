// Parse imported new-hire data (CSV or XLSX) into hire objects the onboarding
// agent understands. Header matching is forgiving (case / spacing / common
// aliases) and values are normalised to the enums the backend expects.
import * as XLSX from "xlsx";

// canonical field -> accepted header aliases (all compared in normalised form)
const FIELD_ALIASES = {
  name: ["name", "full name", "fullname", "employee name", "employee", "candidate", "candidate name"],
  email: ["email", "work email", "email address", "mail", "e mail"],
  title: ["title", "job title", "role", "designation", "position"],
  department: ["department", "dept", "team", "function"],
  employmentType: ["employmenttype", "employment type", "employment", "type", "worker type", "engagement"],
  country: ["country", "nation"],
  city: ["city", "location", "office"],
  region: ["region", "geo", "zone"],
  startTiming: ["starttiming", "start timing", "start", "timing", "start type", "joining", "cohort"],
  greeting: ["greeting", "local greeting", "salutation", "hello"],
};

const norm = (h) =>
  String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

// normalised alias -> canonical field
const HEADER_LOOKUP = (() => {
  const m = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    m[norm(field)] = field;
    for (const a of aliases) m[norm(a)] = field;
  }
  return m;
})();

function normEmployment(v) {
  const s = norm(v);
  if (!s) return "FTE";
  if (/contract|consult|vendor|temp|freelance/.test(s)) return "CONTRACTOR";
  if (/intern|trainee|apprentice/.test(s)) return "INTERN";
  return "FTE";
}

function normRegion(v) {
  const s = norm(v);
  if (/eu|europe/.test(s)) return "EU";
  if (/latam|latin|south america/.test(s)) return "LATAM";
  if (/apac|pacific/.test(s)) return "APAC"; // APAC / "Asia-Pacific"
  if (/asia/.test(s)) return "ASIA"; // Asia, kept distinct from APAC
  return "NA"; // north america / americas / default
}

function normTiming(v) {
  const s = norm(v);
  if (/mid/.test(s)) return "mid-quarter";
  if (/end/.test(s)) return "quarter-end";
  return "quarter-start";
}

/** Map one raw spreadsheet row (object keyed by header) to a hire, or null. */
export function normalizeHire(row, index = 0) {
  const hire = {};
  for (const [rawKey, val] of Object.entries(row)) {
    const field = HEADER_LOOKUP[norm(rawKey)];
    if (field) hire[field] = String(val ?? "").trim();
  }
  if (!hire.name || !hire.email) return null; // identity is mandatory

  return {
    name: hire.name,
    email: hire.email,
    title: hire.title || "New Hire",
    department: hire.department || "General",
    employmentType: normEmployment(hire.employmentType),
    country: hire.country || "—",
    city: hire.city || "—",
    region: normRegion(hire.region),
    startTiming: normTiming(hire.startTiming),
    greeting: hire.greeting || "Dear",
    _key: `${hire.email.toLowerCase()}#${index}`,
  };
}

/** Pure: raw rows -> valid hires (testable without the browser). */
export function rowsToHires(rows) {
  return rows.map((r, i) => normalizeHire(r, i)).filter(Boolean);
}

/**
 * Parse an uploaded File (CSV / XLSX / XLS) into { hires, total }.
 * `total` is the number of data rows seen; `hires` are the valid ones
 * (those with at least a name and email).
 */
export async function parseHiresFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { hires: [], total: 0 };
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return { hires: rowsToHires(rows), total: rows.length };
}

/**
 * Parse raw CSV text (not a File) into { hires, total }. Used by the AI
 * assistant to load the bundled sample candidates without a file picker.
 */
export function parseHiresText(text) {
  const wb = XLSX.read(text, { type: "string" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { hires: [], total: 0 };
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return { hires: rowsToHires(rows), total: rows.length };
}

/** The expected column set, for the UI hint and the downloadable template. */
export const TEMPLATE_COLUMNS = [
  "name",
  "email",
  "title",
  "department",
  "employmentType",
  "country",
  "city",
  "region",
  "startTiming",
  "greeting",
];

// Header the backend roster (candidates.csv) round-trips through; the labels
// match the import aliases above so a saved roster re-imports cleanly.
const ROSTER_HEADER =
  "Full Name,Work Email,Job Title,Department,Employment Type,Country,City,Region,Start Timing,Greeting";

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Serialise hires back to the roster CSV the backend persists. */
export function hiresToCsv(hires) {
  const rows = hires.map((h) =>
    [h.name, h.email, h.title, h.department, h.employmentType,
     h.country, h.city, h.region, h.startTiming, h.greeting]
      .map(csvCell)
      .join(",")
  );
  return [ROSTER_HEADER, ...rows].join("\n") + "\n";
}
