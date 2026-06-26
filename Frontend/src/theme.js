// Light / dark / system theming. The preference (light | dark | system) is
// stored in localStorage; the DOM always carries a concrete data-theme
// ("light" or "dark") on <html>, which the CSS variables key off. In "system"
// mode we resolve from prefers-color-scheme and react to OS changes live.

const KEY = "adlc_theme";
const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export function getThemePref() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage blocked — fall through to default */
  }
  return "system";
}

function resolve(pref) {
  if (pref === "light" || pref === "dark") return pref;
  return mq && mq.matches ? "dark" : "light";
}

export function applyTheme(pref = getThemePref()) {
  document.documentElement.dataset.theme = resolve(pref);
}

export function setThemePref(pref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
  applyTheme(pref);
}

// Follow the OS while in "system" mode.
if (mq) {
  const onChange = () => {
    if (getThemePref() === "system") applyTheme("system");
  };
  mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
}

// Apply once at module load (runs before React renders, so no flash).
applyTheme();
