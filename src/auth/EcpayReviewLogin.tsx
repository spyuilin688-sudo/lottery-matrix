import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { signInForEcpayReview } from './ecpay-review-auth';

export function EcpayReviewLogin({ disabled = false }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [committing, setCommitting] = useState(false);
  const committingRef = useRef(false);
  const request = useRef<AbortController | null>(null);
  const accountInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => () => { request.current?.abort(); }, []);

  const changeOpen = (next: boolean) => {
    if (committingRef.current) return;
    request.current?.abort();
    request.current = null;
    setPending(false);
    setError('');
    setPassword('');
    setOpen(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (request.current) return;
    if (!email.trim() || !password) {
      setError('請輸入帳號與密碼');
      (!email.trim() ? accountInput : passwordInput).current?.focus();
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    try {
      await signInForEcpayReview(email, password, controller.signal, () => {
        committingRef.current = true;
        setCommitting(true);
      });
      committingRef.current = false;
      setCommitting(false);
      if (!controller.signal.aborted) changeOpen(false);
    } catch {
      if (!controller.signal.aborted) {
        setError('登入失敗，請確認審核帳號與密碼，或稍後再試。');
        setPassword('');
        passwordInput.current?.focus();
      }
    } finally {
      committingRef.current = false;
      setCommitting(false);
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  };

  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild>
      <button type="button" className="profile-logout" data-login-provider="ecpay" aria-label="綠界審核登入" disabled={disabled}><span>綠界</span></button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="app-dialog-overlay" />
      <Dialog.Content className="app-dialog-content" data-variant="ecpay-review">
        <Dialog.Title className="app-dialog-title">綠界審核登入</Dialog.Title>
        <Dialog.Description className="app-dialog-description">請輸入審核專用帳號與密碼</Dialog.Description>
        <form className="app-dialog-form" noValidate onSubmit={(event) => void submit(event)} aria-busy={pending}>
          <label htmlFor={`${id}-account`}>帳號</label>
          <input id={`${id}-account`} ref={accountInput} type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} readOnly={pending} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
          <label htmlFor={`${id}-password`}>密碼</label>
          <input id={`${id}-password`} ref={passwordInput} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} readOnly={pending} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
          {error && <p id={`${id}-error`} className="app-dialog-description" role="alert">{error}</p>}
          <div className="app-dialog-actions">
            <Dialog.Close asChild><button type="button" className="app-dialog-button app-dialog-button--secondary" disabled={committing}>取消</button></Dialog.Close>
            <button type="submit" className="app-dialog-button app-dialog-button--primary" disabled={pending}>{pending ? '登入中…' : '登入'}</button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
