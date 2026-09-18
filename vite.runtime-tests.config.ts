import { defineConfig, mergeConfig } from "vite";
import applicationConfig from "./vite.config";

// This job installs the member PWA dependencies. Scan its entry and runtime
// fixtures; the separate admin application owns its own dependency install.
export default defineConfig(mergeConfig(applicationConfig, {
  optimizeDeps: { entries: ["index.html", "tests/**/*.html"] },
}));
