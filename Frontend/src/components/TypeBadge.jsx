// Single source of truth for the employment-type pill, so the import table and
// every result view label Contractor / Intern / Full-time the same way.
const META = {
  CONTRACTOR: { label: "Contractor", cls: "badge-contractor" },
  INTERN: { label: "Intern", cls: "badge-intern" },
  FTE: { label: "Full-time", cls: "badge-fte" },
};

export default function TypeBadge({ type }) {
  const m = META[type] || META.FTE;
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}
