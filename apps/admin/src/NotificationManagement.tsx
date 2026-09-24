import { useEffect, useMemo, useRef, useState } from 'react';
import { formatAdminDateTime } from './admin-operations';
import {
  TEST_PUSH_BODY,
  TEST_PUSH_TITLE,
  canSendTestPush,
  clearTestPushRequestId,
  createExclusiveAction,
  createLatestRequestGate,
  formatNotificationError,
  isDefinitiveTestPushError,
  isNoActiveSubscriptionsError,
  listPushDeliveryLogs,
  listPushMembers,
  sendTestPush,
  testPushRequestId,
  type NotificationApiClient,
  type PushDeliveryLog,
  type PushMember,
  type TestPushResult,
} from './notification-management';

type Props = {
  client: NotificationApiClient;
  canEdit: boolean;
  adminId: string;
};

const deliveryLogPageSize = 5;

function memberName(member: PushMember) {
  return member.displayName || member.identityDisplay || '—';
}

function MemberAvatar({ member }: { member: PushMember }) {
  const name = memberName(member);
  if (member.pictureUrl) {
    return <img className="notificationAvatar" src={member.pictureUrl} width="32" height="32" alt={`${name} 的會員頭貼`} />;
  }
  return <span className="notificationAvatar notificationAvatarFallback" aria-hidden="true">{name.slice(0, 1)}</span>;
}

