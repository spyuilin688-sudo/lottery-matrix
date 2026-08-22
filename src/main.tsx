import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/latin-700.css";
import App from "./App";
import { installGlobalInputBehavior } from "./input-behavior";
import "./styles.css";
import "./prototype.css";
import "./brand-header-unify.css";
import "./homepage-repair.css";
import "./tongxing-compact.css";
import "./admin/admin.css";
import "./matrix-explore-spacing.css";
import { matrixApiFetch } from "./matrix-api-client";
import { startMemberOnlineTracking } from "./member-online";

installGlobalInputBehavior();

if (!window.location.pathname.startsWith("/admin")) {
  startMemberOnlineTracking((path, body) => matrixApiFetch<Record<string, unknown>>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }));
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
