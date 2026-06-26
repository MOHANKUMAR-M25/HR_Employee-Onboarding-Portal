/**
 * Read-only preview of the generated welcome email. Sending is handled in bulk
 * by App when onboarding runs, so this card no longer carries its own button.
 */
export default function EmailPreview({ email }) {
  return (
    <div className="email-card">
      <div className="email-card-head">
        <span className="email-dot" />
        <strong>Welcome email</strong>
        <span className={`pill ${email.personalised ? "pill-good" : "pill-plain"}`}>
          {email.personalised ? "personalised" : "generic template"}
        </span>
      </div>
      <div className="email-row"><span>To</span><code>{email.to}</code></div>
      <div className="email-row"><span>Subject</span><code>{email.subject}</code></div>
      <pre className="email-body">{email.body}</pre>
    </div>
  );
}
