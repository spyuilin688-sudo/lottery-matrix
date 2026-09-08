// Browser regression fixture: real page and styles; RPCs are intercepted by the spec.
import { createRoot } from 'react-dom/client';
import { MatrixCustomStatusPage } from '../src/features/MatrixStatusPages';
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
import "../src/brand-header-unify.css";
import "../src/homepage-repair.css";
import "../src/responsive-feature-pages.css";
import "../src/tongxing-compact.css";
import "../src/matrix-explore-spacing.css";
import "../src/matrix-explore-result-13px.css";
import "../src/feature-page-adjustments.css";
import "../src/profile-card-visible-width.css";
import "../src/notification-visual-refinement.css";
import "../src/number-reference-visual-refinement.css";
import "../src/line-pwa-return-fallback.css";

// This fixture represents an authenticated member. Production session checks
// remain active; the spec intercepts every custom-settings RPC response.
getSupabaseClient().auth.getSession = async () => ({
  data: { session: {
    access_token: 'custom-status-layout-fixture', refresh_token: 'fixture-only',
    token_type: 'bearer', expires_in: 3600,
    user: { id: '00000000-0000-4000-8000-000000000446', aud: 'authenticated',
      app_metadata: {}, user_metadata: {}, created_at: '2026-09-08T00:00:00Z' },
  } },
  error: null,
});

createRoot(document.getElementById('root')!).render(
  <AppDialogProvider><div className="app-mobile-canvas">
    <MobileDeviceProvider><KeyboardProvider><MobileScroll className="app-screen">
      <MatrixCustomStatusPage onNavigate={() => {}} />
    </MobileScroll></KeyboardProvider></MobileDeviceProvider>
  </div></AppDialogProvider>,
);
