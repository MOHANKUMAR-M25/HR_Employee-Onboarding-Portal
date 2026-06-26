import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontend dev server on :5173. The Java backend runs on :8080 with permissive
// CORS, so the React app calls it directly via VITE_API_BASE (see .env.example).
export default defineConfig({
  plugins: [react()],
  // Relative base so the production build works under a GitHub Pages project
  // subpath (https://<user>.github.io/<repo>/) without hardcoding the repo name.
  base: "./",
  server: {
    port: 5173,
    open: true,
    // The "Download CSV template" button imports the shared sample-new-hires.csv
    // that lives at the repo root (one level above this Vite root), so allow it.
    fs: {
      allow: [".."],
    },
  },
});
