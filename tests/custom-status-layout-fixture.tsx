// Browser regression fixture: real page and styles; RPCs are intercepted by the spec.
import { createRoot } from 'react-dom/client';
import { MatrixCustomStatusPage } from '../src/features/MatrixStatusPages';
import { AppDialogProvider } from '../src/dialog/AppDialog';
import { MobileDeviceProvider } from '../src/mobile/Device';
import { KeyboardProvider } from '../src/mobile/Keyboard';
import { MobileScroll } from '../src/mobile/MobileScroll';
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
createRoot(document.getElementById('root')!).render(
  <AppDialogProvider><div className="app-mobile-canvas">
    <MobileDeviceProvider><KeyboardProvider><MobileScroll className="app-screen">
      <MatrixCustomStatusPage onNavigate={() => {}} />
    </MobileScroll></KeyboardProvider></MobileDeviceProvider>
  </div></AppDialogProvider>,
);
