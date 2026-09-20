import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { getPasswordRecoveryClient } from '../lib/supabase';

type RecoveryState = 'checking' | 'ready' | 'invalid' | 'success';
type FieldError = { field: 'password' | 'confirmation'; message: string };
const invalidLinkMessage = '重設連結已失效，請重新取得重設信。';

function passwordError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'weak_password') return '密碼太容易被猜到，請換一組較長、不常見的密碼。';
  if (code === 'same_password') return '新密碼不能與舊密碼相同，請換一組。';
  return '無法確認密碼是否更新，請稍後再試。';
}

/** Standalone email recovery: mounted before member onboarding or LINE handoff. */
export function PasswordRecovery() {
  const [state, setState] = useState<RecoveryState>('checking');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<FieldError | null>(null);
  const [pending, setPending] = useState(false);
  const accountId = useRef<string | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  const confirmationInput = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    let active = true;
    mounted.current = true;
    void (async () => {
      try {
        // This client has no persisted session, so a previous LINE/member login
        // cannot make an invalid or already-consumed recovery link look valid.
        const auth = getPasswordRecoveryClient().auth;
        const { data: sessionData, error: sessionError } = await auth.getSession();
        if (sessionError || !sessionData.session) throw new Error('RECOVERY_INVALID');
        const { data, error: userError } = await auth.getUser();
        if (userError || !data.user || data.user.id !== sessionData.session.user.id) {
          throw new Error('RECOVERY_INVALID');
        }
        if (active) {
          accountId.current = data.user.id;
          setState('ready');
        }
      } catch {
        if (active) setState('invalid');
      }
    })();
    return () => { active = false; mounted.current = false; };
  }, []);

  useEffect(() => {
    if (state === 'ready') passwordInput.current?.focus();
  }, [state]);

  const showError = (field: FieldError['field'], message: string) => {
    setError({ field, message });
    (field === 'password' ? passwordInput : confirmationInput).current?.focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (state !== 'ready' || submitting.current) return;
    if (!password) return showError('password', '請輸入新密碼。');
    if (password.length < 6) return showError('password', '新密碼至少需要 6 個字元。');
    if (password !== confirmation) return showError('confirmation', '兩次輸入的密碼不一致。');
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const auth = getPasswordRecoveryClient().auth;
      const verified = await auth.getUser();
      if (verified.error || !verified.data.user || verified.data.user.id !== accountId.current) {
        if (mounted.current) {
          setPassword('');
          setConfirmation('');
          setState('invalid');
        }
        return;
      }
      const { data, error: updateError } = await auth.updateUser({ password });
      if (updateError) throw updateError;
      if (!data.user || data.user.id !== accountId.current) throw new Error('RECOVERY_UPDATE_UNCONFIRMED');
      if (mounted.current) {
        setPassword('');
        setConfirmation('');
        setState('success');
      }
    } catch (cause) {
      if (mounted.current) showError('password', passwordError(cause));
    } finally {
      submitting.current = false;
      if (mounted.current) setPending(false);
    }
  };

  return <Dialog.Root open>
    <Dialog.Portal>
      <Dialog.Overlay className="app-dialog-overlay" />
      <Dialog.Content className="app-dialog-content" data-variant="password-recovery"
        onEscapeKeyDown={event => event.preventDefault()}
        onPointerDownOutside={event => event.preventDefault()}>
        <Dialog.Title className="app-dialog-title">設定新密碼</Dialog.Title>
        <Dialog.Description className="app-dialog-description">
          {state === 'ready' ? '請設定至少 6 個字元的新密碼。' : '樂彩 Matrix 帳號密碼重設'}
        </Dialog.Description>
        {state === 'checking' && <p className="app-dialog-description" role="status">正在驗證重設連結…</p>}
        {state === 'invalid' && <p className="app-dialog-description" role="alert">{invalidLinkMessage}</p>}
        {state === 'success' && <p className="app-dialog-description" role="status">密碼已更新。請使用新密碼登入。</p>}
        {state === 'ready' && <form className="app-dialog-form" noValidate onSubmit={submit} aria-busy={pending}>
          <label htmlFor={`${id}-password`}>新密碼</label>
          <input ref={passwordInput} id={`${id}-password`} type="password" autoComplete="new-password"
            value={password} readOnly={pending} aria-invalid={error?.field === 'password'}
            aria-describedby={error?.field === 'password' ? `${id}-error` : undefined}
            onChange={event => { setPassword(event.target.value); setError(null); }} />
          <label htmlFor={`${id}-confirmation`}>再次輸入新密碼</label>
          <input ref={confirmationInput} id={`${id}-confirmation`} type="password" autoComplete="new-password"
            value={confirmation} readOnly={pending} aria-invalid={error?.field === 'confirmation'}
            aria-describedby={error?.field === 'confirmation' ? `${id}-error` : undefined}
            onChange={event => { setConfirmation(event.target.value); if (error?.field === 'confirmation') setError(null); }} />
          {error && <p id={`${id}-error`} className="app-dialog-description" role="alert">{error.message}</p>}
          <div className="app-dialog-actions" data-single="true">
            <button className="app-dialog-button app-dialog-button--primary" type="submit" disabled={pending}>
              {pending ? '更新中…' : '更新密碼'}
            </button>
          </div>
        </form>}
        {(state === 'invalid' || state === 'success') && <div className="app-dialog-actions" data-single="true">
          <a className="app-dialog-button app-dialog-button--primary" href="/">返回樂彩</a>
        </div>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
