import { defineConfig, mergeConfig, type Plugin } from "vite";
import applicationConfig from "./vite.config";

const runtimeDraws: Record<string, string[]> = {
  "今彩539": ["01", "02", "03", "04", "05"],
  "天天樂": ["06", "07", "08", "09", "10"],
  "六合彩": ["11", "12", "13", "14", "15", "16"],
  "大樂透": ["17", "18", "19", "20", "21", "22"],
};

function matrixRuntimeApiFixture(): Plugin {
  return {
    name: "matrix-runtime-api-fixture",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://runtime.test");
        const prefix = "/api/matrix/latest/";
        if (request.method !== "GET" || !url.pathname.startsWith(prefix)) {
          next();
          return;
        }

        const lottery = decodeURIComponent(url.pathname.slice(prefix.length));
        const numbers = runtimeDraws[lottery];
        if (!numbers) {
          response.statusCode = 404;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: "LOTTERY_NOT_FOUND" }));
          return;
        }

        const specialNumber = lottery === "六合彩" || lottery === "大樂透" ? "23" : undefined;
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({
          revision: "runtime-test",
          item: {
            period: "115000001",
            drawDate: "2026/09/21",
            numbers,
            sortedNumbers: numbers,
            drawOrderNumbers: numbers,
            resultStatus: "confirmed",
            ...(specialNumber ? { specialNumber } : {}),
            nextDrawAt: "2026-09-22T12:00:00Z",
          },
        }));
      });
    },
  };
}

// This job installs the member PWA dependencies. Scan its entry and runtime
// fixtures; the separate admin application owns its own dependency install.
export default defineConfig(mergeConfig(applicationConfig, {
  optimizeDeps: { entries: ["index.html", "tests/**/*.html"] },
  plugins: [matrixRuntimeApiFixture()],
}));
