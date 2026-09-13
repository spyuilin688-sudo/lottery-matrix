import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, Cross2Icon, GearIcon, PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import { type LotteryId } from "../Prototype";
import { AppDialogProvider, useAppDialog, type AppDialogOptions } from "../dialog/AppDialog";
import { useNotebookOwner, type NotebookOwner } from "./notebook-owner";
import { readNotebookData, writeNotebookData, type NotebookData } from "./notebook-storage";
import { LOTTERIES, FeatureShell, BrandHeader, SectionTitle, LotteryLogoTabs } from "./shared";
import { Navigate, QuickNavigationContext, useQuickNavigation } from "./navigation";

export type NotebookView = "list" | "note";
export type NotebookNote = { id: string; title: string; content: string; updatedAt: string };

export function MatrixNotebookPage({ onNavigate }: { onNavigate: Navigate }) {
  const identity = useNotebookOwner();
  if (identity.status === "ready") {
    // Keep the shared dialog implementation, but cancel its account-specific queue on account change.
    return <AppDialogProvider key={identity.owner.revision}><OwnedNotebookPage owner={identity.owner} onNavigate={onNavigate} /></AppDialogProvider>;
  }
  return <FeatureShell title="Matrix 筆記本" onNavigate={onNavigate} active="快捷">
    {identity.status === "error" ? <div className="panel" role="alert"><p>登入狀態確認失敗，請重試。</p><button type="button" className="title-card-compact-action" onClick={identity.retry}>重試確認登入</button></div>
      : <p className="empty-result" role="status">{identity.status === "checking" ? "筆記本讀取中…" : "請先登入後再使用 Matrix 筆記本"}</p>}
  </FeatureShell>;
}

type FailedNotebookAction = { kind: "note" } | { kind: "delete-note"; id: string };

