import { useState } from "react";

// The Cognisoft brand logo. Uses the real asset at frontend/public/cognisoft-logo.svg
// (falls back to .png, then to a drawn approximation) so the header/login never breaks.
const SOURCES = ["/cognisoft-logo.svg", "/cognisoft-logo.png"];

export default function BrandLogo() {
  const [idx, setIdx] = useState(0);

  if (idx < SOURCES.length) {
    return (
      <img
        className="cog-logo-img"
        src={SOURCES[idx]}
        alt="Cognisoft"
        onError={() => setIdx((i) => i + 1)}
      />
    );
  }

  // Last-resort inline approximation if no asset is present.
  return (
    <svg
      className="cog-logo-svg"
      viewBox="0 0 270 56"
      role="img"
      aria-label="Cognisoft"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="cogGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0B57A4" />
          <stop offset="55%" stopColor="#1488CC" />
          <stop offset="100%" stopColor="#29C2E8" />
        </linearGradient>
      </defs>
      <polygon points="52,28 40,7 16,7 4,28 16,49 40,49" fill="url(#cogGrad)" />
      <polygon points="21,16 21,40 41,28" fill="#fff" />
      <text x="64" y="38" className="cog-logo-word" fill="currentColor">
        Cognisoft
      </text>
    </svg>
  );
}
