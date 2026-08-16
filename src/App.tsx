import AdminApp from "./admin/AdminApp";
import { MobileDeviceProvider } from "./mobile/Device";
import { KeyboardProvider } from "./mobile/Keyboard";
import Prototype from "./Prototype";

export default function App() {
  const isAdminPath =
    window.location.pathname === "/admin" ||
    window.location.pathname.startsWith("/admin/");

  if (isAdminPath) return <AdminApp />;

  return (
    <MobileDeviceProvider>
      <KeyboardProvider>
        <Prototype />
      </KeyboardProvider>
    </MobileDeviceProvider>
  );
}