function OwnedNotebookPage({ owner, onNavigate }: { owner: NotebookOwner; onNavigate: Navigate }) {
  const appDialog = useAppDialog();
  const quickNavigation = useQuickNavigation();
  const [loaded, setLoaded] = useState(() => readNotebookData(owner.userId));
  const [failedAction, setFailedAction] = useState<FailedNotebookAction | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const confirmationPending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const isActive = () => owner.active && mounted.current;
  const confirmCurrent = async (options: AppDialogOptions) => {
    if (!isActive() || confirmationPending.current) return false;
    confirmationPending.current = true;
    setConfirmBusy(true);
    try { return await appDialog.confirm(options) && isActive(); }
    finally {
      confirmationPending.current = false;
      if (isActive()) setConfirmBusy(false);
    }
  };
  const emptyData = useMemo<NotebookData>(() => ({ notes: [] }), []);
  const { notes } = loaded.status === "ready" ? loaded.data : emptyData;
  const persist = (patch: Partial<NotebookData>, action: FailedNotebookAction) => {
    if (!isActive() || loaded.status !== "ready") return false;
    const data = { ...loaded.data, ...patch };
    if (!writeNotebookData(owner.userId, data)) {
      setFailedAction(action);
      return false;
    }
    setLoaded({ status: "ready", data });
    setFailedAction(null);
    return true;
  };
  const [view, setView] = useState<NotebookView>("list");
  const [deletingNotes, setDeletingNotes] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteBaseline, setNoteBaseline] = useState({ title: "", content: "" });
  const noteDirty = view === "note" && (noteTitle !== noteBaseline.title || noteContent !== noteBaseline.content);
  const unsaved = noteDirty || failedAction !== null;

  useEffect(() => {
    if (!unsaved) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [unsaved]);

  const cancelNoteDeletion = () => {
    setDeletingNotes(false);
    if (failedAction?.kind === "delete-note") setFailedAction(null);
  };
  const startNote = (entry?: NotebookNote) => {
    cancelNoteDeletion();
    setEditingNoteId(entry?.id ?? null);
    setNoteTitle(entry?.title ?? "");
    setNoteContent(entry?.content ?? "");
    setNoteBaseline({ title: entry?.title ?? "", content: entry?.content ?? "" });
    setView("note");
  };
  const leaveWithDraft = async (action: () => void) => {
    if (unsaved && !await confirmCurrent({ title: "內容尚未儲存", description: "確定離開？目前修改將不會保留。", confirmLabel: "直接離開" })) return;
    if (!isActive()) return;
    setFailedAction(null);
    action();
  };
  const returnFromNote = () => leaveWithDraft(() => setView("list"));
  const commitNote = () => {
    if (!noteTitle.trim() && !noteContent.trim()) return;
    const now = new Date().toISOString();
    const next = editingNoteId
      ? notes.map((entry) => entry.id === editingNoteId ? { ...entry, title: noteTitle, content: noteContent, updatedAt: now } : entry)
      : [{ id: `note-${crypto.randomUUID()}`, title: noteTitle, content: noteContent, updatedAt: now }, ...notes];
    if (persist({ notes: next }, { kind: "note" })) setView("list");
  };
  const saveNote = async () => {
    if (!noteTitle.trim() && !noteContent.trim()) return;
    if (!await confirmCurrent({ title: "確認寫入筆記？", description: "確認後將寫入目前內容。", confirmLabel: "確認寫入" })) return;
    commitNote();
  };
  const commitDeleteNote = (id: string) => {
    if (persist({ notes: notes.filter((note) => note.id !== id) }, { kind: "delete-note", id })) setDeletingNotes(false);
  };
  const deleteNote = async (entry: NotebookNote) => {
    if (!await confirmCurrent({ title: "確認刪除？", description: `刪除後將移除「${entry.title.trim() || "未命名筆記"}」。`, confirmLabel: "刪除", tone: "danger" })) return;
    commitDeleteNote(entry.id);
  };
  const navigateFromNotebook: Navigate = (screen) => { void leaveWithDraft(() => onNavigate(screen)); };
  const guardQuickAction = (action: (() => void) | undefined) => action ? () => { void leaveWithDraft(action); } : undefined;
  const retrySave = () => {
    if (failedAction?.kind === "note") commitNote();
    else if (failedAction?.kind === "delete-note") commitDeleteNote(failedAction.id);
  };
  const formatTime = (value: string) => new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));

  if (loaded.status === "error") return <FeatureShell title="Matrix 筆記本" onNavigate={onNavigate} active="快捷" className="matrix-notebook-screen">
    <div className="panel" role="alert"><p>筆記本讀取失敗，請重試。讀取成功前無法編輯。</p><button type="button" className="title-card-compact-action" aria-label="重試讀取筆記本" onClick={() => { if (isActive()) setLoaded(readNotebookData(owner.userId)); }}>重試讀取</button></div>
  </FeatureShell>;

  return (
    <QuickNavigationContext.Provider value={{ ...quickNavigation,
      onQuickBack: guardQuickAction(quickNavigation.onQuickBack),
      onQuickOpen: guardQuickAction(quickNavigation.onQuickOpen),
      onQuickConfigure: guardQuickAction(quickNavigation.onQuickConfigure),
    }}>
    <FeatureShell title="Matrix 筆記本" onNavigate={navigateFromNotebook} active="快捷" className="matrix-notebook-screen">
      {failedAction ? <div className="panel" role="alert"><p>筆記本尚未儲存，請重試。請勿關閉頁面，以免遺失目前修改。</p><button type="button" className="title-card-compact-action" aria-label="重試儲存筆記本" disabled={confirmBusy} onClick={retrySave}>重試儲存</button></div> : null}
      {view === "list" ? <>
        <section className="notebook-heading" aria-label="筆記本工具列">
          <img src="/assets/quick/matrix-notebook.png" alt="" />
          <div className="notebook-note-actions">
            <button type="button" className="notebook-delete-action" aria-pressed={deletingNotes} disabled={notes.length === 0} onClick={() => deletingNotes ? cancelNoteDeletion() : setDeletingNotes(true)}>{deletingNotes ? "取消刪除" : "刪除"}</button>
            <button type="button" onClick={() => startNote()}><PlusIcon aria-hidden="true" />新增筆記</button>
          </div>
          <span className="notebook-list-count notebook-entry-count">{notes.length} 筆筆記</span>
        </section>
        {deletingNotes ? <p className="notebook-delete-hint" role="status">請選擇要刪除的筆記</p> : null}
        <section className="notebook-entry-list" aria-label="筆記列表">
          {notes.map((entry) => <article className="panel notebook-entry" data-deleting={deletingNotes} key={entry.id}>
            <button type="button" className="notebook-entry-open" aria-label={`${deletingNotes ? "刪除" : "展開"}筆記：${entry.title.trim() || "未命名筆記"}`} onClick={() => deletingNotes ? void deleteNote(entry) : startNote(entry)}><span><strong>{entry.title.trim() || "未命名筆記"}</strong><small>{formatTime(entry.updatedAt)}</small></span><ChevronRightIcon aria-hidden="true" /></button>
          </article>)}
          {notes.length === 0 ? <div className="panel notebook-empty"><img src="/assets/quick/matrix-notebook.png" alt="" /><strong>尚無筆記</strong></div> : null}
        </section>
      </> : null}

      {view === "note" ? <section className="panel matrix-notebook-editor">
        <header><button type="button" onClick={returnFromNote}><ChevronLeftIcon />返回列表</button></header>
        <input aria-label="筆記標題" placeholder="標題" value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} />
        <textarea className="resize-none" aria-label="筆記內容" placeholder="輸入筆記內容" value={noteContent} onChange={(event) => setNoteContent(event.target.value)} />
        <button type="button" className="primary-action branded-explore-action notebook-write-button" disabled={confirmBusy} aria-busy={confirmBusy} onClick={saveNote}><span>寫入筆記</span></button>
      </section> : null}

    </FeatureShell>
    </QuickNavigationContext.Provider>
  );
}

