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
import "./matrix-explore-result-13px.css";
import "./feature-page-adjustments.css";
import "./notification-visual-refinement.css";
import "./number-reference-visual-refinement.css";

import { registerPushServiceWorker } from "./push-subscription";
import { finishLineLoginPopup } from './auth/line-login-popup';
import { getSupabaseClient } from './lib/supabase';
import { installVisitorTracking } from './visitor-counts';

installGlobalInputBehavior();

if ('serviceWorker' in navigator) {
  void registerPushServiceWorker().catch(() => undefined);
}

const root = document.getElementById('root')!;
const renderApp = () => {
  const stopVisitorTracking = installVisitorTracking();
  if (import.meta.hot) import.meta.hot.dispose(stopVisitorTracking);
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
};
root.textContent = '正在開啟樂彩 Matrix…';
void finishLineLoginPopup(getSupabaseClient).then((handled) => {
  if (!handled) renderApp();
}).catch(renderApp);
