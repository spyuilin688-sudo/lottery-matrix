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
import "./profile-card-visible-width.css";
import "./notification-visual-refinement.css";
import "./number-reference-visual-refinement.css";
import "./line-pwa-return-fallback.css";

import { registerPushServiceWorker } from "./push-subscription";
import { finishLineLoginPopup } from './auth/line-login-popup';
import { getSupabaseClient } from './lib/supabase';
import {
  hasLineOAuthCallback,
  registerLinePwaClient,
  requestLinePwaReturn,
} from './auth/line-pwa-return';
import { installVisitorTracking } from './visitor-counts';
import { flushLinePwaDiagnostics } from './auth/line-pwa-diagnostics';
import {
  LinePwaReturnFallback,
  createLinePwaReturnHref,
} from './auth/LinePwaReturnFallback';
import { isPwaDisplayMode } from './pwa-display-mode';

installGlobalInputBehavior();

const linePwaWorkerReady = 'serviceWorker' in navigator
  ? registerPushServiceWorker()
    .then(() => registerLinePwaClient())
    .catch(() => false)
  : Promise.resolve(false);

const root = document.getElementById('root')!;
let diagnosticFlushStarted = false;
const renderApp = () => {
  const stopVisitorTracking = installVisitorTracking();
  if (import.meta.hot) import.meta.hot.dispose(stopVisitorTracking);
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  if (!diagnosticFlushStarted) {
    diagnosticFlushStarted = true;
    void flushLinePwaDiagnostics(window, getSupabaseClient());
  }
};

const renderLinePwaReturnFallback = () => {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <LinePwaReturnFallback returnHref={createLinePwaReturnHref(window)} />
    </React.StrictMode>,
  );
};

root.textContent = '正在開啟樂彩 Matrix…';
const hasNormalLineCallback = hasLineOAuthCallback();

async function bootstrap() {
  if (hasNormalLineCallback) {
    const callbackIsOutsidePwa = !isPwaDisplayMode(window);
    if ('serviceWorker' in navigator) {
      await linePwaWorkerReady;
      const handedOff = await requestLinePwaReturn(
        window,
        navigator.serviceWorker,
        hasNormalLineCallback,
      );
      if (handedOff) {
        root.textContent = '正在返回樂彩 Matrix…';
        try { window.close(); } catch { /* Browser may refuse closing a top-level tab. */ }
        return;
      }
    }

    // If the callback is already inside the PWA, or no installed PWA can accept
    // it, let Supabase consume the callback in this exact browsing context.
    try {
      const { data, error } = await getSupabaseClient().auth.getSession();
      const callbackWasConsumed = !hasLineOAuthCallback(window);
      if (callbackIsOutsidePwa && callbackWasConsumed && !error && data.session) {
        renderLinePwaReturnFallback();
        return;
      }
    } catch {
      // The normal App bootstrap retains its existing session/error handling.
    }
  }

  const handled = await finishLineLoginPopup(getSupabaseClient);
  if (!handled) renderApp();
}

void bootstrap().catch(renderApp);
