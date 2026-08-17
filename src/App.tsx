import AdminApp from "./admin/AdminApp";
import { MobileRuntime } from "./mobile/MobileRuntime";
import Prototype from "./Prototype";

export default function App() {
  const isAdminPath =
    window.location.pathname === "/admin" ||
    window.location.pathname.startsWith("/admin/");

  if (isAdminPath) return <AdminApp />;

  return (
    <MobileRuntime>
      <Prototype />
    </MobileRuntime>
  );
}
