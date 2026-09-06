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
import {
  hasLineOAuthCallback,
  registerLinePwaClient,
  requestLinePwaReturn,
} from './auth/line-pwa-return';
import { installVisitorTracking } from './visitor-counts';

installGlobalInputBehavior();

if ('serviceWorker' in navigator) {
  void registerPushServiceWorker().catch(() => undefined);
  void registerLinePwaClient().catch(() => undefined);
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
const hasNormalLineCallback = hasLineOAuthCallback();

async function bootstrap() {
  if (hasNormalLineCallback) {
    if ('serviceWorker' in navigator) {
      const handedOff = await requestLinePwaReturn(
        window,
        navigator.serviceWorker,
        hasNormalLineCallback,
      );
      if (handedOff) {
        root.textContent = '登入成功，正在返回樂彩 Matrix…';
        return;
      }
    }

    // If the callback is already inside the PWA, or no installed PWA can accept
    // it, let Supabase consume the callback in this exact browsing context.
    try {
      await getSupabaseClient().auth.getSession();
    } catch {
      // The normal App bootstrap retains its existing session/error handling.
    }
  }

  const handled = await finishLineLoginPopup(getSupabaseClient());
  if (!handled) renderApp();
}

void bootstrap().catch(renderApp);
