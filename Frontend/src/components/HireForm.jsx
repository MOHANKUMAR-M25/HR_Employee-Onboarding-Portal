// Controlled new-hire form. App owns the `value` object so the shared
// "Start onboarding" button can submit whichever source (import or form)
// is active. The fields map 1:1 to what the Java onboarding agent reasons on.

const REGIONS = [
  { value: "NA", label: "North America" },
  { value: "EU", label: "Europe (EU)" },
  { value: "APAC", label: "APAC" },
  { value: "LATAM", label: "LATAM" },
  { value: "ASIA", label: "Asia" },
];

const DEPARTMENTS = [
  "Engineering",
  "Analytics",
  "Sales",
  "Consulting",
  "Finance",
  "Human Resources",
  "Operations",
];

export default function HireForm({ value, onChange, disabled }) {
  const set = (field) => (e) => onChange({ ...value, [field]: e.target.value });
  const setRaw = (field, v) => onChange({ ...value, [field]: v });

  // Imported rosters can carry any department, so surface the current value as an
  // option even when it isn't one of the presets — otherwise editing blanks it.
  const deptOptions =
    value.department && !DEPARTMENTS.includes(value.department)
      ? [value.department, ...DEPARTMENTS]
      : DEPARTMENTS;

  return (
    <div className="hire-form">
      <div className="field-grid">
        <Field label="Full name" required>
          <input
            className="input"
            value={value.name}
            onChange={set("name")}
            placeholder="e.g. Asha Rao"
            disabled={disabled}
          />
        </Field>

        <Field label="Work email" required>
          <input
            className="input"
            type="email"
            value={value.email}
            onChange={set("email")}
            placeholder="asha.rao@cognizant.com"
            disabled={disabled}
          />
        </Field>

        <Field label="Job title">
          <input
            className="input"
            value={value.title}
            onChange={set("title")}
            placeholder="e.g. Software Engineer"
            disabled={disabled}
          />
        </Field>

        <Field label="Department">
          <select
            className="input"
            value={value.department}
            onChange={set("department")}
            disabled={disabled}
          >
            <option value="">Select department…</option>
            {deptOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>

        <Field label="City">
          <input
            className="input"
            value={value.city}
            onChange={set("city")}
            placeholder="e.g. Chennai"
            disabled={disabled}
          />
        </Field>

        <Field label="Country">
          <input
            className="input"
            value={value.country}
            onChange={set("country")}
            placeholder="e.g. India"
            disabled={disabled}
          />
        </Field>

        <Field label="Region">
          <select
            className="input"
            value={value.region}
            onChange={set("region")}
            disabled={disabled}
          >
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Local greeting" hint="Used to localise the welcome email">
          <input
            className="input"
            value={value.greeting}
            onChange={set("greeting")}
            placeholder="Dear · Hallo · Olá · Namaste"
            disabled={disabled}
          />
        </Field>
      </div>

      <div className="field-grid field-grid-2">
        <Field label="Employment type">
          <div className="segmented" role="group" aria-label="Employment type">
            {[
              { v: "FTE", l: "Full-time" },
              { v: "CONTRACTOR", l: "Contractor" },
              { v: "INTERN", l: "Intern" },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                className={`seg ${value.employmentType === o.v ? "active" : ""}`}
                onClick={() => setRaw("employmentType", o.v)}
                disabled={disabled}
              >
                {o.l}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Start timing">
          <div className="segmented" role="group" aria-label="Start timing">
            {[
              { v: "quarter-start", l: "Quarter start" },
              { v: "mid-quarter", l: "Mid-quarter" },
              { v: "quarter-end", l: "Quarter end" },
              
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                className={`seg ${value.startTiming === o.v ? "active" : ""}`}
                onClick={() => setRaw("startTiming", o.v)}
                disabled={disabled}
              >
                {o.l}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </div>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <span className="req">*</span>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