export function NotificationManagement({ client, canEdit, adminId }: Props) {
  const [members, setMembers] = useState<PushMember[]>([]);
  const [logs, setLogs] = useState<PushDeliveryLog[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [selectedMember, setSelectedMember] = useState<PushMember | null>(null);
  const selectedId = selectedMember?.userId ?? '';
  const [memberPage, setMemberPage] = useState({ total: 0, currentPage: 1, totalPages: 1 });
  const [memberQuery, setMemberQuery] = useState({ page: 1, keyword: '' });
  const [search, setSearch] = useState('');
  const [composing, setComposing] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const [membersLoading, setMembersLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [logsError, setLogsError] = useState('');
  const [sendError, setSendError] = useState('');
  const [sendResult, setSendResult] = useState<TestPushResult | null>(null);
  const pendingSend = useRef<{ memberId: string; requestId: string } | null>(null);
  const [memberRequests] = useState(createLatestRequestGate);
  const [logRequests] = useState(createLatestRequestGate);
  const [sendRequests] = useState(createLatestRequestGate);
  const editAllowed = useRef(canEdit);
  editAllowed.current = canEdit;
  const [exclusiveSend] = useState(createExclusiveAction);
  const [exclusiveMemberRetry] = useState(createExclusiveAction);
  const [exclusiveLogRetry] = useState(createExclusiveAction);

  const membersById = useMemo(
    () => new Map([...members, ...(selectedMember ? [selectedMember] : [])].map((member) => [member.userId, member])),
    [members, selectedMember],
  );
  const sendAvailable = canSendTestPush(selectedMember, canEdit, sending)
    && !membersLoading
    && !membersError;

  const loadMembers = async () => {
    const request = memberRequests.begin();
    setMembersLoading(true);
    setMembersError('');
    try {
      const nextPage = await listPushMembers(client, memberQuery);
      // An off-page selection also needs an explicit status retry after a
      // failed post-send recheck; refreshing this page alone cannot recover it.
      let recoveredSelection: PushMember | null | undefined;
      if (membersError && selectedMember && !nextPage.items.some(member => member.userId === selectedMember.userId)) {
        const selectedPage = await listPushMembers(client, { userId: selectedMember.userId });
        recoveredSelection = selectedPage.items.find(member => member.userId === selectedMember.userId) ?? null;
      }
      if (!memberRequests.canCommit(request)) return;
      setMembers(nextPage.items);
      setMemberPage(nextPage);
      setSelectedMember(current => recoveredSelection !== undefined ? recoveredSelection : current ? nextPage.items.find(member => member.userId === current.userId) ?? current : null);
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
    setSelectedMember(null);
    void loadLogs();
    return () => {
      memberRequests.dispose();
      logRequests.dispose();
      sendRequests.dispose();
    };
  }, [client]);

  useEffect(() => {
    void loadMembers();
    return () => { memberRequests.begin(); };
  }, [client, memberQuery]);

  useEffect(() => {
    if (composing || search.trim() === memberQuery.keyword) return;
    const timer = window.setTimeout(() => setMemberQuery({ page: 1, keyword: search.trim() }), search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [search, composing, memberQuery.keyword]);

  const changeSearch = (value: string) => {
    const keyword = value.trim();
    const sameQuery = memberQuery.page === 1 && memberQuery.keyword === keyword;
    if (!sameQuery) memberRequests.begin();
    setSearch(value);
    if (!sameQuery) setMembersLoading(true);
    if ((!keyword || keyword === memberQuery.keyword) && !sameQuery) setMemberQuery({ page: 1, keyword });
  };

  const changePage = (page: number) => {
    memberRequests.begin();
    setMembersLoading(true);
    setMemberQuery(current => ({ ...current, page }));
  };

  const send = () => {
    if (!sendAvailable || !selectedMember) return;
    void exclusiveSend.run(async () => {
      const request = sendRequests.begin();
      setSending(true);
      setSendError('');
      setSendResult(null);
      try {
        const memberId = selectedMember.userId;
        const requestId = pendingSend.current?.memberId === memberId
          ? pendingSend.current.requestId
          : testPushRequestId(adminId, memberId);
        pendingSend.current = { memberId, requestId };
        const result = await sendTestPush(client, memberId, requestId);
        clearTestPushRequestId(adminId, memberId);
        pendingSend.current = null;
        if (!sendRequests.canCommit(request) || !editAllowed.current) return;
        setSendResult(result);
        void loadLogs();
        // Recheck only the actual recipient, even if another page is visible.
        try {
          const refreshed = await listPushMembers(client, { userId: selectedMember.userId });
          if (!sendRequests.canCommit(request)) return;
          const recipient = refreshed.items.find(member => member.userId === selectedMember.userId) ?? null;
          setSelectedMember(recipient);
          setMembers(current => current.map(member => member.userId === selectedMember.userId ? recipient ?? { ...member, pushEnabled: false } : member));
        } catch {
          if (sendRequests.canCommit(request)) {
            setSelectedMember(current => current ? { ...current, pushEnabled: false } : null);
            setMembersError('會員狀態更新失敗，請重新讀取會員');
          }
        }
      } catch (cause) {
        if (isDefinitiveTestPushError(cause) && pendingSend.current) {
          clearTestPushRequestId(adminId, pendingSend.current.memberId);
          pendingSend.current = null;
        }
        if (sendRequests.canCommit(request) && editAllowed.current) {
          if (isNoActiveSubscriptionsError(cause)) {
            setSelectedMember(current => current ? { ...current, pushEnabled: false } : null);
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
          <label className="notificationMemberSelect" htmlFor="notification-member-search">搜尋會員</label>
          <div className="notificationMemberSearch">
            <input id="notification-member-search" ref={searchInput} type="search" value={search} maxLength={200}
              placeholder="會員名稱或登入身分" disabled={sending}
              onChange={event => changeSearch(event.target.value)}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing && !composing) {
                  if (memberQuery.page === 1 && memberQuery.keyword === search.trim() && !membersError) return;
                  memberRequests.begin();
                  setMemberQuery({ page: 1, keyword: search.trim() });
                }
              }}
            />
            {search && <button type="button" className="compactButton" aria-label="清除會員搜尋" disabled={sending} onClick={() => { changeSearch(''); searchInput.current?.focus(); }}>清除</button>}
          </div>
          <label className="notificationMemberSelect">
            選擇會員
            <select
              aria-label="選擇會員"
              value={selectedId}
              onChange={(event) => {
                setSelectedMember(membersById.get(event.target.value) ?? null);
                setSendError('');
                setSendResult(null);
              }}
              disabled={membersLoading || Boolean(membersError) || sending}
            >
              <option value="">請選擇會員</option>
              {selectedMember && !members.some(member => member.userId === selectedId) && <option value={selectedId}>{memberName(selectedMember)}（已選擇）</option>}
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
          {!membersLoading && !membersError && members.length === 0 && <div className="empty notificationEmpty">{memberQuery.keyword ? '找不到符合條件的會員' : '目前沒有會員資料'}</div>}
          {!membersError && memberPage.total > 0 && <div className="pagination notificationMemberPagination" aria-label="會員分頁">
            <button type="button" disabled={membersLoading || sending || memberPage.currentPage <= 1} onClick={() => changePage(memberPage.currentPage - 1)}>上一頁</button>
            <span>第 {memberPage.currentPage}／{memberPage.totalPages} 頁，共 {memberPage.total} 位</span>
            <button type="button" disabled={membersLoading || sending || memberPage.currentPage >= memberPage.totalPages} onClick={() => changePage(memberPage.currentPage + 1)}>下一頁</button>
          </div>}
          {selectedMember && (
            <div className="notificationMemberSummary">
              <MemberAvatar member={selectedMember} />
              <div>
                <b>{memberName(selectedMember)}</b>
                <span className={selectedMember.pushEnabled ? 'statusBadge good' : 'statusBadge bad'}>
                  {selectedMember.pushEnabled ? '已開啟' : '未開啟'}
                </span>
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
          <span>最新 {logs.length} 筆紀錄{logs.length === 200 ? '（只顯示最近 200 筆）' : ''}</span>
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
                    <td data-label="會員">{log.displayName || (membersById.has(log.userId) ? memberName(membersById.get(log.userId)!) : '—')}</td>
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
