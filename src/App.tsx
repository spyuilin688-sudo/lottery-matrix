import { MobileRuntime } from "./mobile";
import AdminApp from "./admin/AdminApp";
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
