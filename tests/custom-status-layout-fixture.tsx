// Browser regression fixture: real page and styles; RPCs are intercepted by the spec.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MatrixCustomStatusPage, MatrixStatusPage } from '../src/features/MatrixStatusPages';
import { AppDialogProvider } from '../src/dialog/AppDialog';
import { MobileDeviceProvider } from '../src/mobile/Device';
import { KeyboardProvider } from '../src/mobile/Keyboard';
import { MobileScroll } from '../src/mobile/MobileScroll';
import { getSupabaseClient } from '../src/lib/supabase';
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/latin-700.css";
import "@fontsource/roboto/latin-900.css";
import "../src/styles.css";
import "../src/prototype.css";
import "../src/homepage-repair.css";
import "../src/tongxing-compact.css";
import "../src/matrix-explore-spacing.css";
import "../src/feature-page-adjustments.css";
import "../src/number-reference-visual-refinement.css";
import "../src/line-pwa-return-fallback.css";

// Test-only sessions; production session checks and RPC handling stay active.
const fixtureParams = new URLSearchParams(window.location.search);
getSupabaseClient().auth.getSession = async () => ({
  data: { session: fixtureParams.has('guest') ? null : {
    access_token: 'custom-status-layout-fixture', refresh_token: 'fixture-only',
    token_type: 'bearer', expires_in: 3600,
    user: { id: '00000000-0000-4000-8000-000000000446', aud: 'authenticated',
      app_metadata: { provider: 'custom:line' }, user_metadata: {}, created_at: '2026-09-08T00:00:00Z' },
  } },
  error: null,
});
getSupabaseClient().auth.onAuthStateChange = () => ({ data: { subscription: {
  id: 'custom-status-fixture', callback: () => {}, unsubscribe() {},
} } });

function FixturePage() {
  const [screen, setScreen] = useState(fixtureParams.has('entry') ? 'status' : 'status-settings');
  return screen === 'status-settings'
    ? <MatrixCustomStatusPage onNavigate={setScreen} />
    : <MatrixStatusPage onNavigate={setScreen} />;
}

createRoot(document.getElementById('root')!).render(
  <AppDialogProvider><div className="app-mobile-canvas">
    <MobileDeviceProvider><KeyboardProvider><MobileScroll className="app-screen">
      <FixturePage />
    </MobileScroll></KeyboardProvider></MobileDeviceProvider>
  </div></AppDialogProvider>,
);
