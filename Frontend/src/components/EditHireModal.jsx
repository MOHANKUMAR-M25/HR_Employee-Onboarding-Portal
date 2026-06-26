import { useEffect, useState } from "react";
import HireForm from "./HireForm.jsx";

// Edit one candidate's full details in a modal. Reuses the same HireForm the
// "Add a new hire" tab uses, so the fields and validation stay identical. On
// save the parent re-normalises and persists the roster.
export default function EditHireModal({ hire, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...hire }));
  const valid = draft.name.trim() && draft.email.trim();

  // Close on Escape, like a native dialog.
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${hire.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>Edit candidate</h3>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <HireForm value={draft} onChange={setDraft} />

        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!valid}
            onClick={() => onSave(draft)}
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
