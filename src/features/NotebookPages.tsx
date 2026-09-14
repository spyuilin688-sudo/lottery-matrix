import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "@radix-ui/react-icons";
import { AppDialogProvider, useAppDialog, type AppDialogOptions } from "../dialog/AppDialog";
import { useNotebookOwner, type NotebookOwner } from "./notebook-owner";
import { readNotebookData, writeNotebookData, type NotebookData } from "./notebook-storage";
import { FeatureShell } from "./shared";
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
