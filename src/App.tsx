import AdminApp from "./admin/AdminApp";
import { LineAuthGate } from "./auth/LineAuthGate";
import { MobileDeviceProvider } from "./mobile/Device";
import { KeyboardProvider } from "./mobile/Keyboard";
import Prototype from "./Prototype";

export default function App() {
  const isAdminPath =
    window.location.pathname === "/admin" ||
    window.location.pathname.startsWith("/admin/");

  if (isAdminPath) return <AdminApp />;

  return (
    <LineAuthGate>
      <MobileDeviceProvider>
        <KeyboardProvider>
          <Prototype />
        </KeyboardProvider>
      </MobileDeviceProvider>
    </LineAuthGate>
  );
}
