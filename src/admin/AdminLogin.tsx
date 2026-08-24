import { FormEvent, useRef, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const credentialsRevisionRef = useRef(0);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;

    const trimmedEmail = email.trim();
    const nextEmailError = !trimmedEmail
      ? "請輸入 Email"
      : emailPattern.test(trimmedEmail)
        ? null
        : "Email 格式不正確";
    const nextPasswordError = password ? null : "請輸入密碼";

    setFormError(null);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);

    if (nextEmailError || nextPasswordError) {
      if (nextEmailError) emailRef.current?.focus();
      else passwordRef.current?.focus();
      return;
    }

    const requestCredentialsRevision = credentialsRevisionRef.current;
    submittingRef.current = true;
    setSubmitting(true);

    try {
      const { error } = await getSupabaseClient().auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (error && credentialsRevisionRef.current === requestCredentialsRevision) {
        setFormError("登入失敗，請確認 Email 與密碼後再試");
      }
    } catch {
      if (credentialsRevisionRef.current === requestCredentialsRevision) {
        setFormError("登入失敗，請確認 Email 與密碼後再試");
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <main className="admin-app" data-testid="login">
      <form
        className="admin-login-form"
        onSubmit={handleSubmit}
        noValidate
        aria-busy={submitting}
      >
        <label htmlFor="admin-email">
          Email
          <input
            ref={emailRef}
            id="admin-email"
            type="email"
            value={email}
            onChange={(event) => {
              credentialsRevisionRef.current += 1;
              setEmail(event.target.value);
              setEmailError(null);
              setFormError(null);
            }}
            required
            autoComplete="email"
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? "admin-email-error" : undefined}
          />
        </label>
        <span
          className="admin-login-field-error"
          id="admin-email-error"
          aria-live="polite"
        >
          {emailError}
        </span>
        <label htmlFor="admin-password">
          密碼
          <input
            ref={passwordRef}
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => {
              credentialsRevisionRef.current += 1;
              setPassword(event.target.value);
              setPasswordError(null);
              setFormError(null);
            }}
            required
            autoComplete="current-password"
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? "admin-password-error" : undefined}
          />
        </label>
        <span
          className="admin-login-field-error"
          id="admin-password-error"
          aria-live="polite"
        >
          {passwordError}
        </span>
        <div
          className="admin-login-form-error"
          role="alert"
          data-error-code={formError ? "AUTH_LOGIN_FAILED" : undefined}
        >
          {formError}
        </div>
        <button className="admin-login-submit" type="submit" disabled={submitting}>
          登入
        </button>
      </form>
    </main>
  );
}
