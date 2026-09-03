from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    return updated


# #4 Notification settings: keep the existing initial-loading edit merge, but fail closed after GET failure.
path = "src/NotificationsPagePatched.tsx"
text = read(path)
text = replace_once(
    text,
    '  const notificationSettingsLoadState = useRef<"loading" | "ready" | "failed">("loading");\n',
    '  const notificationSettingsLoadState = useRef<"loading" | "ready" | "failed">("loading");\n'
    '  const [notificationSettingsLoadUiState, setNotificationSettingsLoadUiState] = useState<"loading" | "ready" | "failed">("loading");\n'
    '  const [notificationSettingsControlsBlocked, setNotificationSettingsControlsBlocked] = useState(false);\n'
    '  const [notificationSettingsReloadRevision, setNotificationSettingsReloadRevision] = useState(0);\n',
    "notification load UI state",
)
text = replace_once(
    text,
    '    componentActive.current = true;\n    void fetchNotificationSettings().then((stored) => {\n',
    '    componentActive.current = true;\n'
    '    if (notificationSettingsReloadRevision > 0) {\n'
    '      notificationSettingsLoadState.current = "loading";\n'
    '      setNotificationSettingsLoadUiState("loading");\n'
    '    }\n'
    '    void fetchNotificationSettings().then((stored) => {\n',
    "notification retry loading state",
)
text = replace_once(
    text,
    '      setNotificationSettings(merged);\n      notificationSettingsLoadState.current = "ready";\n',
    '      setNotificationSettings(merged);\n'
    '      notificationSettingsLoadState.current = "ready";\n'
    '      setNotificationSettingsLoadUiState("ready");\n'
    '      setNotificationSettingsControlsBlocked(false);\n',
    "notification success state",
)
text = replace_once(
    text,
    '      pendingLoadEdits.current = [];\n      notificationSettingsLoadState.current = "failed";\n',
    '      pendingLoadEdits.current = [];\n'
    '      notificationSettingsLoadState.current = "failed";\n'
    '      setNotificationSettingsLoadUiState("failed");\n'
    '      setNotificationSettingsControlsBlocked(true);\n',
    "notification failure state",
)
text = replace_once(text, '  }, []);\n\n  useEffect(() => {\n    let active = true;\n    const requestRevision = pushOperationRevision.current;\n', '  }, [notificationSettingsReloadRevision]);\n\n  useEffect(() => {\n    let active = true;\n    const requestRevision = pushOperationRevision.current;\n', "notification reload dependency")
text = replace_once(
    text,
    '  const applyNotificationSettingsEdit = (edit: NotificationSettingsEdit) => {\n    if (notificationSettingsLoadState.current === "loading") pendingLoadEdits.current.push(edit);\n    setNotificationSettings(edit);\n  };\n',
    '  const applyNotificationSettingsEdit = (edit: NotificationSettingsEdit) => {\n'
    '    if (notificationSettingsLoadState.current === "failed" || notificationSettingsControlsBlocked) return;\n'
    '    if (notificationSettingsLoadState.current === "loading") pendingLoadEdits.current.push(edit);\n'
    '    setNotificationSettings(edit);\n'
    '  };\n',
    "notification failed edit guard",
)
text = replace_once(
    text,
    '<select aria-label={`${lottery}時間${index + 1}`} value={betTimes[lottery][index]} onChange=',
    '<select aria-label={`${lottery}時間${index + 1}`} value={betTimes[lottery][index]} disabled={notificationSettingsControlsBlocked} onChange=',
    "notification bet setting disable",
)
text = replace_once(
    text,
    '<input type="checkbox" checked={statusOptions[lottery].includes(status)} onChange=',
    '<input type="checkbox" checked={statusOptions[lottery].includes(status)} disabled={notificationSettingsControlsBlocked} onChange=',
    "notification status setting disable",
)
text = replace_once(
    text,
    'name={key === "win" ? "win-notification" : undefined} checked={selectedOptions[key]?.includes(option)} onChange=',
    'name={key === "win" ? "win-notification" : undefined} checked={selectedOptions[key]?.includes(option)} disabled={notificationSettingsControlsBlocked} onChange=',
    "notification generic setting disable",
)
text = replace_once(
    text,
    '    const disabled = !settings[key] || key === "collision";\n    const expanded = expandedKey === key && !disabled;\n    const settingsPanelId = `notification-settings-${key}`;\n    const isSystemRow = key === "system";\n',
    '    const isSystemRow = key === "system";\n'
    '    const disabled = !settings[key] || key === "collision" || (!isSystemRow && notificationSettingsControlsBlocked);\n'
    '    const expanded = expandedKey === key && !disabled;\n'
    '    const settingsPanelId = `notification-settings-${key}`;\n',
    "notification row disable",
)
text = replace_once(
    text,
    'disabled={isSystemRow ? pushBusy || pushToggleUnavailable : key === "collision"}',
    'disabled={isSystemRow ? pushBusy || pushToggleUnavailable : key === "collision" || notificationSettingsControlsBlocked}',
    "notification ordinary toggle disable",
)
text = replace_once(
    text,
    '        <div className="notification-content">\n          <div className="notification-bulk-actions" role="group" aria-label="批次通知設定">\n            <button type="button" className="notification-bulk-enable primary-action branded-explore-action" onClick={() => setAvailableNotifications(true)}><span>全部開啟</span></button>\n            <button type="button" className="notification-bulk-disable branded-explore-action" onClick={() => setAvailableNotifications(false)}><span>全部關閉</span></button>\n',
    '        <div className="notification-content">\n'
    '          {notificationSettingsLoadUiState === "failed" ? <div className="notification-settings-load-error panel" role="alert"><span>通知設定載入失敗</span><button type="button" className="title-card-compact-action" aria-label="重新載入通知設定" onClick={() => { notificationSettingsLoadState.current = "loading"; setNotificationSettingsControlsBlocked(true); setNotificationSettingsLoadUiState("loading"); setNotificationSettingsReloadRevision((current) => current + 1); }}>重新載入</button></div> : null}\n'
    '          <div className="notification-bulk-actions" role="group" aria-label="批次通知設定">\n'
    '            <button type="button" className="notification-bulk-enable primary-action branded-explore-action" disabled={notificationSettingsControlsBlocked} onClick={() => setAvailableNotifications(true)}><span>全部開啟</span></button>\n'
    '            <button type="button" className="notification-bulk-disable branded-explore-action" disabled={notificationSettingsControlsBlocked} onClick={() => setAvailableNotifications(false)}><span>全部關閉</span></button>\n',
    "notification error UI",
)
write(path, text)


