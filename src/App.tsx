import AdminApp from "./admin/AdminApp";
import { MemberSessionBridge } from "./auth/MemberSessionBridge";
import { MobileDeviceProvider } from "./mobile/Device";
import { KeyboardProvider } from "./mobile/Keyboard";
import Prototype from "./Prototype";
import { AppDialogProvider } from "./dialog/AppDialog";
import { ExploreResultPreviewPage } from "./ExploreResultPreviewPage";

export default function App() {
  const isAdminPath =
    window.location.pathname === "/admin" ||
    window.location.pathname.startsWith("/admin/");
  const isExploreResultPreviewPath =
    window.location.pathname === "/explore-result-preview" ||
    window.location.pathname === "/explore-result-preview/";

  return (
    <AppDialogProvider>
      {isAdminPath ? <AdminApp /> : (
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
      )}
    </AppDialogProvider>
  );
}
