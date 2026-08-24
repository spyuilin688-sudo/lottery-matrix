import AdminApp from "./admin/AdminApp";
import { MemberSessionBridge } from "./auth/MemberSessionBridge";
import { MobileDeviceProvider } from "./mobile/Device";
import { KeyboardProvider } from "./mobile/Keyboard";
import Prototype from "./Prototype";

export default function App() {
  const isAdminPath =
    window.location.pathname === "/admin" ||
    window.location.pathname.startsWith("/admin/");

  if (isAdminPath) return <AdminApp />;

  return (
    <div className="app-mobile-canvas" data-testid="app-mobile-canvas">
      <MemberSessionBridge />
      <MobileDeviceProvider>
        <KeyboardProvider>
          <Prototype />
        </KeyboardProvider>
      </MobileDeviceProvider>
    </div>
  );
}
