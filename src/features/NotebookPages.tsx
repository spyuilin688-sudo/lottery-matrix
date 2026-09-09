import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, Cross2Icon, GearIcon, PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import { type LotteryId } from "../Prototype";
import { AppDialogProvider, useAppDialog, type AppDialogOptions } from "../dialog/AppDialog";
import { useNotebookOwner, type NotebookOwner } from "./notebook-owner";
import { readNotebookData, writeNotebookData, type NotebookData } from "./notebook-storage";
import { LOTTERIES, FeatureShell, BrandHeader, SectionTitle, LotteryLogoTabs } from "./shared";
import { Navigate, QuickNavigationContext, useQuickNavigation } from "./navigation";
import { taipeiCalendarDate } from "./MemberPages";

function notebookToday() {
  const { year, month, day } = taipeiCalendarDate(new Date())!;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Date-only values use UTC calendar arithmetic; they are not UTC instants.
function notebookWeekStart(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date;
}

export type NotebookView = "list" | "note" | "record" | "settings";

export type RecordMode = "單號" | "連碰" | "立柱";

export type RecordStatus = "等待開獎" | "已結算" | "已鎖定";

export type CostMode = "依照碰數" | "固定成本";

export type NotebookNote = { id: string; title: string; content: string; updatedAt: string };

export type TagSetting = { name: string; costMode: CostMode; defaultBets: number; costPerBet: number; fixedCost: number; prizePerBet: number };

export type LotteryRecordSettings = { tags: TagSetting[] };

export type RecordSnapshot = {
  lottery: LotteryId;
  plays: Array<{ name: string; bets: number; costPerBet: number; cost: number; playPrize: number }>;
  quantity: number;
  createdDate: string;
  createdTime: string;
};

export const formatNotebookAmount = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);

export type PlayDraft = { quantity: string };

export type NotebookRecord = {
  id: string;
  lottery: LotteryId;
  date: string;
  mode: RecordMode;
  numbers: string[];
  columns: string[][];
  tags: string[];
  quantity: number;
  bets: number;
  cost: number;
  estimatedPrize: number;
  actualPrize: number;
  status: RecordStatus;
  unlocked: boolean;
  snapshot: RecordSnapshot;
};

export const DEFAULT_RECORD_SETTINGS = (): Record<LotteryId, LotteryRecordSettings> => Object.fromEntries(
  LOTTERIES.map((lottery) => {
    const isThirtyNine = lottery === "今彩539" || lottery === "天天樂";
    const singlePrize = isThirtyNine ? 21200 : 28500;
    const singleBets = isThirtyNine ? 38 : 48;
    const singleFixedCost = isThirtyNine ? 3040 : 3840;
    const twoStarPrize = isThirtyNine ? 5300 : 5700;
    const fourStarPrize = isThirtyNine ? 800000 : 750000;
    return [lottery, {
      tags: [
        { name: "單號", costMode: "依照碰數" as CostMode, defaultBets: singleBets, costPerBet: 80, fixedCost: singleFixedCost, prizePerBet: singlePrize },
        { name: "二星", costMode: "固定成本" as CostMode, defaultBets: 1, costPerBet: 80, fixedCost: 80, prizePerBet: twoStarPrize },
        { name: "三星", costMode: "固定成本" as CostMode, defaultBets: 1, costPerBet: 80, fixedCost: 80, prizePerBet: 57000 },
        { name: "四星", costMode: "固定成本" as CostMode, defaultBets: 1, costPerBet: 80, fixedCost: 80, prizePerBet: fourStarPrize },
      ],
    }];
  }),
) as Record<LotteryId, LotteryRecordSettings>;

export function parseRecordNumbers(value: string, max: number) {
  return value.split(/[^0-9]+/).filter(Boolean).map((number) => number.padStart(2, "0")).filter((number) => Number(number) >= 1 && Number(number) <= max);
}

export function combinations(total: number, choose: number) {
  if (choose < 0 || choose > total) return 0;
  let result = 1;
  for (let index = 1; index <= choose; index += 1) result = (result * (total - choose + index)) / index;
  return Math.round(result);
}

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

type FailedNotebookAction = { kind: "note" | "record" | "settings" }
  | { kind: "delete-note" | "delete-record"; id: string };

