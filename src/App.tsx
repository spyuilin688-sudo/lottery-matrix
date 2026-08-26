import AdminApp from "./admin/AdminApp";
import { MemberSessionBridge } from "./auth/MemberSessionBridge";
import { MobileDeviceProvider } from "./mobile/Device";
import { KeyboardProvider } from "./mobile/Keyboard";
import Prototype from "./Prototype";
import { AppDialogProvider } from "./dialog/AppDialog";

export default function App() {
  const isAdminPath =
    window.location.pathname === "/admin" ||
    window.location.pathname.startsWith("/admin/");

  return (
    <AppDialogProvider>
      {isAdminPath ? <AdminApp /> : (
        <div className="app-mobile-canvas" data-testid="app-mobile-canvas">
          <MemberSessionBridge />
          <MobileDeviceProvider>
            <KeyboardProvider>
              <Prototype />
            </KeyboardProvider>
          </MobileDeviceProvider>
        </div>
      )}
    </AppDialogProvider>
  );
}
