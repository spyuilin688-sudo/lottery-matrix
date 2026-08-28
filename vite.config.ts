import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Railway API test environment is intentionally fixed for unit tests.
export default defineConfig({
  build: {
    outDir: "dist",
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
  test: {
    env: {
      VITE_RAILWAY_API_BASE: "https://railway-api.test",
    },
  },
  plugins: [react()],
});
