import { useEffect, useRef, useState } from "react";
import {
  signInWithPassword,
  signInWithGoogleCredential,
  signInWithGoogleDemo,
  GOOGLE_CLIENT_ID,
  googleConfigured,
} from "../auth.js";
import BrandLogo from "./BrandLogo.jsx";

const GSI_SRC = "https://accounts.google.com/gsi/client";

// Load the Google Identity Services script exactly once and resolve when the
// `google.accounts.id` API is ready. Shared across mounts so React 18's
// StrictMode double-invoke can't create duplicate scripts or race the load.
let gsiPromise = null;
function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gsiPromise = null; // allow a retry on a later mount
      reject(new Error("Failed to load Google Identity Services"));
    };
    document.head.appendChild(s);
  });
  return gsiPromise;
}

/**
 * HR portal sign-in. Email/password (validated locally for the demo) plus
 * Google sign-in. On success it calls onAuthed(user); App swaps in the portal.
 */
export default function Login({ onAuthed }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gsiFailed, setGsiFailed] = useState(false);
  const googleBtnRef = useRef(null);

  function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onAuthed(signInWithPassword(email, password));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  // Render the real Google button via Google Identity Services when configured.
  useEffect(() => {
    if (!googleConfigured) return;
    let active = true;

    loadGsi()
      .then(() => {
        if (!active || !googleBtnRef.current || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (resp) => {
            try {
              onAuthed(signInWithGoogleCredential(resp.credential));
            } catch {
              setError("Google sign-in failed — please try again.");
            }
          },
        });
        googleBtnRef.current.innerHTML = ""; // avoid a stacked duplicate on re-mount
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: "outline",
          size: "large",
          width: 320,
          text: "continue_with",
          logo_alignment: "center",
        });
        // GSI renders nothing (only logs to the console) when the page origin
        // isn't an authorised JavaScript origin for the client ID. Detect the
        // empty container and fall back so the user never faces blank space.
        window.setTimeout(() => {
          if (active && googleBtnRef.current && googleBtnRef.current.childElementCount === 0) {
            setGsiFailed(true);
          }
        }, 1200);
      })
      .catch(() => {
        if (active) setGsiFailed(true);
      });

    return () => {
      active = false;
    };
  }, [onAuthed]);

  // Show the real Google button when configured and GIS loaded; otherwise fall
  // back to a demo Google sign-in so the flow always reaches the portal.
  const useRealGoogle = googleConfigured && !gsiFailed;

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-brand">
          <BrandLogo />
          <span className="login-brand-sep">–</span>
          <h1 className="login-title">HR Portal</h1>
        </div>
        <p className="login-sub">Personalised, policy-aware onboarding for every new hire</p>

        <form className="login-form" onSubmit={submit}>
          <label className="field">
            <span className="field-label">Work email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@cognizant.com"
              autoComplete="username"
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <div className="pw-wrap">
              <input
                className="input"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {error && <div className="login-error">{error}</div>}

          <button className="btn btn-primary login-submit" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="login-divider"><span>or</span></div>

        {/* Keep the GSI container mounted whenever configured so the ref is
            available for renderButton; hide it only if loading actually fails. */}
        {googleConfigured && (
          <div className="google-btn" ref={googleBtnRef} style={useRealGoogle ? undefined : { display: "none" }} />
        )}
        {!useRealGoogle && (
          <button
            type="button"
            className="btn google-fallback"
            onClick={() => onAuthed(signInWithGoogleDemo())}
          >
            <GoogleMark /> Continue with Google
          </button>
        )}

        <p className="login-hint">
         
          {!googleConfigured &&
            " Google uses a demo account until VITE_GOOGLE_CLIENT_ID is set in .env."}
          {gsiFailed &&
            " Google sign-in didn't load — confirm http://localhost:5173 is an Authorized JavaScript origin (and open the app via localhost, not 127.0.0.1). Using a demo button for now."}
        </p>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg className="g-mark" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95L3.97 7.3C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
