// EmailJS integration with a demo-safe mock fallback.
//
// mode=mock (default): we never hit the network; the caller just renders the
//   email in the UI. Returns { ok, mode:"mock" }.
// mode=live: sends through EmailJS using the configured service/template/key.
//   Template maps: {{to_email}} (recipient), {{name}} (hire's name, used in the
//   subject), {{message}} (the email body) and {{footer}} (the footer note).
import emailjs from "@emailjs/browser";

const MODE = (import.meta.env.VITE_EMAILJS_MODE || "mock").toLowerCase();
const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

// The template body renders only {{message}} then this note. Kept here (not in
// the dashboard) so the wording lives with the code and stays consistent.
const EMAIL_FOOTER =
  "— This is an automated message from the Cognizant Onboarding Team. " +
  "Please don't reply to this email; reach out to your onboarding buddy with any questions.";

export const emailMode = MODE;

export const emailConfigured =
  MODE === "live" && !!SERVICE_ID && !!TEMPLATE_ID && !!PUBLIC_KEY;

/**
 * Send (or mock) a welcome email.
 * @param {{to:string, subject:string, body:string}} email
 * @param {string} personaName
 * @param {string} source  onboarding-path label recorded on the send (currently always "ADLC")
 */
export async function sendWelcomeEmail(email, personaName, source) {
  if (MODE !== "live") {
    // Mock: simulate a tiny round-trip so the UI can show a "sending" state.
    await new Promise((r) => setTimeout(r, 350));
    return { ok: true, mode: "mock" };
  }
  if (!emailConfigured) {
    throw new Error(
      "EmailJS live mode is on but service/template/public key are missing in .env"
    );
  }

  // Fail fast with a clear message instead of EmailJS's cryptic 422.
  const recipient = (email.to || "").trim();
  if (!recipient) {
    throw new Error("No recipient address — email.to is empty.");
  }

  // EmailJS reads the recipient from the template's "To Email" field, not from
  // a fixed key. Send the address under every common variable name so it
  // resolves whatever that field is set to ({{to_email}}, {{email}}, {{to}}…).
  try {
    await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      {
        to_email: recipient,
        email: recipient,
        to: recipient,
        reply_to: recipient,
        // Subject uses {{name}}; pass the hire's name so it resolves.
        name: personaName,
        subject: email.subject,
        // Body template renders {{message}} (the body) then {{footer}}.
        message: email.body,
        footer: EMAIL_FOOTER,
        persona_name: personaName,
        mode: source,
        personalised: email.personalised ? "Personalised" : "Generic template",
      },
      { publicKey: PUBLIC_KEY }
    );
  } catch (err) {
    // EmailJS rejects with { status, text } — no .message — so surface those.
    const text = err?.text || err?.message || "Unknown EmailJS error";
    if (/insufficient authentication scopes/i.test(text)) {
      throw new Error(
        "Gmail isn't authorised to send. In the EmailJS dashboard reconnect " +
          "the Gmail service and tick “Send email on your behalf” on Google's " +
          "consent screen."
      );
    }
    throw new Error(`EmailJS send failed (${err?.status ?? "?"}): ${text}`);
  }
  return { ok: true, mode: "live" };
}
