import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/latin-700.css";
import "@fontsource/roboto/latin-900.css";
import App from "./App";
import { installGlobalInputBehavior } from "./input-behavior";
import "./styles.css";
import "./prototype.css";
import "./brand-header-unify.css";
import "./homepage-repair.css";
import "./responsive-feature-pages.css";
import "./tongxing-compact.css";
import "./matrix-explore-spacing.css";
import "./feature-page-adjustments.css";
import "./notification-visual-refinement.css";
import "./number-reference-visual-refinement.css";

import { registerPushServiceWorker } from "./push-subscription";

installGlobalInputBehavior();

if ('serviceWorker' in navigator) {
  void registerPushServiceWorker().catch(() => undefined);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
