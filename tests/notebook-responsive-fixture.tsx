import { createRoot } from 'react-dom/client';
import { MatrixNotebookPage } from '../src/features/NotebookPages';
import { getSupabaseClient } from '../src/lib/supabase';
import { AppDialogProvider } from '../src/dialog/AppDialog';
import { MobileDeviceProvider } from '../src/mobile/Device';
import { KeyboardProvider } from '../src/mobile/Keyboard';
import { MobileScroll } from '../src/mobile/MobileScroll';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-700.css';
import '@fontsource/roboto/latin-900.css';
import '../src/feature-pages.css';
import '../src/styles.css';
import '../src/prototype.css';
import '../src/brand-header-unify.css';
import '../src/homepage-repair.css';
import '../src/responsive-feature-pages.css';
import '../src/tongxing-compact.css';
import '../src/matrix-explore-spacing.css';
import '../src/matrix-explore-result-13px.css';
import '../src/feature-page-adjustments.css';
import '../src/profile-card-visible-width.css';
import '../src/notification-visual-refinement.css';
import '../src/number-reference-visual-refinement.css';
import '../src/line-pwa-return-fallback.css';

// Isolated synthetic owner; no real LINE login or member API is used by this fixture.
getSupabaseClient().auth.getSession = async () => ({
  data: { session: {
    access_token: 'notebook-layout-fixture', refresh_token: 'fixture-only',
    token_type: 'bearer', expires_in: 3600,
    user: { id: 'notebook-layout-fixture', aud: 'authenticated',
      app_metadata: { provider: 'custom:line' }, user_metadata: {}, created_at: '2026-09-08T00:00:00Z' },
  } },
  error: null,
});
getSupabaseClient().auth.onAuthStateChange = () => ({ data: { subscription: {
  id: 'notebook-layout-fixture', callback: () => {}, unsubscribe() {},
} } });
window.localStorage.setItem('matrix-notebook:v2:notebook-layout-fixture', JSON.stringify({
  notes: [
    { id: 'first', title: '第一張筆記', content: '保留原有內容', updatedAt: '2026-09-08T10:00:00Z' },
    { id: 'long', title: '長標題'.repeat(30), content: '長內容'.repeat(100), updatedAt: '2026-09-08T11:00:00Z' },
  ],
}));

// Render the real notebook with its production providers and CSS cascade.
// This test-only entry has no member bridge or network-backed page bootstrap.
createRoot(document.getElementById('root')!).render(
  <AppDialogProvider>
    <div className="app-mobile-canvas">
      <MobileDeviceProvider>
        <KeyboardProvider>
          <MobileScroll><MatrixNotebookPage onNavigate={() => undefined} /></MobileScroll>
        </KeyboardProvider>
      </MobileDeviceProvider>
    </div>
  </AppDialogProvider>,
);
