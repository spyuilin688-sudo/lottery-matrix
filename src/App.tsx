import { AppInfoPage, isAppInfoPath } from './app-info/AppInfoPage';
import { useEffect } from "react";
import { installPermissionSettingsRefresh } from "./permission-settings";
import { MemberSessionBridge } from "./auth/MemberSessionBridge";
import { MobileDeviceProvider } from "./mobile/Device";
import { KeyboardProvider } from "./mobile/Keyboard";
import Prototype from "./Prototype";
import { AppDialogProvider } from "./dialog/AppDialog";
import { ExploreResultPreviewPage } from "./ExploreResultPreviewPage";
import { PwaLifecycleProvider } from "./pwa-lifecycle";
import { LineLoginErrorNotice } from "./auth/LineLoginErrorNotice";
import type { LineLoginCallbackError } from "./auth/line-login-callback-error";

export default function App({ lineLoginError }: { lineLoginError?: LineLoginCallbackError } = {}) {
  const appInfo = isAppInfoPath(window.location.pathname);
  useEffect(() => appInfo ? undefined : installPermissionSettingsRefresh(), [appInfo]);
  if (appInfo) return <AppInfoPage />;
  const isExploreResultPreviewPath =
    window.location.pathname === "/explore-result-preview" ||
    window.location.pathname === "/explore-result-preview/";

  return (
    <AppDialogProvider>
      <LineLoginErrorNotice error={lineLoginError} />
      <PwaLifecycleProvider>
        <div className="app-mobile-canvas" data-testid="app-mobile-canvas">
          {isExploreResultPreviewPath ? <ExploreResultPreviewPage /> : (
            <>
              <MemberSessionBridge />
              <MobileDeviceProvider>
                <KeyboardProvider>
                  <Prototype />
                </KeyboardProvider>
              </MobileDeviceProvider>
            </>
          )}
        </div>
      </PwaLifecycleProvider>
    </AppDialogProvider>
  );
}
