// Browser regression fixture: render the production router; the spec intercepts every remote request.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FeaturePageRouter, type ScreenId } from '../src/FeaturePagesPatched';
import { AppDialogProvider } from '../src/dialog/AppDialog';
import { MobileDeviceProvider } from '../src/mobile/Device';
import { KeyboardProvider } from '../src/mobile/Keyboard';
import { MobileScroll } from '../src/mobile/MobileScroll';
import { refreshPermissionSettings } from '../src/permission-settings';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-700.css';
import '@fontsource/roboto/latin-900.css';
import '../src/styles.css';
import '../src/prototype.css';
import '../src/feature-pages.css';
import '../src/explore-validation-protection.css';
import '../src/homepage-repair.css';
import '../src/tongxing-compact.css';
import '../src/matrix-explore-spacing.css';
import '../src/matrix-tianheng.css';
import '../src/feature-page-adjustments.css';
import '../src/line-pwa-return-fallback.css';

void refreshPermissionSettings().catch(() => {});

function Fixture() {
  const [screen, setScreen] = useState<ScreenId>('tianshu');
  return <FeaturePageRouter screen={screen} onNavigate={setScreen} />;
}

createRoot(document.getElementById('root')!).render(
  <AppDialogProvider>
    <div className="app-mobile-canvas">
      <MobileDeviceProvider>
        <KeyboardProvider>
          <MobileScroll className="app-screen"><Fixture /></MobileScroll>
        </KeyboardProvider>
      </MobileDeviceProvider>
    </div>
  </AppDialogProvider>,
);
