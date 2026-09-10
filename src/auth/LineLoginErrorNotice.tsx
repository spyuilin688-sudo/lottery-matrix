import { useEffect, useRef } from 'react';
import { useAppDialog } from '../dialog/AppDialog';
import type { LineLoginCallbackError } from './line-login-callback-error';

export function LineLoginErrorNotice({ error }: { error?: LineLoginCallbackError }) {
  const { alert } = useAppDialog();
  const shown = useRef(false);

  useEffect(() => {
    if (!error || shown.current) return;
    shown.current = true;
    void alert({
      title: error === 'expired' ? '登入已逾時' : error === 'cancelled' ? '尚未完成 LINE 登入' : 'LINE 登入未完成',
      description: '請重新點選 LINE 登入。',
      tone: 'warning',
    });
  }, [alert, error]);

  return null;
}
