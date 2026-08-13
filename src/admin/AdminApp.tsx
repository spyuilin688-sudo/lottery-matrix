import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient, hasSupabaseConfig } from "../lib/supabase";
import AdminLayout from "./AdminLayout";
import AdminLogin from "./AdminLogin";

type AdminAppState = "loading" | "login" | "forbidden" | "admin";

export default function AdminApp() {
  const [state, setState] = useState<AdminAppState>("loading");

  useEffect(() => {
    if (!hasSupabaseConfig()) return;

    const client = getSupabaseClient();
    let active = true;
    let revision = 0;

    const authorize = async (session: Session | null, sessionRevision: number) => {
      if (!active || sessionRevision !== revision) return;

      if (!session) {
        setState("login");
        return;
      }

      setState("loading");
      const { data: isAdmin, error } = await client.rpc("is_admin");

      if (!active || sessionRevision !== revision) return;

      if (!error && isAdmin === true) {
        setState("admin");
        return;
      }

      setState("forbidden");
      await client.auth.signOut();

      if (!active || sessionRevision !== revision) return;
      setState("login");
    };

    const handleSession = (session: Session | null) => {
      const sessionRevision = ++revision;
      void authorize(session, sessionRevision);
    };

    const initialSessionRevision = ++revision;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });

    void client.auth.getSession().then(({ data }) => {
      if (!active || initialSessionRevision !== revision) return;
      void authorize(data.session, initialSessionRevision);
    });

    return () => {
      active = false;
      ++revision;
      subscription.unsubscribe();
    };
  }, []);

  if (!hasSupabaseConfig()) {
    return <main className="admin-app" data-testid="config-missing" data-error-code="SUPABASE_CONFIG_MISSING" />;
  }

  if (state === "login") return <AdminLogin />;

  if (state === "forbidden") {
    return <main className="admin-app" data-testid="forbidden" data-error-code="ADMIN_ACCESS_FORBIDDEN" />;
  }

  if (state === "admin") {
    return <AdminLayout />;
  }

  return <main className="admin-app" data-testid="authorizing" />;
}
