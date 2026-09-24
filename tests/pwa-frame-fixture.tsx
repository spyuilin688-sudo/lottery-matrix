// Test-only host: render the actual production router and intercept every remote request in the spec.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { FeaturePageRouter, type ScreenId } from '../src/FeaturePagesPatched';
import { AppDialogProvider } from '../src/dialog/AppDialog';
import { MobileDeviceProvider } from '../src/mobile/Device';
import { KeyboardProvider } from '../src/mobile/Keyboard';
import { MobileScroll } from '../src/mobile/MobileScroll';
import { getSupabaseClient } from '../src/lib/supabase';
import { publishMemberSessionReady } from '../src/auth/member-session-store';
import { updateAlgorithmCacheSession } from '../src/auth/algorithm-cache-scope';
import { refreshPermissionSettings } from '../src/permission-settings';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-700.css';
import '@fontsource/roboto/latin-900.css';
import '../src/styles.css';
import '../src/prototype.css';
import '../src/feature-pages.css';
import '../src/explore-validation-protection.css';
import '../src/pro-plans-layout.css';
import '../src/pro-plans-carousel-peek.css';
import '../src/activation-code-layout.css';
import '../src/tianyan-expanded-layout-patch.css';
import '../src/homepage-repair.css';
import '../src/tongxing-compact.css';
import '../src/matrix-explore-spacing.css';
import '../src/matrix-tianheng.css';
import '../src/feature-page-adjustments.css';
import '../src/number-reference-visual-refinement.css';
import '../src/line-pwa-return-fallback.css';

const fixtureSession: Session = {
  access_token: 'pwa-frame-fixture-only', refresh_token: 'fixture-only',
  token_type: 'bearer', expires_in: 3600,
  user: { id: '00000000-0000-4000-8000-000000000915', aud: 'authenticated',
    app_metadata: { provider: 'custom:line' }, user_metadata: { name: 'Frame verification' },
    created_at: '2026-09-15T00:00:00Z' },
};
getSupabaseClient().auth.getSession = async () => ({ data: { session: fixtureSession }, error: null });
getSupabaseClient().auth.onAuthStateChange = () => ({ data: { subscription: {
  id: 'pwa-frame-fixture', callback: () => {}, unsubscribe() {},
} } });
updateAlgorithmCacheSession(fixtureSession);
publishMemberSessionReady(fixtureSession);
void refreshPermissionSettings().catch(() => {});

function Fixture() {
  const [screen, setScreen] = useState<ScreenId>((new URLSearchParams(location.search).get('page') || 'explore') as ScreenId);
  return <FeaturePageRouter screen={screen} onNavigate={setScreen} />;
}
createRoot(document.getElementById('root')!).render(
  <AppDialogProvider><div className="app-mobile-canvas">
    <MobileDeviceProvider><KeyboardProvider><MobileScroll className="app-screen">
      <Fixture />
    </MobileScroll></KeyboardProvider></MobileDeviceProvider>
  </div></AppDialogProvider>,
);