# #5 History: distinguish loading/success/empty/error and provide a fresh retry.
path = "src/FeaturePagesCore.tsx"
text = read(path)
old_hook = '''function useLotteryHistory(lottery: LotteryId, limit?: number) {
  const [data, setData] = useState<LotteryDrawRecord[]>([]);
  const requestLimit = typeof limit === "number" ? Math.max(limit * 3, limit <= 10 ? 50 : 30) : undefined;
  useEffect(() => {
    let active = true;
    setData([]);
    const refresh = () => {
      fetchLotteryHistory(lottery, requestLimit).then((records) => {
        if (!active) return;
        const seen = new Set<string>();
        const uniqueRecords = records.filter((record) => {
          const key = getHistoryRecordKey(record);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setData(typeof limit === "number" ? uniqueRecords.slice(0, limit) : uniqueRecords);
      }).catch(() => { if (active) setData([]); });
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [lottery, limit, requestLimit]);
  return data;
}
'''
new_hook = '''type DataLoadState = "loading" | "success" | "empty" | "error";

function useLotteryHistory(lottery: LotteryId, limit?: number) {
  const [data, setData] = useState<LotteryDrawRecord[]>([]);
  const [loadState, setLoadState] = useState<DataLoadState>("loading");
  const [reloadRevision, setReloadRevision] = useState(0);
  const requestLimit = typeof limit === "number" ? Math.max(limit * 3, limit <= 10 ? 50 : 30) : undefined;
  useEffect(() => {
    let active = true;
    setData([]);
    setLoadState("loading");
    const refresh = () => {
      fetchLotteryHistory(lottery, requestLimit).then((records) => {
        if (!active) return;
        const seen = new Set<string>();
        const uniqueRecords = records.filter((record) => {
          const key = getHistoryRecordKey(record);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const nextData = typeof limit === "number" ? uniqueRecords.slice(0, limit) : uniqueRecords;
        setData(nextData);
        setLoadState(nextData.length > 0 ? "success" : "empty");
      }).catch(() => { if (active) setLoadState("error"); });
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [lottery, limit, requestLimit, reloadRevision]);
  return { data, loadState, reload: () => setReloadRevision((current) => current + 1) };
}
'''
text = replace_once(text, old_hook, new_hook, "history load-state hook")
text = replace_once(
    text,
    '  const selectedLotteryLatest = useLotteryHistory(lottery, 1);\n  const history = useLotteryHistory(appliedHistorySettings.lottery, getHistoryLimit(appliedHistorySettings.range));\n',
    '  const { data: selectedLotteryLatest } = useLotteryHistory(lottery, 1);\n'
    '  const { data: history, loadState: historyLoadState, reload: reloadHistory } = useLotteryHistory(appliedHistorySettings.lottery, getHistoryLimit(appliedHistorySettings.range));\n',
    "history hook consumers",
)
text = replace_once(
    text,
    '      <div className="matrix-explore-main-screen draw-history-history-scope">\n        <div className="draw-history-week-list" data-lottery={appliedHistorySettings.lottery} aria-label={`${appliedHistorySettings.lottery}歷史開獎號碼`}>\n',
    '      <div className="matrix-explore-main-screen draw-history-history-scope">\n'
    '        {historyLoadState === "error" ? <div className="panel" role="alert"><span>歷史開獎號碼載入失敗</span><button type="button" aria-label="重新載入歷史開獎號碼" onClick={reloadHistory}>重新載入</button></div> : null}\n'
    '        {historyLoadState === "loading" ? <p role="status">歷史開獎號碼載入中</p> : null}\n'
    '        {historyLoadState === "empty" ? <p>目前沒有歷史開獎號碼。</p> : null}\n'
    '        <div className="draw-history-week-list" data-lottery={appliedHistorySettings.lottery} aria-label={`${appliedHistorySettings.lottery}歷史開獎號碼`} hidden={historyLoadState !== "success"}>\n',
    "history state rendering",
)
text = replace_once(
    text,
    '  const [resultGroups, setResultGroups] = useState<TongXingPair[]>([]);\n',
    '  const [resultGroups, setResultGroups] = useState<TongXingPair[]>([]);\n'
    '  const [resultLoadState, setResultLoadState] = useState<"idle" | "loading" | "success" | "empty" | "error">("idle");\n',
    "tongxing load state",
)
text = replace_once(
    text,
    '    setResultGroups([]);\n    try {\n      const response = await fetchTongXing({ lottery, numberOrder: order as MatrixNumberOrder, numbers: normalizedValues, futureOffset: periodOffset });\n      setResultGroups(response.groups);\n    } catch { setResultGroups([]); }\n    setSearched(true);\n',
    '    setResultGroups([]);\n'
    '    setResultLoadState("loading");\n'
    '    try {\n'
    '      const response = await fetchTongXing({ lottery, numberOrder: order as MatrixNumberOrder, numbers: normalizedValues, futureOffset: periodOffset });\n'
    '      setResultGroups(response.groups);\n'
    '      setResultLoadState(response.groups.length > 0 ? "success" : "empty");\n'
    '    } catch {\n'
    '      setResultGroups([]);\n'
    '      setResultLoadState("error");\n'
    '    }\n'
    '    setSearched(true);\n',
    "tongxing request state",
)
text = replace_once(
    text,
    '      {searched ? <><div className="ornament-title"><span />探索結果<span /></div><section ref={resultsEndRef} className="panel tongxing-results"><div className="tongxing-table" data-columns={resultColumns.length} aria-label={`${appliedLottery}同星探索結果`}><div className="tongxing-table-row tongxing-table-head"><span>期數</span>{resultColumns.map((column) => <span key={column}>{column}</span>)}</div>{resultGroups.map(({ lockedEntry, predictedEntry }) => <article className="tongxing-result-group" key={getDrawIssue(lockedEntry)}>{renderResultRow(lockedEntry, "locked")}{renderResultRow(predictedEntry, "predicted")}</article>)}</div></section></> : null}\n',
    '      {searched ? <><div className="ornament-title"><span />探索結果<span /></div>{resultLoadState === "error" ? <section ref={resultsEndRef} className="panel tongxing-results" role="alert"><span>Matrix 同星資料載入失敗</span><button type="button" aria-label="重新載入 Matrix 同星資料" onClick={() => void handleSearch()}>重新載入</button></section> : <section ref={resultsEndRef} className="panel tongxing-results">{resultLoadState === "loading" ? <p role="status">Matrix 同星資料載入中</p> : resultLoadState === "empty" ? <p>目前沒有符合條件的同星結果。</p> : <div className="tongxing-table" data-columns={resultColumns.length} aria-label={`${appliedLottery}同星探索結果`}><div className="tongxing-table-row tongxing-table-head"><span>期數</span>{resultColumns.map((column) => <span key={column}>{column}</span>)}</div>{resultGroups.map(({ lockedEntry, predictedEntry }) => <article className="tongxing-result-group" key={getDrawIssue(lockedEntry)}>{renderResultRow(lockedEntry, "locked")}{renderResultRow(predictedEntry, "predicted")}</article>)}</div>}</section>}</> : null}\n',
    "tongxing state rendering",
)
write(path, text)


