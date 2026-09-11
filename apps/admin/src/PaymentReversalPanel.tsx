import { useEffect, useRef, useState } from 'react';
import { runConfirmed } from './admin-confirmation';

export type PaymentReversalStatus = 'refunded' | 'chargeback' | 'cancelled';

export type PaymentRecord = {
  id: string;
  memberId: string;
  lineDisplayName?: string | null;
  planId?: string | null;
  planName?: string | null;
  amount: number;
  paidAt?: string | null;
  status: string;
  reversedAt?: string | null;
  reversalReason?: string | null;
  reversedByName?: string | null;
};

export type PaymentReversalConfirmation = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'default' | 'danger';
};

type Props = {
  payments: PaymentRecord[] | null;
  loadError?: string;
  canEdit: boolean;
  confirm: (request: PaymentReversalConfirmation) => Promise<boolean>;
  onRecord: (id: string, status: PaymentReversalStatus, reason: string) => Promise<unknown>;
  onRefresh: () => Promise<unknown>;
};

const reasonMaxLength = 500;

const statusLabels: Record<string, string> = {
  pending: '待確認',
  confirmed: '已確認',
  rejected: '已退回',
  refunded: '已退款',
  chargeback: '已刷退',
  cancelled: '交易已取消',
};

const reversalLabels: Record<PaymentReversalStatus, { noun: string; result: string }> = {
  refunded: { noun: '退款', result: '已退款' },
  chargeback: { noun: '刷退', result: '已刷退' },
  cancelled: { noun: '交易取消', result: '交易已取消' },
};

function reasonLength(value: string) {
  return Array.from(value).length;
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const symbolicMessages: Array<[string, string]> = [
    ['PAYMENT_REVERSAL_CONFLICT', '這筆付款已記錄其他沖銷結果，無法改成不同結果'],
    ['PAYMENT_NOT_CONFIRMED', '只有已確認的付款可以記錄沖銷'],
    ['PAYMENT_NOT_FOUND', '找不到這筆付款紀錄，請重新載入後再試'],
    ['PAYMENT_REVERSAL_REASON_REQUIRED', '請填寫已完成沖銷的原因'],
    ['PAYMENT_REVERSAL_REASON_TOO_LONG', `沖銷原因不可超過 ${reasonMaxLength} 字`],
    ['INVALID_PAYMENT_REVERSAL_STATUS', '沖銷完成類型不正確，請重新選擇'],
    ['ADMIN_ACTOR_NOT_FOUND', '目前管理員帳號已不存在，請重新登入'],
    ['PAYMENT_REVERSAL_ACTOR_REQUIRED', '管理員登入資料不完整，請重新登入'],
    ['AUTHENTICATION_REQUIRED', '管理員登入已失效，請重新登入'],
  ];
  return (symbolicMessages.find(([code]) => message.includes(code))?.[1] ?? message)
    || '沖銷記錄失敗，請確認資料後重試';
}

