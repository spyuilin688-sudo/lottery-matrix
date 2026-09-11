import { useEffect, useMemo, useState } from 'react';
import { formatAdminDateTime } from './admin-operations';
import {
  TEST_PUSH_BODY,
  TEST_PUSH_TITLE,
  canSendTestPush,
  createExclusiveAction,
  createLatestRequestGate,
  formatNotificationError,
  isNoActiveSubscriptionsError,
  listPushDeliveryLogs,
  listPushMembers,
  sendTestPush,
  type NotificationApiClient,
  type PushDeliveryLog,
  type PushMember,
  type TestPushResult,
} from './notification-management';

type Props = {
  client: NotificationApiClient;
  canEdit: boolean;
};

const deliveryLogPageSize = 5;

function memberName(member: PushMember) {
  return member.displayName || member.userId;
}

function MemberAvatar({ member }: { member: PushMember }) {
  const name = memberName(member);
  if (member.pictureUrl) {
    return <img className="notificationAvatar" src={member.pictureUrl} width="32" height="32" alt={`${name} 的 LINE 頭貼`} />;
  }
  return <span className="notificationAvatar notificationAvatarFallback" aria-hidden="true">{name.slice(0, 1)}</span>;
}

export function NotificationManagement({ client, canEdit }: Props) {
  const [members, setMembers] = useState<PushMember[]>([]);
  const [logs, setLogs] = useState<PushDeliveryLog[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const [membersLoading, setMembersLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [logsError, setLogsError] = useState('');
  const [sendError, setSendError] = useState('');
  const [sendResult, setSendResult] = useState<TestPushResult | null>(null);
  const [memberRequests] = useState(createLatestRequestGate);
  const [logRequests] = useState(createLatestRequestGate);
  const [sendRequests] = useState(createLatestRequestGate);
  const [exclusiveSend] = useState(createExclusiveAction);
  const [exclusiveMemberRetry] = useState(createExclusiveAction);
  const [exclusiveLogRetry] = useState(createExclusiveAction);

  const selectedMember = useMemo(
    () => members.find((member) => member.userId === selectedId) ?? null,
    [members, selectedId],
  );
  const membersById = useMemo(
    () => new Map(members.map((member) => [member.userId, member])),
    [members],
  );
  const sendAvailable = canSendTestPush(selectedMember, canEdit, sending)
    && !membersLoading
    && !membersError;

  const loadMembers = async () => {
    const request = memberRequests.begin();
    setMembersLoading(true);
    setMembersError('');
    try {
      const nextMembers = await listPushMembers(client);
      if (!memberRequests.canCommit(request)) return;
      setMembers(nextMembers);
      setSelectedId((current) => nextMembers.some((member) => member.userId === current) ? current : '');
    } catch {
      if (memberRequests.canCommit(request)) setMembersError('會員列表讀取失敗，請稍後再試');
    } finally {
      if (memberRequests.canCommit(request)) setMembersLoading(false);
    }
  };

  const loadLogs = async () => {
    const request = logRequests.begin();
    setLogsLoading(true);
    setLogsError('');
    try {
      const nextLogs = await listPushDeliveryLogs(client);
      if (logRequests.canCommit(request)) {
        setLogs(nextLogs);
        setLogPage((current) => Math.min(current, Math.max(1, Math.ceil(nextLogs.length / deliveryLogPageSize))));
      }
    } catch {
      if (logRequests.canCommit(request)) {
        setLogsError(logs.length > 0
          ? '發送紀錄更新失敗，已保留目前紀錄'
          : '發送紀錄讀取失敗，請重新讀取');
      }
    } finally {
      if (logRequests.canCommit(request)) setLogsLoading(false);
    }
  };

  useEffect(() => {
    memberRequests.mount();
    logRequests.mount();
    sendRequests.mount();
    void loadMembers();
    void loadLogs();
    return () => {
      memberRequests.dispose();
      logRequests.dispose();
      sendRequests.dispose();
    };
  }, []);

  const send = () => {
    if (!sendAvailable || !selectedMember) return;
    void exclusiveSend.run(async () => {
      const request = sendRequests.begin();
      setSending(true);
      setSendError('');
      setSendResult(null);
      try {
        const result = await sendTestPush(client, selectedMember.userId);
        if (!sendRequests.canCommit(request)) return;
        setSendResult(result);
        const memberRefresh = loadMembers();
        void loadLogs();
        await memberRefresh;
      } catch (cause) {
        if (sendRequests.canCommit(request)) {
          if (isNoActiveSubscriptionsError(cause)) {
            setMembers((current) => current.map((member) => member.userId === selectedMember.userId
              ? { ...member, pushEnabled: false }
              : member));
          }
          setSendError(formatNotificationError(cause));
        }
      } finally {
        if (sendRequests.canCommit(request)) setSending(false);
      }
    });
  };

  const unavailableReason = !canEdit
    ? '你的管理員帳號只有查看權限'
    : !selectedMember
      ? '請先選擇一名會員'
      : !selectedMember.pushEnabled
        ? '此會員目前沒有有效的推播訂閱'
        : '';
  const logTotalPages = Math.max(1, Math.ceil(logs.length / deliveryLogPageSize));
  const currentLogPage = Math.min(logPage, logTotalPages);
  const visibleLogs = logs.slice((currentLogPage - 1) * deliveryLogPageSize, currentLogPage * deliveryLogPageSize);

  return (
    <div className="notificationManagement">
      <section className="panel notificationComposer" aria-labelledby="test-push-title">
        <div className="notificationComposerHeading"><h2 id="test-push-title">單一會員測試推播</h2><span>選擇對象後，確認內容再發送</span></div>
        <div className="notificationMemberColumn">
          <label className="notificationMemberSelect">
            選擇會員
            <select
              aria-label="選擇會員"
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setSendError('');
                setSendResult(null);
              }}
              disabled={membersLoading || Boolean(membersError) || sending}
            >
              <option value="">請選擇會員</option>
              {members.map((member) => <option key={member.userId} value={member.userId}>{memberName(member)}</option>)}
            </select>
          </label>
          {membersLoading && <div className="loading" role="status">會員列表讀取中…</div>}
          {membersError && (
            <div className="error notificationRecovery" role="alert">
              <span>{membersError}</span>
              <button
                className="compactButton"
                type="button"
                onClick={() => { void exclusiveMemberRetry.run(loadMembers); }}
                disabled={membersLoading}
              >
                重新讀取會員
              </button>
            </div>
          )}
          {!membersLoading && !membersError && members.length === 0 && <div className="empty notificationEmpty">目前沒有會員資料</div>}
          {selectedMember && (
            <div className="notificationMemberSummary">
              <MemberAvatar member={selectedMember} />
              <div>
                <b>{memberName(selectedMember)}</b>
                <span className={selectedMember.pushEnabled ? 'statusBadge good' : 'statusBadge bad'}>
                  {selectedMember.pushEnabled ? '已開啟' : '未開啟'}
                </span>
                <small>{selectedMember.userId}</small>
              </div>
            </div>
          )}
        </div>

        <div className="notificationMessageColumn">
          <h3>固定通知內容</h3>
          <dl className="notificationFixedCopy">
            <div><dt>標題</dt><dd>{TEST_PUSH_TITLE}</dd></div>
            <div><dt>內容</dt><dd>{TEST_PUSH_BODY}</dd></div>
          </dl>
          <div className="notificationSendArea">
            <button
              className="primary notificationSendButton"
              type="button"
              onClick={send}
              disabled={!sendAvailable}
              aria-busy={sending}
              aria-describedby="notification-send-help"
            >
              {sending ? '發送中…' : '發送測試推播'}
            </button>
            <p id="notification-send-help">{unavailableReason || '只會發送給目前選擇的會員'}</p>
            <div className="notificationFeedback" aria-live="polite">
              {sendResult && <span className="notificationSuccess">發送完成：成功 {sendResult.sent}，失敗 {sendResult.failed}</span>}
              {sendError && <span className="notificationFailure" role="alert">{sendError}</span>}
            </div>
          </div>
        </div>
      </section>

      <section className="panel notificationLogs" aria-labelledby="delivery-log-title">
        <div className="notificationSectionHeader">
          <h2 id="delivery-log-title">發送紀錄</h2>
          <span>最新 {logs.length} 筆紀錄</span>
        </div>
        {logsError && (
          <div className="error notificationRecovery" role="alert">
            <span>{logsError}</span>
            <button
              className="compactButton"
              type="button"
              onClick={() => { void exclusiveLogRetry.run(loadLogs); }}
              disabled={logsLoading}
            >
              重新讀取紀錄
            </button>
          </div>
        )}
        {logsLoading && <div className="loading" role="status">發送紀錄讀取中…</div>}
        {!logsLoading && !logsError && logs.length === 0 && <div className="empty notificationEmpty">目前沒有發送紀錄</div>}
        {logs.length > 0 && (
          <>
            <div className="tableWrap notificationLogTable">
              <table aria-label="測試推播發送紀錄">
                <thead><tr><th>發送時間</th><th>會員</th><th>結果</th><th>失敗原因</th></tr></thead>
                <tbody>{visibleLogs.map((log) => (
                  <tr key={log.id}>
                    <td data-label="發送時間">{formatAdminDateTime(log.sentAt)}</td>
                    <td data-label="會員">{membersById.has(log.userId) ? memberName(membersById.get(log.userId)!) : log.userId}</td>
                    <td data-label="結果"><span className={log.status === 'sent' ? 'notificationLogSuccess' : 'notificationLogFailure'}>{log.status === 'sent' ? '成功' : '失敗'}</span></td>
                    <td data-label="失敗原因">{log.failureReason || '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="pagination notificationLogPagination" aria-label="發送紀錄分頁">
              <button type="button" disabled={logsLoading || currentLogPage <= 1} onClick={() => setLogPage(currentLogPage - 1)}>上一頁</button>
              <span>第 {currentLogPage}／{logTotalPages} 頁</span>
              <button type="button" disabled={logsLoading || currentLogPage >= logTotalPages} onClick={() => setLogPage(currentLogPage + 1)}>下一頁</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
