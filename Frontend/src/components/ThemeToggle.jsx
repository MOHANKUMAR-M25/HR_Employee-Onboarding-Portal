import { useState } from "react";
import { getThemePref, setThemePref } from "../theme.js";

const OPTIONS = [
  { id: "light", icon: "☀️", label: "Light" },
  { id: "dark", icon: "🌙", label: "Dark" },
  { id: "system", icon: "🖥️", label: "System" },
];

/** Compact Light / Dark / System theme switcher. */
export default function ThemeToggle() {
  const [pref, setPref] = useState(getThemePref);

  function choose(id) {
    setThemePref(id);
    setPref(id);
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`theme-opt ${pref === o.id ? "active" : ""}`}
          onClick={() => choose(o.id)}
          title={`${o.label} theme`}
          aria-label={`${o.label} theme`}
          aria-pressed={pref === o.id}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