export function PaymentReversalPanel({ payments, loadError = '', canEdit, confirm, onRecord, onRefresh }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<PaymentReversalStatus>('refunded');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [completedStatuses, setCompletedStatuses] = useState<Partial<Record<string, PaymentReversalStatus>>>({});
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const submissionLockRef = useRef(false);
  const refreshLockRef = useRef(false);
  const mountedRef = useRef(true);
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const resizeReasonField = () => {
    const textarea = reasonRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 58), 160)}px`;
  };

  const open = (id: string) => {
    if (submissionLockRef.current || !canEditRef.current) return;
    setEditingId(id);
    setStatus('refunded');
    setReason('');
    setError('');
    setNotice('');
  };

  const submit = async (payment: PaymentRecord) => {
    if (submissionLockRef.current || !canEditRef.current) return;
    const normalizedReason = reason.trim();
    const length = reasonLength(normalizedReason);
    if (!normalizedReason) {
      setError('請填寫已完成沖銷的原因');
      reasonRef.current?.focus();
      return;
    }
    if (length > reasonMaxLength) {
      setError(`沖銷原因不可超過 ${reasonMaxLength} 字，目前為 ${length} 字`);
      reasonRef.current?.focus();
      return;
    }

    submissionLockRef.current = true;
    setBusy(true);
    try {
      const label = reversalLabels[status];
      const member = payment.lineDisplayName
        ? `${payment.lineDisplayName}（${payment.memberId}）`
        : payment.memberId;
      await runConfirmed(
        () => confirm({
          title: `確認記錄已完成${label.noun}`,
          message: [
            `會員：${member}`,
            `付款：${payment.id}／NT$${Number(payment.amount).toLocaleString('en-US')}`,
            `結果：${label.result}`,
            `原因：${normalizedReason}`,
            '此操作只記錄外部已完成的款項沖銷，不會發送退款。',
            '推薦成功人數與 Matrix 資格會依剩餘有效付款重新計算；訂閱日期不會變更。',
          ].join('；'),
          confirmLabel: `記錄${label.result}`,
          tone: 'danger',
        }),
        async () => {
          if (!mountedRef.current || !canEditRef.current) return;
          try {
            setError('');
            setNotice('');
            await onRecord(payment.id, status, normalizedReason);
            if (!mountedRef.current) return;
            setCompletedStatuses((current) => ({ ...current, [payment.id]: status }));
            setEditingId(null);
            setReason('');
            try {
              await onRefresh();
              if (mountedRef.current) setNotice('沖銷已記錄，付款紀錄已更新');
            } catch {
              if (mountedRef.current) {
                setNotice('沖銷已記錄，但付款紀錄重新載入失敗；請使用頁面重新整理後確認最新狀態');
              }
            }
          } catch (cause) {
            if (mountedRef.current) setError(errorMessage(cause));
          }
        },
      );
    } finally {
      submissionLockRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  const retryRefresh = async () => {
    if (refreshLockRef.current) return;
    refreshLockRef.current = true;
    setRefreshing(true);
    try {
      await onRefresh();
    } catch {
      // The parent retains the failed-read state and message for another retry.
    } finally {
      refreshLockRef.current = false;
      if (mountedRef.current) setRefreshing(false);
    }
  };

  return (
    <details className="panel paymentReversalPanel" open={loadError ? true : undefined}>
      <summary className="paymentReversalSummary">
        <span id="payment-reversal-title">付款紀錄與沖銷</span>
        <small>{loadError ? '讀取失敗' : payments === null ? '讀取中' : `${payments.length} 筆`}</small>
      </summary>
      <div className="paymentReversalBody" aria-labelledby="payment-reversal-title">
        <p className="paymentReversalHelp">僅記錄已在外部完成的退款、刷退或交易取消；不執行款項移轉，也不變更訂閱日期。</p>
        {notice && <p className="paymentReversalNotice" role="status">{notice}</p>}
        <div className="paymentReversalList">
        {loadError ? (
          <div className="paymentReversalLoadError paymentReversalError" role="alert">
            <span>{loadError}</span>
            <button type="button" disabled={refreshing} onClick={() => void retryRefresh()}>
              {refreshing ? '重新載入中' : '重新載入付款紀錄'}
            </button>
          </div>
        ) : payments === null ? (
          <p className="paymentReversalLoading" role="status">付款紀錄載入中…</p>
        ) : payments.length === 0 ? (
          <p className="empty">目前沒有付款紀錄。</p>
        ) : null}
        {payments?.map((payment) => {
          const paymentStatus = completedStatuses[payment.id] ?? payment.status;
          const isEditing = editingId === payment.id;
          return (
            <article className="paymentReversalRow" key={payment.id}>
              <div className="paymentReversalFacts">
                <strong>{payment.lineDisplayName || payment.memberId}</strong>
                <span>{payment.planName || payment.planId || '未標示方案'} · NT${Number(payment.amount).toLocaleString('en-US')}</span>
                <span>付款 {payment.id}</span>
                {payment.paidAt && <span>付款時間 {new Date(payment.paidAt).toLocaleString('zh-TW')}</span>}
                {payment.reversalReason && (
                  <span>沖銷原因 {payment.reversalReason}{payment.reversedByName ? `／${payment.reversedByName}` : ''}</span>
                )}
              </div>
              <div className="paymentReversalActions">
                <b className="paymentReversalState" data-status={paymentStatus}>{statusLabels[paymentStatus] || paymentStatus}</b>
                {canEdit && paymentStatus === 'confirmed' && !isEditing && (
                  <button
                    type="button"
                    className="paymentReversalOpen"
                    aria-label={`記錄沖銷 ${payment.id}`}
                    disabled={busy}
                    onClick={() => open(payment.id)}
                  >
                    記錄沖銷
                  </button>
                )}
              </div>
              {isEditing && canEdit && (
                <form
                  className="paymentReversalForm"
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit(payment);
                  }}
                >
                  <label>
                    完成類型
                    <select
                      aria-label="完成類型"
                      value={status}
                      disabled={busy}
                      onChange={(event) => {
                        setStatus(event.target.value as PaymentReversalStatus);
                        setError('');
                      }}
                    >
                      <option value="refunded">已退款</option>
                      <option value="chargeback">已刷退</option>
                      <option value="cancelled">交易已取消</option>
                    </select>
                  </label>
                  <label>
                    沖銷原因
                    <textarea
                      className="resize-none"
                      style={{ resize: 'none' }}
                      ref={reasonRef}
                      aria-label="沖銷原因"
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? `payment-reversal-error-${payment.id}` : `payment-reversal-help-${payment.id}`}
                      value={reason}
                      disabled={busy}
                      onChange={(event) => {
                        setReason(event.target.value);
                        setError('');
                        resizeReasonField();
                      }}
                    />
                  </label>
                  <span id={`payment-reversal-help-${payment.id}`} className="paymentReversalCount">
                    {reasonLength(reason)}／{reasonMaxLength} 字
                  </span>
                  {error && <p id={`payment-reversal-error-${payment.id}`} className="paymentReversalError" role="alert">{error}，可保留內容後重試。</p>}
                  <div className="transferActions">
                    <button type="button" disabled={busy} onClick={() => setEditingId(null)}>取消</button>
                    <button type="submit" className="transferReject" disabled={busy} aria-busy={busy}>
                      {busy ? '記錄中' : error ? '重新記錄已完成沖銷' : '記錄已完成沖銷'}
                    </button>
                  </div>
                </form>
              )}
            </article>
          );
        })}
        </div>
      </div>
    </details>
  );
}
