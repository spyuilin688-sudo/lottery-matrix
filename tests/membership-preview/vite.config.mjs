// QA-only build. Real UI and styles, deterministic service doubles; never imported by the app.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const fixture = fileURLToPath(new URL(".", import.meta.url));
const state = fileURLToPath(new URL("./state.ts", import.meta.url));
export default defineConfig({
  root: fixture,
  base: "/qa/",
  publicDir: false,
  plugins: [
    {
      name: "membership-qa-service-boundaries",
      enforce: "pre",
      transform(_code, id) {
        if (/\/src\/lib\/supabase\.ts$/.test(id)) return `export { getSupabaseClient, hasSupabaseConfig } from ${JSON.stringify(state)};`;
        if (/\/src\/auth\/line-auth\.ts$/.test(id)) return `export { signInWithLine, signOutFromMatrix, reconcilePendingLineLogoutPresence } from ${JSON.stringify(state)};`;
        if (/\/src\/pwa-lifecycle\.tsx$/.test(id)) return `export { usePwaLifecycle } from ${JSON.stringify(state)};`;
        if (/\/src\/permission-settings\.ts$/.test(id)) return `export { usePermissionSettings } from ${JSON.stringify(state)};`;
      },
    },
    react(),
  ],
  build: { outDir: "../../qa", emptyOutDir: true },
});
