import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { BrandLogo } from '../BrandLogo';
import { getSupabaseClient } from '../lib/supabase';
import { bootstrapMember } from '../member-api';
import { signInWithLine } from './line-auth';
import './line-login.css';

type Props = {
  children: ReactNode;
};

function sessionKey(session: Session | null) {
  return session?.access_token || session?.user?.id || null;
}

export function LineAuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [memberReady, setMemberReady] = useState(false);
  const processingSessionKey = useRef<string | null>(null);
  const readySessionKey = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const client = getSupabaseClient();

    const applySession = async (nextSession: Session | null) => {
      if (!active) return;
      const key = sessionKey(nextSession);

      if (!key) {
        processingSessionKey.current = null;
        readySessionKey.current = null;
        setMemberReady(false);
        setSession(null);
        return;
      }

      setSession(nextSession);
      if (readySessionKey.current === key) {
        setMemberReady(true);
        return;
      }
      if (processingSessionKey.current === key) return;

      processingSessionKey.current = key;
      setMemberReady(false);
      try {
        await bootstrapMember();
        if (!active) return;
        readySessionKey.current = key;
        setMemberReady(true);
      } catch {
        if (!active) return;
        readySessionKey.current = null;
        setMemberReady(false);
        setSession(null);
      } finally {
        if (processingSessionKey.current === key) processingSessionKey.current = null;
      }
    };

    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setSession(null);
        setMemberReady(false);
        return;
      }
      void applySession(data.session);
    });

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (session && memberReady) return <>{children}</>;

  if (session === undefined || (session && !memberReady)) {
    return <main className="line-login-screen line-login-screen--loading" aria-hidden="true" />;
  }

  return (
    <main className="line-login-screen">
      <div className="line-login-light-lines" aria-hidden="true" />
      <div className="line-login-perspective" aria-hidden="true" />
      <section className="line-login-panel" aria-label="樂彩 Matrix">
        <BrandLogo className="line-login-brand-logo" />
        <p className="line-login-tagline">SMART MATRIX · ENJOY LOTTERY</p>
        <button
          type="button"
          className="line-login-button"
          onClick={() => void signInWithLine(window.location.origin)}
        >
          <span className="line-login-mark" aria-hidden="true">LINE</span>
          <span>使用 LINE 登入</span>
        </button>
        <div className="line-login-consent">
          <p>登入即表示同意</p>
          <div className="line-login-legal">
            <span>服務條款</span>
            <span>隱私權政策</span>
          </div>
        </div>
      </section>
    </main>
  );
}