function OwnedNotebookPage({ owner, onNavigate }: { owner: NotebookOwner; onNavigate: Navigate }) {
  const appDialog = useAppDialog();
  const quickNavigation = useQuickNavigation();
  const [loaded, setLoaded] = useState(() => readNotebookData(owner.userId, DEFAULT_RECORD_SETTINGS()));
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
  const emptyData = useMemo<NotebookData>(() => ({ notes: [], records: [], settings: DEFAULT_RECORD_SETTINGS() }), []);
  const { notes, records, settings } = loaded.status === "ready" ? loaded.data : emptyData;
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
  const [notebookMode, setNotebookMode] = useState<"筆記" | "紀錄">("筆記");
  const [deletingNotes, setDeletingNotes] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<Record<LotteryId, LotteryRecordSettings>>(() => DEFAULT_RECORD_SETTINGS());
  const [settingsBaseline, setSettingsBaseline] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteBaseline, setNoteBaseline] = useState({ title: "", content: "" });
  const [lottery, setLottery] = useState<LotteryId>("今彩539");
  const [recordDate, setRecordDate] = useState(notebookToday);
  const [recordInitialDate, setRecordInitialDate] = useState(recordDate);
  const [mode, setMode] = useState<RecordMode>("單號");
  const [numberText, setNumberText] = useState("");
  const [columnTexts, setColumnTexts] = useState(() => Array.from({ length: 12 }, () => ""));
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [playDrafts, setPlayDrafts] = useState<Record<string, PlayDraft>>({});
  const [numberPicker, setNumberPicker] = useState<{ type: "numbers" | "column" | "special"; column?: number } | null>(null);
  const [specialNumber, setSpecialNumber] = useState("");
  const [dateInfoOpen, setDateInfoOpen] = useState(false);
  const [expandedRecordIds, setExpandedRecordIds] = useState<string[]>([]);
  const [recordLotteryFilters, setRecordLotteryFilters] = useState<LotteryId[]>([...LOTTERIES]);
  const [customStartDate, setCustomStartDate] = useState(notebookToday);
  const [customEndDate, setCustomEndDate] = useState(notebookToday);
  const [statsPeriod, setStatsPeriod] = useState<"本日" | "本週" | "自訂">("本日");
  const [settingsLottery, setSettingsLottery] = useState<LotteryId>("今彩539");
  const [settingsEditMode, setSettingsEditMode] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const draggedTagIndex = useRef<number | null>(null);
  const draggedTagTargetIndex = useRef<number | null>(null);
  const draggedTagStartPosition = useRef<{ x: number; y: number } | null>(null);
  const draggedTagDidMove = useRef(false);
  const skipTagReorderClick = useRef(false);
  const editingTagName = useRef("");

  const maxNumber = lottery === "今彩539" || lottery === "天天樂" ? 39 : 49;
  const currentTags = settings[lottery].tags.filter((tag) => tag.name !== "自訂");
  const parsedNumbers = parseRecordNumbers(numberText, maxNumber);
  const parsedColumns = columnTexts.map((text) => parseRecordNumbers(text, maxNumber));
  const getCalculatedBets = (playName: string) => {
    const setting = currentTags.find((play) => play.name === playName);
    const star = Number((/^[二三四]星$/.test(playName) ? playName : "二星").replace("二", "2").replace("三", "3").replace("四", "4").replace("星", ""));
    if (mode === "單號") return setting?.defaultBets ?? 0;
    if (mode === "連碰") return combinations(parsedNumbers.length, star);
    return parsedColumns.length >= star && parsedColumns.slice(0, star).every((column) => column.length > 0)
      ? parsedColumns.slice(0, star).reduce((total, column) => total * column.length, 1)
      : 0;
  };
  const selectedPlayRows = selectedTags.map((name) => {
    const setting = currentTags.find((play) => play.name === name);
    const draft = playDrafts[name];
    const playQuantity = Math.min(9999999, Math.max(0.1, Number(draft?.quantity || 1)));
    const baseBets = getCalculatedBets(name);
    const bets = baseBets * playQuantity;
    const cost = setting?.costMode === "固定成本"
      ? (setting.fixedCost ?? 0) * playQuantity
      : bets * (setting?.costPerBet ?? 0);
    const playPrize = (setting?.prizePerBet ?? 0) * playQuantity;
    const unitCost = bets ? cost / bets : 0;
    const unitPrize = bets ? playPrize / bets : 0;
    return { name, quantity: playQuantity, bets, costPerBet: setting?.costPerBet ?? 0, cost, playPrize, unitCost, unitPrize };
  });
  const computedBets = selectedPlayRows.reduce((sum, play) => sum + play.bets, 0);
  const computedCost = selectedPlayRows.reduce((sum, play) => sum + play.cost, 0);
  const estimatedPrize = selectedPlayRows.reduce((sum, play) => sum + play.playPrize, 0);

  const weekDates = useMemo(() => {
    const monday = notebookWeekStart(recordDate);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setUTCDate(monday.getUTCDate() + index);
      return { label: ["一", "二", "三", "四", "五", "六", "日"][index], value: date.toISOString().slice(0, 10), day: date.getUTCDate() };
    });
  }, [recordDate]);

  const today = notebookToday();
  const visibleRecords = useMemo(() => records.filter((record) => {
    if (!recordLotteryFilters.includes(record.lottery)) return false;
    if (statsPeriod === "本日") return record.date === today;
    if (statsPeriod === "自訂") return record.date >= customStartDate && record.date <= customEndDate;
    const monday = notebookWeekStart(today);
    const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
    return record.date >= monday.toISOString().slice(0, 10) && record.date <= sunday.toISOString().slice(0, 10);
  }), [customEndDate, customStartDate, recordLotteryFilters, records, statsPeriod, today]);
  const stats = useMemo(() => ({
    total: visibleRecords.length,
    won: visibleRecords.filter((record) => record.actualPrize > 0).length,
    missed: visibleRecords.filter((record) => record.status !== "等待開獎" && record.actualPrize === 0).length,
    bets: visibleRecords.reduce((sum, record) => sum + record.bets, 0),
    cost: visibleRecords.reduce((sum, record) => sum + record.cost, 0),
    prize: visibleRecords.reduce((sum, record) => sum + record.actualPrize, 0),
  }), [visibleRecords]);
  const settingsDirty = view === "settings" && JSON.stringify(settingsDraft) !== settingsBaseline;
  const noteDirty = view === "note" && (noteTitle !== noteBaseline.title || noteContent !== noteBaseline.content);
  const recordDirty = view === "record" && (lottery !== "今彩539" || recordDate !== recordInitialDate
    || mode !== "單號" || numberText !== "" || columnTexts.some(Boolean) || specialNumber !== ""
    || selectedTags.length > 0 || Object.keys(playDrafts).length > 0);
  const unsaved = settingsDirty || noteDirty || recordDirty || failedAction !== null;

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
    if (unsaved && !await confirmCurrent({ title: settingsDirty ? "設定尚未儲存" : "內容尚未儲存", description: "確定離開？目前修改將不會保留。", confirmLabel: "直接離開" })) return;
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
  const commitDeleteRecord = (id: string) => persist({ records: records.filter((record) => record.id !== id) }, { kind: "delete-record", id });
  const deleteRecord = async (id: string) => {
    if (await confirmCurrent({ title: "確認刪除？", description: "刪除後將移除此紀錄。", confirmLabel: "刪除", tone: "danger" })) commitDeleteRecord(id);
  };
  const startRecord = () => {
    const date = notebookToday();
    setLottery("今彩539"); setRecordDate(date); setRecordInitialDate(date); setMode("單號"); setNumberText(""); setColumnTexts(Array.from({ length: 12 }, () => "")); setSelectedTags([]); setPlayDrafts({}); setSpecialNumber(""); setView("record");
  };
  const openSettings = () => leaveWithDraft(() => {
    const draft = structuredClone(settings);
    setSettingsDraft(draft);
    setSettingsBaseline(JSON.stringify(draft));
    setSettingsEditMode(false);
    setNewTagName("");
    setView("settings");
  });
  const leaveSettings = leaveWithDraft;
  const navigateFromNotebook: Navigate = (screen) => { void leaveWithDraft(() => onNavigate(screen)); };
  const guardQuickAction = (action: (() => void) | undefined) => action ? () => { void leaveWithDraft(action); } : undefined;
  const saveRecord = () => {
    const numbers = mode === "立柱" ? parsedColumns.flat() : parsedNumbers;
    if (mode === "立柱" && new Set(numbers).size !== numbers.length) return;
    if (numbers.length === 0 || selectedTags.length === 0) return;
    const created = new Date();
    const snapshot: RecordSnapshot = {
      lottery, plays: selectedPlayRows, quantity: 1,
      createdDate: created.toLocaleDateString("zh-TW"), createdTime: created.toLocaleTimeString("zh-TW", { hour12: false }),
    };
    const next: NotebookRecord[] = [{
      id: `record-${crypto.randomUUID()}`, lottery, date: recordDate, mode, numbers: specialNumber ? [...numbers, specialNumber] : numbers, columns: parsedColumns,
      tags: selectedTags, quantity: 1, bets: computedBets, cost: computedCost, estimatedPrize,
      actualPrize: 0, status: "等待開獎", unlocked: false, snapshot,
    }, ...records];
    if (persist({ records: next }, { kind: "record" })) setView("list");
  };
  const updateTag = (index: number, patch: Partial<TagSetting>) => setSettingsDraft((current) => ({
    ...current,
    [settingsLottery]: { tags: current[settingsLottery].tags.map((tag, tagIndex) => tagIndex === index ? { ...tag, ...patch } : tag) },
  }));
  const updateTagNumber = (index: number, key: "defaultBets" | "costPerBet" | "fixedCost" | "prizePerBet", rawValue: string) => {
    const digits = rawValue.replace(/\D/g, "").slice(0, 7);
    updateTag(index, { [key]: digits === "" ? 0 : Math.min(9999999, Math.max(1, Number(digits))) });
  };
  const finalizeTagNumber = (index: number, key: "defaultBets" | "costPerBet" | "fixedCost" | "prizePerBet", value: number) => {
    if (value < 1) updateTag(index, { [key]: 1 });
  };
  const reorderSettingsTag = (from: number, to: number) => {
    if (from === to) return;
    setSettingsDraft((current) => {
      const tags = [...current[settingsLottery].tags];
      const [moved] = tags.splice(from, 1);
      tags.splice(to, 0, moved);
      return { ...current, [settingsLottery]: { tags } };
    });
    queueMicrotask(() => {
      if (!isActive()) return;
      document.querySelector<HTMLButtonElement>(`[data-tag-setting-index="${to}"] .tag-drag-handle`)
        ?.focus();
    });
  };
  const moveSettingsTag = (index: number, delta: -1 | 1) => {
    const lastIndex = settingsDraft[settingsLottery].tags.length - 1;
    const targetIndex = Math.min(lastIndex, Math.max(0, index + delta));
    reorderSettingsTag(index, targetIndex);
  };
  const suppressTagReorderFollowOnClick = () => {
    skipTagReorderClick.current = true;
    window.setTimeout(() => { skipTagReorderClick.current = false; }, 0);
  };
  const clickSettingsTagReorder = (index: number) => {
    if (skipTagReorderClick.current) {
      skipTagReorderClick.current = false;
      return;
    }
    const lastIndex = settingsDraft[settingsLottery].tags.length - 1;
    moveSettingsTag(index, index === lastIndex ? -1 : 1);
  };
  const keySettingsTagReorder = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    moveSettingsTag(index, event.key === "ArrowUp" ? -1 : 1);
  };
  const beginTagDrag = (event: React.PointerEvent<HTMLButtonElement>, index: number) => {
    draggedTagIndex.current = index;
    draggedTagTargetIndex.current = index;
    draggedTagStartPosition.current = { x: event.clientX, y: event.clientY };
    draggedTagDidMove.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveTagDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const from = draggedTagIndex.current;
    if (from === null) return;
    const start = draggedTagStartPosition.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 4) {
      draggedTagDidMove.current = true;
    }
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-tag-setting-index]");
    const to = Number(target?.dataset.tagSettingIndex);
    if (Number.isInteger(to)) {
      if (to !== from) draggedTagDidMove.current = true;
      draggedTagTargetIndex.current = to;
    }
  };
  const endTagDrag = async () => {
    const from = draggedTagIndex.current;
    const to = draggedTagTargetIndex.current;
    const didMove = draggedTagDidMove.current;
    draggedTagIndex.current = null;
    draggedTagTargetIndex.current = null;
    draggedTagStartPosition.current = null;
    draggedTagDidMove.current = false;
    if (didMove) suppressTagReorderFollowOnClick();
    if (from === null || to === null || from === to) return;
    if (!await confirmCurrent({ title: "確認變更玩法順序？", confirmLabel: "確認變更" })) return;
    reorderSettingsTag(from, to);
  };
  const cancelTagDrag = () => {
    const hadActiveDrag = draggedTagIndex.current !== null;
    draggedTagIndex.current = null;
    draggedTagTargetIndex.current = null;
    draggedTagStartPosition.current = null;
    draggedTagDidMove.current = false;
    if (hadActiveDrag) suppressTagReorderFollowOnClick();
  };
  const addSettingsTag = async () => {
    if (!newTagName.trim()) return;
    const name = newTagName.trim();
    if (settingsDraft[settingsLottery].tags.some((play) => play.name === name)) return;
    if (!await confirmCurrent({ title: `確認新增「${name}」玩法？`, confirmLabel: "新增" })) return;
    setSettingsDraft((current) => ({
      ...current,
      [settingsLottery]: {
        tags: [...current[settingsLottery].tags, {
          name,
          costMode: "依照碰數",
          defaultBets: settingsLottery === "今彩539" || settingsLottery === "天天樂" ? 38 : 48,
          costPerBet: 1,
          fixedCost: 1,
          prizePerBet: 1,
        }],
      },
    }));
    setNewTagName("");
  };
  const deleteSettingsTag = async (index: number, name: string) => {
    if (!await confirmCurrent({ title: `確認刪除「${name}」玩法？`, description: "刪除後將移除此玩法。", confirmLabel: "刪除", tone: "danger" })) return;
    setSettingsDraft((current) => ({
      ...current,
      [settingsLottery]: { tags: current[settingsLottery].tags.filter((_, tagIndex) => tagIndex !== index) },
    }));
  };
  const resetSettings = async () => {
    if (!await confirmCurrent({ title: "確認重置設定？", description: "目前彩種的玩法設定將恢復預設值。", confirmLabel: "重置", tone: "danger" })) return;
    setSettingsDraft((current) => ({ ...current, [settingsLottery]: DEFAULT_RECORD_SETTINGS()[settingsLottery] }));
  };
  const commitSettings = () => {
    const savedSettings = structuredClone(settingsDraft);
    if (!persist({ settings: savedSettings }, { kind: "settings" })) return;
    setSettingsBaseline(JSON.stringify(savedSettings));
    setSettingsEditMode(false);
  };
  const saveSettings = async () => {
    if (!await confirmCurrent({ title: "確認儲存設定？", confirmLabel: "儲存" })) return;
    commitSettings();
  };
  const retrySave = () => {
    if (!failedAction || confirmationPending.current) return;
    if (failedAction.kind === "note") commitNote();
    else if (failedAction.kind === "record") saveRecord();
    else if (failedAction.kind === "settings") commitSettings();
    else if (failedAction.kind === "delete-note") commitDeleteNote(failedAction.id);
    else if (failedAction.kind === "delete-record") commitDeleteRecord(failedAction.id);
  };
  const togglePlay = (name: string) => {
    setSelectedTags((current) => current.includes(name) ? current.filter((play) => play !== name) : [...current, name]);
    if (!playDrafts[name]) setPlayDrafts((current) => ({ ...current, [name]: { quantity: "1" } }));
  };
  const updatePlayDraft = (name: string, patch: Partial<PlayDraft>) => setPlayDrafts((current) => ({ ...current, [name]: { quantity: current[name]?.quantity ?? "1", ...patch } }));
  const togglePickedNumber = (number: string) => {
    if (!numberPicker) return;
    if (numberPicker.type === "special") {
      setSpecialNumber((current) => current === number ? "" : number);
      setNumberText((current) => parseRecordNumbers(current, maxNumber).filter((item) => item !== number).join(" "));
      setColumnTexts((columns) => columns.map((value) => parseRecordNumbers(value, maxNumber).filter((item) => item !== number).join(" ")));
      return;
    }
    setSpecialNumber((current) => current === number ? "" : current);
    if (numberPicker.type === "numbers") {
      if (mode === "單號") setNumberText(number);
      else setNumberText((parsedNumbers.includes(number) ? parsedNumbers.filter((item) => item !== number) : [...parsedNumbers, number]).join(" "));
      return;
    }
    const columnIndex = numberPicker.column ?? 0;
    const current = parsedColumns[columnIndex] ?? [];
    const removing = current.includes(number);
    setColumnTexts((columns) => columns.map((value, index) => {
      const values = parseRecordNumbers(value, maxNumber).filter((item) => item !== number);
      if (index === columnIndex && !removing) values.push(number);
      return values.join(" ");
    }));
  };
  const formatTime = (value: string) => new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));

  if (loaded.status === "error") return <FeatureShell title="Matrix 筆記本" onNavigate={onNavigate} active="快捷" className="matrix-notebook-screen">
    <div className="panel" role="alert"><p>筆記本讀取失敗，請重試。讀取成功前無法編輯。</p><button type="button" className="title-card-compact-action" aria-label="重試讀取筆記本" onClick={() => { if (isActive()) setLoaded(readNotebookData(owner.userId, DEFAULT_RECORD_SETTINGS())); }}>重試讀取</button></div>
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
          {notebookMode === "筆記" ? <div className="notebook-note-actions">
            <button type="button" className="notebook-delete-action" aria-pressed={deletingNotes} disabled={notes.length === 0} onClick={() => deletingNotes ? cancelNoteDeletion() : setDeletingNotes(true)}>{deletingNotes ? "取消刪除" : "刪除"}</button>
            <button type="button" onClick={() => startNote()}><PlusIcon aria-hidden="true" />新增筆記</button>
          </div> : <span className="notebook-entry-count">{records.length} 筆紀錄</span>}
          <div className="notebook-mode-switch" aria-label="筆記本模式">
            <button type="button" data-selected={notebookMode === "筆記"} onClick={() => { setNotebookMode("筆記"); cancelNoteDeletion(); }} aria-label="切換至筆記模式"><img src="/assets/quick/notebook-mode-note.png" alt="" /><span>筆記</span></button>
            <button type="button" data-selected={notebookMode === "紀錄"} onClick={() => { setNotebookMode("紀錄"); cancelNoteDeletion(); }} aria-label="切換至紀錄模式"><img src="/assets/quick/notebook-mode-record.png" alt="" /><span>紀錄</span></button>
          </div>
          {notebookMode === "筆記" ? <span className="notebook-list-count notebook-entry-count">{notes.length} 筆筆記</span> : <div className="notebook-create-actions" data-mode="紀錄"><div className="record-lottery-filters" aria-label="彩種分類">{LOTTERIES.map((item) => <button type="button" data-selected={recordLotteryFilters.includes(item)} onClick={() => setRecordLotteryFilters((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} key={item}>{item}</button>)}</div><button type="button" onClick={startRecord}><PlusIcon />新增紀錄</button></div>}
        </section>
        {deletingNotes ? <p className="notebook-delete-hint" role="status">請選擇要刪除的筆記</p> : null}
        {notebookMode === "紀錄" ? <section className="record-stats panel">
          <header><div>{(["本日", "本週", "自訂"] as const).map((period) => <button type="button" data-selected={statsPeriod === period} onClick={() => setStatsPeriod(period)} key={period}>{period}</button>)}</div><button type="button" onClick={openSettings}><GearIcon />設定</button></header>{statsPeriod === "自訂" ? <div className="record-custom-range"><input type="date" value={customStartDate} onChange={(event) => setCustomStartDate(event.target.value)} /><span>至</span><input type="date" value={customEndDate} onChange={(event) => setCustomEndDate(event.target.value)} /></div> : null}
          <div className="record-stats-grid">
            <span>玩法成本 <strong>NT {formatNotebookAmount(stats.cost)}</strong></span><span>已確認獎金 <strong>{formatNotebookAmount(stats.prize)}</strong></span><span>金額差額 <strong>NT {formatNotebookAmount(stats.prize - stats.cost)}</strong></span>
          </div>
        </section> : null}
        <section className="notebook-entry-list" aria-label={notebookMode === "筆記" ? "筆記列表" : "紀錄列表"}>
          {notebookMode === "筆記" ? notes.map((entry) => <article className="panel notebook-entry" data-deleting={deletingNotes} key={entry.id}>
            <button type="button" className="notebook-entry-open" aria-label={`${deletingNotes ? "刪除" : "展開"}筆記：${entry.title.trim() || "未命名筆記"}`} onClick={() => deletingNotes ? void deleteNote(entry) : startNote(entry)}><span><strong>{entry.title.trim() || "未命名筆記"}</strong><small>{formatTime(entry.updatedAt)}</small></span><ChevronRightIcon aria-hidden="true" /></button>
          </article>) : visibleRecords.map((record) => {
            const expanded = expandedRecordIds.includes(record.id);
            return <article className="panel notebook-record-card" key={record.id}>
              <button type="button" className="record-card-toggle" aria-expanded={expanded} onClick={() => setExpandedRecordIds((current) => current.includes(record.id) ? current.filter((id) => id !== record.id) : [...current, record.id])}>
                <span><strong>{record.lottery}</strong><small>{record.date}</small></span><em>{record.status}</em><ChevronDownIcon data-open={expanded} />
              </button>
              {expanded ? <div className="record-card-details"><p>{record.mode}｜{record.tags.join("、")}</p><div className="record-number-row">{record.numbers.map((number, index) => <i key={number + "-" + index}>{number}</i>)}</div><footer><span>總碰數 <strong>{formatNotebookAmount(record.bets)}</strong></span><span>玩法成本 <strong>NT {formatNotebookAmount(record.cost)}</strong></span><span>已確認獎金 <strong>{formatNotebookAmount(record.actualPrize)}</strong></span><span>金額差額 <strong>NT {formatNotebookAmount(record.actualPrize - record.cost)}</strong></span></footer><div className="record-status-actions"><em>{record.status}</em><button type="button" onClick={() => deleteRecord(record.id)}><TrashIcon />刪除</button></div></div> : null}
            </article>;
          })}
          {notebookMode === "筆記" && notes.length === 0 ? <div className="panel notebook-empty"><img src="/assets/quick/matrix-notebook.png" alt="" /><strong>尚無筆記</strong></div> : null}
          {notebookMode === "紀錄" && visibleRecords.length === 0 ? <div className="panel notebook-empty"><img src="/assets/quick/matrix-notebook.png" alt="" /><strong>尚無紀錄</strong></div> : null}
        </section>
      </> : null}

      {view === "note" ? <section className="panel matrix-notebook-editor">
        <header><button type="button" onClick={returnFromNote}><ChevronLeftIcon />返回列表</button></header>
        <input aria-label="筆記標題" placeholder="標題" value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} />
        <textarea className="resize-none" aria-label="筆記內容" placeholder="輸入筆記內容" value={noteContent} onChange={(event) => setNoteContent(event.target.value)} />
        <button type="button" className="primary-action branded-explore-action notebook-write-button" disabled={confirmBusy} aria-busy={confirmBusy} onClick={saveNote}><span>寫入筆記</span></button>
      </section> : null}

      {view === "record" ? <section className="record-editor">
        <header className="record-page-header"><button type="button" onClick={() => leaveWithDraft(() => setView("list"))}><ChevronLeftIcon />返回列表</button><button type="button" onClick={openSettings}><GearIcon />設定</button></header>
        <section className="panel record-form-section"><h3>彩種</h3><div className="record-lottery-tabs">{LOTTERIES.map((item) => <button type="button" data-selected={lottery === item} onClick={() => { setLottery(item); setSettingsLottery(item); setNumberText(""); setColumnTexts(Array.from({ length: 12 }, () => "")); setSpecialNumber(""); setSelectedTags([]); setPlayDrafts({}); }} key={item}>{item}</button>)}</div></section>
        <section className="panel record-form-section record-date-section"><button type="button" className="record-date-toggle" aria-expanded={dateInfoOpen} onClick={() => setDateInfoOpen(!dateInfoOpen)}><h3>日期</h3><ChevronDownIcon data-open={dateInfoOpen} /></button>{dateInfoOpen ? <div className="record-week-row">{weekDates.map((date) => <button type="button" data-selected={recordDate === date.value} onClick={() => setRecordDate(date.value)} key={date.value}><span>{date.label}</span><strong>{date.day}</strong></button>)}</div> : null}</section>
        <section className="panel record-form-section"><h3>輸入模式</h3><div className="record-mode-tabs">{(["單號", "連碰", "立柱"] as const).map((item) => <button type="button" data-selected={mode === item} onClick={() => { setMode(item); setNumberText(""); setColumnTexts(Array.from({ length: 12 }, () => "")); setSpecialNumber(""); setSelectedTags([]); setPlayDrafts({}); }} key={item}>{item}</button>)}</div>
          <div className="record-number-and-special">{mode !== "立柱" ? <button type="button" className="record-number-picker-button" onClick={() => setNumberPicker({ type: "numbers" })}><span>{parsedNumbers.length ? parsedNumbers.join("、") : "選取號碼"}</span><ChevronRightIcon /></button> : <div className="record-columns">{columnTexts.map((value, index) => <label key={index}>第{index + 1}柱<button type="button" onClick={() => setNumberPicker({ type: "column", column: index })}><span>{parseRecordNumbers(value, maxNumber).length ? parseRecordNumbers(value, maxNumber).join("、") : "選取號碼"}</span><ChevronRightIcon /></button></label>)}</div>}{lottery === "六合彩" || lottery === "大樂透" ? <button type="button" className="record-special-picker-button" onClick={() => setNumberPicker({ type: "special" })}><span>特別號</span><strong>{specialNumber || "—"}</strong></button> : null}</div>
        </section>
        <section className="panel record-form-section"><h3>玩法</h3><div className="record-tag-options">{currentTags.filter((play) => mode === "單號" ? !["二星", "三星", "四星"].includes(play.name) : play.name !== "單號").map((play) => <button type="button" data-selected={selectedTags.includes(play.name)} onClick={() => togglePlay(play.name)} key={play.name}>{play.name}</button>)}</div></section>
        {selectedPlayRows.map((play) => <section className="panel record-play-setting" key={play.name}><h3>{play.name}</h3><div className="record-play-metrics"><label>數量 <input type="number" min="0.1" max="9999999" step="0.1" value={playDrafts[play.name]?.quantity ?? "1"} onChange={(event) => updatePlayDraft(play.name, { quantity: event.target.value })} /></label><p className="record-formula"><span>碰數 <strong>{formatNotebookAmount(play.bets)}</strong> × 1碰金額 <strong>{formatNotebookAmount(play.unitCost)}</strong> = 玩法成本 <strong>NT {formatNotebookAmount(play.cost)}</strong></span></p><p className="record-formula"><span>碰數 <strong>{formatNotebookAmount(play.bets)}</strong> × 1碰獎金 <strong>{formatNotebookAmount(play.unitPrize)}</strong> = 最高獎金 <strong>{formatNotebookAmount(play.playPrize)}</strong></span></p></div></section>)}
        <section className="panel record-form-section record-quantity"><span>總碰數 <strong>{formatNotebookAmount(computedBets)}</strong></span><span>玩法成本 <strong>NT {formatNotebookAmount(computedCost)}</strong></span><span>最高獎金 <strong>{formatNotebookAmount(estimatedPrize)}</strong></span></section>
        <button type="button" className="record-save-button" onClick={saveRecord}>新增紀錄</button>
      </section> : null}

      {view === "settings" ? <section className="record-settings">
        <header className="record-page-header"><button type="button" onClick={() => leaveSettings(() => setView("list"))}><ChevronLeftIcon />返回列表</button><div className="record-settings-heading"><strong>設定</strong><button type="button" data-selected={settingsEditMode} onClick={() => setSettingsEditMode(true)}>編輯</button></div></header>
        <div className="record-lottery-tabs">{LOTTERIES.map((item) => <button type="button" data-selected={settingsLottery === item} onClick={() => setSettingsLottery(item)} key={item}>{item}</button>)}</div>
        {settingsDraft[settingsLottery].tags.map((tag, index, tags) => <section className="panel tag-setting-card" data-tag-setting-index={index} key={index}>
          <header data-editing={settingsEditMode}>
            {settingsEditMode ? <button type="button" className="tag-drag-handle" aria-label={`調整${tag.name}順序，目前第${index + 1}項，共${tags.length}項；點擊${index === tags.length - 1 ? "上移" : "下移"}，方向鍵可調整`} onClick={() => clickSettingsTagReorder(index)} onKeyDown={(event) => keySettingsTagReorder(event, index)} onPointerDown={(event) => beginTagDrag(event, index)} onPointerMove={moveTagDrag} onPointerUp={endTagDrag} onPointerCancel={cancelTagDrag}><span aria-hidden="true">⠿</span></button> : null}
            {["單號", "二星", "三星", "四星"].includes(tag.name) || !settingsEditMode ? <strong>{tag.name}</strong> : <input aria-label="玩法名稱" value={tag.name} onFocus={() => { editingTagName.current = tag.name; }} onChange={(event) => updateTag(index, { name: event.target.value })} onBlur={async () => { if (tag.name !== editingTagName.current && !await confirmCurrent({ title: `確認修改玩法名稱？`, description: `將「${editingTagName.current}」修改為「${tag.name}」。`, confirmLabel: "修改" }) && isActive()) updateTag(index, { name: editingTagName.current }); }} />}
            {settingsEditMode ? <button type="button" className="tag-delete-button" aria-label={`刪除${tag.name}`} onClick={() => deleteSettingsTag(index, tag.name)}><TrashIcon /></button> : null}
          </header>
          <div className="tag-setting-fields">
            <label>成本模式<div className="select-box native-select tag-cost-mode-select"><select value={String(tag.costMode) === "固定成本模式" ? "固定成本" : tag.costMode} onChange={(event) => updateTag(index, { costMode: event.target.value as CostMode })}><option>依照碰數</option><option>固定成本</option></select><ChevronDownIcon /></div></label>
            {String(tag.costMode) === "固定成本" || String(tag.costMode) === "固定成本模式"
              ? <>
                  <label>1組成本<input type="number" min="1" max="9999999" value={tag.fixedCost || ""} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateTagNumber(index, "fixedCost", event.target.value)} onBlur={() => finalizeTagNumber(index, "fixedCost", tag.fixedCost)} /></label>
                  <label>中1組獎金<input type="number" min="1" max="9999999" value={tag.prizePerBet || ""} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateTagNumber(index, "prizePerBet", event.target.value)} onBlur={() => finalizeTagNumber(index, "prizePerBet", tag.prizePerBet)} /></label>
                </>
              : <>
                  <label>碰數<input type="number" min="1" max="9999999" value={tag.defaultBets || ""} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateTagNumber(index, "defaultBets", event.target.value)} onBlur={() => finalizeTagNumber(index, "defaultBets", tag.defaultBets)} /></label>
                  <label>1碰成本<input type="number" min="1" max="9999999" value={tag.costPerBet || ""} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateTagNumber(index, "costPerBet", event.target.value)} onBlur={() => finalizeTagNumber(index, "costPerBet", tag.costPerBet)} /></label>
                  <label>中1碰獎金<input type="number" min="1" max="9999999" value={tag.prizePerBet || ""} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateTagNumber(index, "prizePerBet", event.target.value)} onBlur={() => finalizeTagNumber(index, "prizePerBet", tag.prizePerBet)} /></label>
                </>}
          </div>
        </section>)}
        <section className="panel custom-tag-add"><input placeholder="新增自訂玩法" value={newTagName} onChange={(event) => setNewTagName(event.target.value)} /><button type="button" onClick={addSettingsTag}>新增</button></section>
        <section className="panel record-data-actions"><button type="button" onClick={resetSettings}>重置設定</button><button type="button" disabled={confirmBusy} aria-busy={confirmBusy} onClick={saveSettings}>儲存設定</button></section>
      </section> : null}
      {numberPicker && document.querySelector<HTMLElement>(".mobile-page") ? createPortal(<div className="filter-sheet-backdrop record-picker-backdrop" role="presentation" onClick={() => setNumberPicker(null)}><section className="filter-sheet record-number-picker" role="dialog" aria-modal="true" aria-labelledby="record-number-picker-title" onClick={(event) => event.stopPropagation()}><header><h2 id="record-number-picker-title">選取號碼</h2><button type="button" onClick={() => setNumberPicker(null)} aria-label="關閉"><Cross2Icon /></button></header><div className="record-number-grid">{Array.from({ length: maxNumber }, (_, index) => String(index + 1).padStart(2, "0")).map((number) => { const selected = numberPicker.type === "special" ? specialNumber === number : numberPicker.type === "numbers" ? parsedNumbers.includes(number) : parsedColumns[numberPicker.column ?? 0]?.includes(number); return <button type="button" data-selected={selected} onClick={() => togglePickedNumber(number)} key={number}>{number}</button>; })}</div><button type="button" className="record-picker-done" onClick={() => setNumberPicker(null)}>完成</button></section></div>, document.querySelector<HTMLElement>(".mobile-page")!) : null}
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