# #5 Number reference and payment history; #6 invite referral; #11 dead MatrixCorePage.
path = "src/FeaturePages.tsx"
text = read(path)
text = replace_once(
    text,
    '  const [referenceItems, setReferenceItems] = useState<NumberReferenceItem[] | null>(null);\n',
    '  const [referenceItems, setReferenceItems] = useState<NumberReferenceItem[] | null>(null);\n'
    '  const [referenceLoadState, setReferenceLoadState] = useState<"idle" | "loading" | "success" | "empty" | "error">("idle");\n',
    "reference load state",
)
text = replace_once(
    text,
    '    try {\n      const response = await fetchNumberReference({\n        lottery,\n        numberOrder: order as MatrixNumberOrder,\n        historyRange,\n        numbers: unique,\n      });\n      setReferenceItems(response.items);\n    } catch {\n      setReferenceItems([]);\n    }\n',
    '    setReferenceLoadState("loading");\n'
    '    try {\n'
    '      const response = await fetchNumberReference({\n'
    '        lottery,\n'
    '        numberOrder: order as MatrixNumberOrder,\n'
    '        historyRange,\n'
    '        numbers: unique,\n'
    '      });\n'
    '      setReferenceItems(response.items);\n'
    '      setReferenceLoadState(response.items.length > 0 ? "success" : "empty");\n'
    '    } catch {\n'
    '      setReferenceItems([]);\n'
    '      setReferenceLoadState("error");\n'
    '    }\n',
    "reference request state",
)
text = replace_once(
    text,
    '      <section className="panel reference-table-panel">\n        <header><h2>{appliedLottery}（{appliedOrder}）</h2></header>\n',
    '      {referenceLoadState === "error" ? <div className="panel" role="alert"><span>號碼對照資料載入失敗</span><button type="button" aria-label="重新載入號碼對照資料" onClick={() => void startReferenceSearch()}>重新載入</button></div> : null}\n'
    '      {referenceLoadState === "loading" ? <p role="status">號碼對照資料載入中</p> : null}\n'
    '      <section className="panel reference-table-panel" hidden={referenceLoadState === "error" || referenceLoadState === "loading"}>\n'
    '        <header><h2>{appliedLottery}（{appliedOrder}）</h2></header>\n',
    "reference state rendering",
)
old_payment = '''export function PaymentHistoryPage({ onNavigate }: { onNavigate: Navigate }) {
  const [history, setHistory] = useState<MemberPaymentHistoryItem[] | null>(null);
  useEffect(() => {
    void fetchMemberPaymentHistory().then(setHistory).catch(() => setHistory([]));
  }, []);
  return (
    <ProfileDetailShell title="付款紀錄" onNavigate={onNavigate} className="payment-history-screen">
      <DetailCard title="付款紀錄">
        {history === null ? <p role="status">付款紀錄載入中</p> : history.length === 0 ? <p>目前沒有付款紀錄。</p> : (
'''
new_payment = '''export function PaymentHistoryPage({ onNavigate }: { onNavigate: Navigate }) {
  const [history, setHistory] = useState<MemberPaymentHistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const loadPaymentHistory = () => {
    setHistory(null);
    setHistoryError(false);
    void fetchMemberPaymentHistory().then(setHistory).catch(() => setHistoryError(true));
  };
  useEffect(() => {
    loadPaymentHistory();
  }, []);
  return (
    <ProfileDetailShell title="付款紀錄" onNavigate={onNavigate} className="payment-history-screen">
      <DetailCard title="付款紀錄">
        {historyError ? <div role="alert"><span>付款紀錄載入失敗</span><button type="button" aria-label="重新載入付款紀錄" onClick={loadPaymentHistory}>重新載入</button></div> : history === null ? <p role="status">付款紀錄載入中</p> : history.length === 0 ? <p>目前沒有付款紀錄。</p> : (
'''
text = replace_once(text, old_payment, new_payment, "payment history states")
old_invite = '''function InviteFriendsPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="邀請好友" onNavigate={onNavigate}><DetailCard title="邀請好友"><p>推薦碼/邀請碼尚未提供。</p></DetailCard></ProfileDetailShell>;
}
'''
new_invite = '''function InviteFriendsPage({ onNavigate }: { onNavigate: Navigate }) {
  const [summary, setSummary] = useState<MemberReferralSummary | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const requestRevision = useRef(0);
  const loadReferralSummary = async () => {
    const revision = requestRevision.current + 1;
    requestRevision.current = revision;
    setLoadState("loading");
    try {
      const nextSummary = await fetchMemberReferralSummary();
      if (revision !== requestRevision.current) return;
      setSummary(nextSummary);
      setLoadState("ready");
    } catch {
      if (revision !== requestRevision.current) return;
      setSummary(null);
      setLoadState("error");
    }
  };
  useEffect(() => {
    void loadReferralSummary();
    return () => { requestRevision.current += 1; };
  }, []);
  const copyReferralCode = async () => {
    if (!summary?.referralCode) return;
    await navigator.clipboard?.writeText(summary.referralCode);
  };
  return <ProfileDetailShell title="邀請好友" onNavigate={onNavigate}><DetailCard title="邀請好友">{loadState === "loading" ? <p role="status">推薦資料載入中</p> : loadState === "error" ? <div role="alert"><span>推薦資料載入失敗</span><button type="button" aria-label="重新載入推薦資料" onClick={() => void loadReferralSummary()}>重新載入</button></div> : summary ? <div className="referral-share-card"><strong>{summary.referralCode}</strong><p>{`推薦成功 ${summary.referralSuccessCount} 人`}</p><button type="button" aria-label="複製推薦碼" onClick={() => void copyReferralCode()}>複製推薦碼</button></div> : null}</DetailCard></ProfileDetailShell>;
}
'''
text = replace_once(text, old_invite, new_invite, "invite referral summary")
text = regex_once(
    text,
    r'export function MatrixCorePage\([\s\S]*?(?=export function MatrixExplorePage)',
    '',
    "dead MatrixCorePage",
)
write(path, text)


