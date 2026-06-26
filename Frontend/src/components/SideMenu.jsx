import { useEffect } from "react";
import ThemeToggle from "./ThemeToggle.jsx";
import { emailMode } from "../email.js";

// Left menu panel. On wide screens it pushes the main page aside (the .layout
// wrapper shifts right by the rail width); on small screens it slides in over
// the page with a tap-to-close backdrop. Driven by `open` from the menu button.
export default function SideMenu({ open, onClose, user, onSignOut, backendUp }) {
  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <aside
        className={`side-rail ${open ? "open" : ""}`}
        role="dialog"
        aria-label="Menu"
        aria-hidden={!open}
      >
        <div className="side-rail-panel">
          <div className="drawer-head">
            <h2>Menu</h2>
            <button className="drawer-close" type="button" onClick={onClose} aria-label="Close menu">
              ✕
            </button>
          </div>

          <div className="drawer-profile">
            {user.picture ? (
              <img className="user-avatar-img" src={user.picture} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="user-avatar">{initials(user.name)}</span>
            )}
            <div className="drawer-profile-text">
              <div className="drawer-name">{user.name}</div>
              {user.email && <div className="drawer-email">{user.email}</div>}
              {user.via && <div className="drawer-via">signed in via {viaLabel(user.via)}</div>}
            </div>
          </div>

          <div className="drawer-section">
            <div className="drawer-label">Screen theme</div>
            <ThemeToggle />
          </div>

          <div className="drawer-section">
            <div className="drawer-label">Status</div>
            <div className="drawer-status-row">
              <span className={`dot ${backendUp ? "dot-up" : "dot-down"}`} />
              <span className="status-text">
                {backendUp === null ? "connecting…" : backendUp ? "service online" : "service offline"}
              </span>
            </div>
            <div className="drawer-status-row">
              <span className={`email-mode mode-${emailMode}`}>email: {emailMode}</span>
            </div>
          </div>

          <div className="drawer-foot">
            <button
              className="signout-btn drawer-signout"
              type="button"
              onClick={() => {
                onClose();
                onSignOut();
              }}
            >
              ⏻ Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className={`rail-backdrop ${open ? "show" : ""}`} onClick={onClose} aria-hidden="true" />
    </>
  );
}

function initials(name) {
  return (
    String(name || "")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || "")
      .join("") || "HR"
  );
}

function viaLabel(via) {
  return via === "google" || via === "google-demo" ? "Google" : "email";
}
