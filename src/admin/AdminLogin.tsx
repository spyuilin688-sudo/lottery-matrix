import { FormEvent, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setErrorCode(null);

    try {
      const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
      if (error) setErrorCode("AUTH_LOGIN_FAILED");
    } catch {
      setErrorCode("AUTH_LOGIN_FAILED");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="admin-app" data-testid="login">
      <form className="admin-login-form" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          密碼
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <div role="alert" data-error-code={errorCode ?? undefined} />
        <button className="admin-login-submit" type="submit" disabled={submitting}>
          登入
        </button>
      </form>
    </main>
  );
}
