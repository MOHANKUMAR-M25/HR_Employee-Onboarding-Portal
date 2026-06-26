// Lightweight client-side auth for the HR portal demo.
//
// There is no auth backend in this prototype, so:
//   - email/password is validated locally (any valid email + 4+ char password)
//   - the session is persisted in localStorage so a refresh stays signed in
//   - Google sign-in uses real Google Identity Services when VITE_GOOGLE_CLIENT_ID
//     is set; otherwise a clearly-labelled demo account is used so the flow still
//     reaches the portal on stage.

const SESSION_KEY = "adlc_hr_session";

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
export const googleConfigured = !!GOOGLE_CLIENT_ID;

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // corrupt/blocked storage → treat as signed out
  }
}

function setSession(user) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch {
    /* storage may be unavailable (private mode) — session is in-memory only */
  }
  return user;
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Title-case a display name from the local part of an email. */
function nameFromEmail(email) {
  const local = String(email).split("@")[0].replace(/[._-]+/g, " ").trim();
  return local.replace(/\b\w/g, (c) => c.toUpperCase()) || "HR User";
}

/** Demo email/password sign-in: validates locally, no network call. */
export function signInWithPassword(email, password) {
  const e = (email || "").trim();
  if (!EMAIL_RE.test(e)) throw new Error("Enter a valid work email address.");
  if (!password || password.length < 4)
    throw new Error("Password must be at least 4 characters.");
  return setSession({ name: nameFromEmail(e), email: e, via: "password" });
}

/** Decode a Google ID-token (JWT) payload and start a session from it. */
export function signInWithGoogleCredential(credential) {
  const json = decodeURIComponent(
    atob(credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
  const p = JSON.parse(json);
  return setSession({
    name: p.name || nameFromEmail(p.email || "user"),
    email: p.email,
    picture: p.picture,
    via: "google",
  });
}

/** Demo Google sign-in used when no client ID is configured. */
export function signInWithGoogleDemo() {
  return setSession({
    name: "HR Demo User",
    email: "hr.demo@cognizant.com",
    via: "google-demo",
  });
}