export function NotesPage({ onNavigate }: { onNavigate: Navigate }) {
  const [lottery, setLottery] = useState<LotteryId>("今彩539");
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [issue, setIssue] = useState("第1234期");
  const [drawDate, setDrawDate] = useState("2026/08/04（二）");
  const [play, setPlay] = useState("三星");
  const [cost, setCost] = useState("NT$500");
  const [numberGroups, setNumberGroups] = useState([["03", "12", "21", "27", "35"]]);
  const [statusFilter, setStatusFilter] = useState<"全部" | "待開獎" | "已開獎">("全部");
  const [sortOrder, setSortOrder] = useState<"最新優先" | "最舊優先">("最新優先");
  const [selectedNote, setSelectedNote] = useState<number | null>(null);
  const [notes, setNotes] = useState([
    { id: 1, lottery: "今彩539" as LotteryId, issue: "第1234期", date: "2026/08/04（二）", play: "三星", groups: [["03", "12", "21", "27", "35"]], status: "待開獎" as const, cost: 500, prize: "待開獎", amount: 0, drawNumbers: [] as string[], matchedNumbers: [] as string[] },
    { id: 2, lottery: "今彩539" as LotteryId, issue: "第1233期", date: "2026/08/03（一）", play: "三星", groups: [["03", "12", "18", "27", "35"]], status: "已開獎" as const, cost: 500, prize: "三星獎", amount: 1000, drawNumbers: ["03", "12", "18", "27", "35"], matchedNumbers: ["03", "12", "18"] },
    { id: 3, lottery: "今彩539" as LotteryId, issue: "第1232期", date: "2026/08/02（日）", play: "四星", groups: [["05", "11", "17", "22", "31"]], status: "已開獎" as const, cost: 500, prize: "未中獎", amount: 0, drawNumbers: ["02", "09", "18", "26", "34"], matchedNumbers: [] as string[] },
  ]);
  const weekRange = useMemo(() => {
    const current = new Date();
    const monday = new Date(current.getFullYear(), current.getMonth(), current.getDate());
    const day = monday.getDay();
    monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const format = (date: Date) => `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
    return `${format(monday)}－${format(sunday)}`;
  }, []);

  const summary = useMemo(() => {
    const current = new Date();
    const monday = new Date(current.getFullYear(), current.getMonth(), current.getDate());
    const day = monday.getDay();
    monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    const weeklyNotes = notes.filter((note) => {
      const match = note.date.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
      if (!match) return false;
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      return date >= monday && date <= sunday;
    });
    const totalCost = weeklyNotes.reduce((sum, note) => sum + note.cost, 0);
    const confirmedPrize = weeklyNotes.filter((note) => note.status === "已開獎").reduce((sum, note) => sum + note.amount, 0);
    return {
      totalCost,
      confirmedPrize,
      difference: confirmedPrize - totalCost,
      drawn: weeklyNotes.filter((note) => note.status === "已開獎").length,
      pending: weeklyNotes.filter((note) => note.status === "待開獎").length,
    };
  }, [notes]);

  const formatMoney = (value: number, signed = false) => {
    if (value === 0) return "NT$0";
    const prefix = signed && value > 0 ? "+" : "";
    return `${prefix}${value < 0 ? "-" : ""}NT$${Math.abs(value).toLocaleString("en-US")}`;
  };

  const visibleNotes = useMemo(() => {
    const filtered = statusFilter === "全部" ? notes : notes.filter((note) => note.status === statusFilter);
    return sortOrder === "最新優先" ? filtered : [...filtered].reverse();
  }, [notes, sortOrder, statusFilter]);

  const switchLottery = (nextLottery: LotteryId) => {
    setLottery(nextLottery);
    setIssue("");
    setDrawDate("");
    setNumberGroups([["", "", "", "", ""]]);
  };

  const updateNumber = (groupIndex: number, numberIndex: number, value: string) => {
    setNumberGroups((groups) => groups.map((group, currentGroupIndex) =>
      currentGroupIndex === groupIndex
        ? group.map((number, currentNumberIndex) => currentNumberIndex === numberIndex ? value.replace(/\D/g, "").slice(0, 2) : number)
        : group,
    ));
  };

  const saveNote = () => {
    setNotes((current) => [{
      id: Date.now(), lottery, issue: issue || "第—期", date: drawDate || "—", play,
      groups: numberGroups, status: "待開獎" as const,
      cost: Number(cost.replace(/[^\d]/g, "")) || 0,
      prize: "待開獎", amount: 0, drawNumbers: [] as string[], matchedNumbers: [] as string[],
    }, ...current]);
  };

  const detail = selectedNote === null ? null : notes.find((note) => note.id === selectedNote) ?? null;
  if (detail) {
    const difference = detail.amount - detail.cost;
    const detailRows = [
      ["彩種", detail.lottery], ["期數", detail.issue], ["日期", detail.date], ["玩法", detail.play],
      ["投注號碼", detail.groups.map((group) => group.join("　")).join(" ／ ")],
      ["開獎號碼", detail.status === "待開獎" ? "待開獎" : detail.drawNumbers.join("　")],
      ["命中號碼", detail.status === "待開獎" ? "待開獎" : (detail.matchedNumbers.join("　") || "無")],
      ["紀錄成本", formatMoney(detail.cost)], ["獎金名稱", detail.prize],
      ["實際獎金", detail.status === "待開獎" ? "待開獎" : formatMoney(detail.amount)],
      ["金額差額", detail.status === "待開獎" ? "待開獎" : formatMoney(difference, true)], ["紀錄狀態", detail.status],
    ];
    return (
      <main className="feature-screen note-detail-screen">
        <BrandHeader title="記事詳細" onBack={() => setSelectedNote(null)} />
        <div className="feature-body">
          <section className="panel note-detail-card">
            {detailRows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </section>
          <button type="button" className="delete-note-button" onClick={() => { setNotes((current) => current.filter((note) => note.id !== detail.id)); setSelectedNote(null); }}><TrashIcon />刪除紀錄</button>
        </div>
      </main>
    );
  }

  return (
    <FeatureShell title="記事" onNavigate={onNavigate} active="快捷" compactHeader className="notes-screen">
      <section className="panel weekly-summary">
        <header>
          <h2>本週紀錄</h2>
          <span>{weekRange}</span>
          <button
            type="button"
            className="summary-collapse"
            onClick={() => setSummaryExpanded((current) => !current)}
            aria-label={summaryExpanded ? "收合本週紀錄" : "展開本週紀錄"}
            aria-expanded={summaryExpanded}
          ><ChevronDownIcon data-expanded={summaryExpanded} /></button>
        </header>
        <div hidden={!summaryExpanded}>
          <article><span>紀錄成本</span><strong>{formatMoney(summary.totalCost)}</strong></article>
          <article><span>已確認獎金</span><strong>{formatMoney(summary.confirmedPrize)}</strong></article>
          <article className="weekly-difference"><span>金額差額</span><strong>{formatMoney(summary.difference, true)}</strong></article>
          <article><span>已開獎</span><strong>{summary.drawn}</strong></article>
          <article><span>待開獎</span><strong>{summary.pending}</strong></article>
        </div>
      </section>
      <section className="panel note-form">
        <header><SectionTitle>新增投注紀錄</SectionTitle><button type="button" disabled><GearIcon />紀錄設定<ChevronRightIcon /></button></header>
        <fieldset className="note-form-section"><legend>開獎資料</legend>
          <label className="note-full-field"><span>彩種</span><LotteryLogoTabs selected={lottery} onChange={switchLottery} /></label>
          <div className="note-two-fields">
            <label><span>期數</span><input value={issue} inputMode="numeric" onChange={(event) => setIssue(event.target.value.replace(/\D/g, ""))} placeholder="期數" /></label>
            <label><span>日期</span><div className="date-input"><input value={drawDate} onChange={(event) => setDrawDate(event.target.value)} placeholder="日期" /><CalendarIcon /></div></label>
          </div>
        </fieldset>
        <fieldset className="note-form-section"><legend>投注資料</legend>
          <div className="note-two-fields">
            <label><span>玩法</span><div className="select-box native-select"><select value={play} onChange={(event) => setPlay(event.target.value)}><option>三星</option><option>四星</option></select><ChevronDownIcon /></div></label>
            <label><span>紀錄成本</span><input value={cost} onChange={(event) => setCost(event.target.value.replace(/\D/g, ""))} inputMode="numeric" /></label>
          </div>
        </fieldset>
        <fieldset className="note-form-section note-number-section"><legend>投注號碼</legend>
          {numberGroups.map((group, groupIndex) => <div className="note-number-group" key={groupIndex}><span>{numberGroups.length > 1 ? `第${groupIndex + 1}組` : "投注號碼"}</span><div>{group.map((number, numberIndex) => <input aria-label={`第${groupIndex + 1}組投注號碼${numberIndex + 1}`} value={number} onChange={(event) => updateNumber(groupIndex, numberIndex, event.target.value)} key={numberIndex} />)}</div></div>)}
          <div className="note-number-actions"><button type="button" onClick={() => setNumberGroups((groups) => [...groups, ["", "", "", "", ""]])}><PlusIcon />新增一組</button><button type="button" disabled={numberGroups.length > 1} onClick={() => setNumberGroups([["", "", "", "", ""]])}><TrashIcon />清除</button></div>
        </fieldset>
        <fieldset className="note-form-section"><legend>結果資料</legend>
          <div className="note-two-fields"><label><span>獎金名稱</span><input value="待開獎" readOnly /></label><label><span>實際獎金</span><input value="待開獎" readOnly /></label></div>
        </fieldset>
        <button type="button" className="save-note-button" onClick={saveNote}>儲存紀錄</button>
      </section>
      <div className="note-filters"><span>狀態</span>{(["全部", "待開獎", "已開獎"] as const).map((status) => <button type="button" data-selected={statusFilter === status} onClick={() => setStatusFilter(status)} key={status}>{status}</button>)}<span>排序</span><button type="button" className="note-sort-button" onClick={() => setSortOrder((current) => current === "最新優先" ? "最舊優先" : "最新優先")}>{sortOrder}<ChevronDownIcon /></button></div>
      <section className="notes-list">
        <h2>已建立紀錄</h2>
        {visibleNotes.map((note) => <button type="button" className="panel note-card" onClick={() => setSelectedNote(note.id)} key={note.id}>
          <header><strong>{note.issue}</strong><span>{note.date}</span><em data-status={note.status}>{note.status}</em><ChevronRightIcon /></header>
          <div className="note-record-main"><span>彩種<strong>{note.lottery}</strong></span><span>玩法<strong>{note.play}</strong></span><span className="note-record-numbers">投注號碼<b>{note.groups[0].map((number) => <i key={number}>{number}</i>)}</b></span></div>
          <div className="note-record-result"><span>紀錄成本<strong>{formatMoney(note.cost)}</strong></span><span>獎金名稱<strong>{note.prize}</strong></span><span>實際獎金<strong>{note.status === "待開獎" ? "待開獎" : formatMoney(note.amount)}</strong></span>{note.status === "已開獎" ? <span className="note-difference">金額差額<strong>{formatMoney(note.amount - note.cost, true)}</strong></span> : null}</div>
        </button>)}
      </section>
    </FeatureShell>
  );
}