# #8 The UX contract follows the already implemented referral mutation.
path = "UX-CONTRACT.md"
text = read(path)
lines = text.splitlines()
matched = 0
for index, line in enumerate(lines):
    if line.startswith("| Submit referral code |"):
        lines[index] = '| Submit referral code | `確認` next to referral code → `member_referral_submit` | Button is disabled while pending; duplicate submit is blocked | Stay on the current referral view | Inline status `推薦碼已儲存` after the server accepts the code | Inline API error remains visible; the user may edit and retry when allowed by `canSubmitReferralCode` | Focus remains on the referral form and its status/error feedback | Current member referral API and `member_referral_submit` |'
        matched += 1
if matched != 1:
    raise SystemExit(f"UX referral row: expected exactly one match, got {matched}")
write(path, "\n".join(lines) + "\n")


# Move the static contract into the Node-test directory so it is actually executed without polluting TS build types.
old_contract_test = Path("src/__tests__/AuditRemediationContracts.test.mjs")
if old_contract_test.exists():
    old_contract_test.unlink()
Path("tests/audit-remediation-contract.test.mjs").write_text(
    '''import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nimport test from "node:test";\n\nconst read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");\n\ntest("推薦碼 UX contract 反映現行 member_referral_submit", () => {\n  const contract = read("UX-CONTRACT.md");\n  const referralRow = contract.split("\\n").find((line) => line.includes("| Submit referral code |")) ?? "";\n  assert.match(referralRow, /member_referral_submit/);\n  assert.match(referralRow, /推薦碼已儲存/);\n  assert.doesNotMatch(referralRow, /Disabled because no mutation API is specified/);\n  assert.doesNotMatch(referralRow, /No success is claimed/);\n});\n\ntest("matrix-core 保留相容路由但不保留不可達 MatrixCorePage", () => {\n  const featurePages = read("src/FeaturePages.tsx");\n  const prototype = read("src/Prototype.tsx");\n  assert.doesNotMatch(featurePages, /(?:export\\s+)?function\\s+MatrixCorePage\\s*\\(/);\n  assert.match(featurePages, /if \\(screen === "matrix-core"\\) return <MatrixExplorePage onNavigate=\\{onNavigate\\} \\/>;/);\n  assert.match(prototype, /<MatrixCoreBanner onOpen=\\{\\(\\) => navigate\\("explore"\\)\\} \\/>/);\n});\n''',
    encoding="utf-8",
)


# jsdom has no scrollIntoView implementation; this is test-environment support, not a product change.
path = "src/__tests__/DataPageFailureStates.test.tsx"
text = read(path)
text = replace_once(
    text,
    '  window.requestAnimationFrame = (callback: FrameRequestCallback) => {\n    callback(0);\n    return 1;\n  };\n',
    '  window.requestAnimationFrame = (callback: FrameRequestCallback) => {\n'
    '    callback(0);\n'
    '    return 1;\n'
    '  };\n'
    '  Element.prototype.scrollIntoView = vi.fn();\n',
    "jsdom scrollIntoView support",
)
write(path, text)

print("frontend audit remediation patch applied")
