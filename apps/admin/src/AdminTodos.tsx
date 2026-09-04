import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { formatAdminDateTime } from './admin-operations';
import {
  adminTodoCharacterCount,
  canDeleteAdminTodo,
  canEditAdminTodo,
  createAdminTodo,
  deleteAdminTodo,
  formatAdminTodoError,
  isValidAdminTodoContent,
  listAdminTodos,
  updateAdminTodo,
  type AdminTodo,
  type AdminTodoActor,
  type AdminTodoApiClient,
} from './admin-todos';
import './admin-todos.css';

type ConfirmationInput = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'default' | 'danger';
};

type Props = {
  client: AdminTodoApiClient;
  admin: AdminTodoActor;
  requestConfirmation: (request: ConfirmationInput) => Promise<boolean>;
};

type BusyAction = { kind: 'create' | 'edit' | 'delete' | 'confirm'; id?: string } | null;

export function AdminTodos({ client, admin, requestConfirmation }: Props) {
  const [items, setItems] = useState<AdminTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState('');
  const [draftTouched, setDraftTouched] = useState(false);
  const [formError, setFormError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editError, setEditError] = useState('');
  const [busy, setBusy] = useState<BusyAction>(null);
  const mounted = useRef(true);
  const requestSequence = useRef(0);
  const mutation = useRef(false);

  const load = async () => {
    const request = ++requestSequence.current;
    setLoading(true);
    setLoadError('');
    try {
      const next = await listAdminTodos(client);
      if (mounted.current && request === requestSequence.current) setItems(next);
    } catch (cause) {
      if (mounted.current && request === requestSequence.current) {
        setLoadError(formatAdminTodoError(cause, '代辦事項讀取失敗，請重新讀取'));
      }
    } finally {
      if (mounted.current && request === requestSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      requestSequence.current += 1;
    };
  }, [client]);

  const runMutation = async (action: Exclude<BusyAction, null>, operation: () => Promise<void>) => {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(action);
    setFeedback('');
    try {
      await operation();
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    setDraftTouched(true);
    if (!isValidAdminTodoContent(draft) || mutation.current) {
      if (!isValidAdminTodoContent(draft)) setFormError('請輸入 1～100 字的代辦事項');
      return;
    }
    setFormError('');
    await runMutation({ kind: 'create' }, async () => {
      try {
        const created = await createAdminTodo(client, draft.trim());
        if (!mounted.current) return;
        setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
        setDraft('');
        setDraftTouched(false);
        setFeedback('代辦事項已建立');
      } catch (cause) {
        if (mounted.current) setFormError(formatAdminTodoError(cause, '建立失敗，內容已保留，請再試一次'));
      }
    });
  };

  const beginEdit = (item: AdminTodo) => {
    if (mutation.current || !canEditAdminTodo(item, admin)) return;
    setEditingId(item.id);
    setEditDraft(item.content);
    setEditError('');
    setFeedback('');
  };

  const cancelEdit = () => {
    if (mutation.current) return;
    setEditingId(null);
    setEditDraft('');
    setEditError('');
  };

  const saveEdit = async (item: AdminTodo) => {
    if (!isValidAdminTodoContent(editDraft) || mutation.current) {
      if (!isValidAdminTodoContent(editDraft)) setEditError('請輸入 1～100 字的代辦事項');
      return;
    }
    setEditError('');
    await runMutation({ kind: 'edit', id: item.id }, async () => {
      try {
        const updated = await updateAdminTodo(client, item.id, editDraft.trim());
        if (!mounted.current) return;
        setItems((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
        setEditingId(null);
        setEditDraft('');
        setFeedback('代辦事項已更新');
      } catch (cause) {
        if (mounted.current) setEditError(formatAdminTodoError(cause, '儲存失敗，草稿已保留，請再試一次'));
      }
    });
  };

  const onEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, item: AdminTodo) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void saveEdit(item);
    }
  };

  const remove = async (item: AdminTodo) => {
    if (mutation.current || !canDeleteAdminTodo(item, admin)) return;
    mutation.current = true;
    setBusy({ kind: 'confirm', id: item.id });
    setFeedback('');
    const confirmed = await requestConfirmation({
      title: '確認刪除代辦事項',
      message: `「${item.content}」刪除後無法復原。`,
      confirmLabel: '確認刪除',
      tone: 'danger',
    });
    if (!confirmed) {
      mutation.current = false;
      if (mounted.current) setBusy(null);
      return;
    }
    setBusy({ kind: 'delete', id: item.id });
    try {
      await deleteAdminTodo(client, item.id);
      if (!mounted.current) return;
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setFeedback('代辦事項已刪除');
    } catch (cause) {
      if (mounted.current) setFeedback(formatAdminTodoError(cause, '刪除失敗，代辦事項仍保留，請再試一次'));
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  const draftInvalid = draftTouched && !isValidAdminTodoContent(draft);
  const createBusy = busy?.kind === 'create';

  return (
    <div className="adminTodos" aria-labelledby="admin-todos-heading">
      <section className="adminTodosComposer">
        <div className="adminTodosHeadingRow">
          <div>
            <h1 id="admin-todos-heading">代辦事項</h1>
            <p>所有管理員共用；只能編輯自己的留言。</p>
          </div>
          <span>{items.length} 則</span>
        </div>
        <form noValidate onSubmit={submitCreate}>
          <label htmlFor="admin-todo-content">新增代辦</label>
          <textarea
            id="admin-todo-content"
            rows={3}
            maxLength={100}
            value={draft}
            onBlur={() => setDraftTouched(true)}
            onChange={(event) => {
              setDraft(event.target.value);
              if (draftTouched) setFormError('');
            }}
            aria-invalid={draftInvalid || Boolean(formError)}
            aria-describedby="admin-todo-content-help"
            disabled={Boolean(busy)}
          />
          <div className="adminTodosFormFooter">
            <p id="admin-todo-content-help" className={formError ? 'adminTodosInlineError' : ''} role={formError ? 'alert' : undefined}>
              {formError || '限 100 字，送出後會記錄建立時間。'}
            </p>
            <span aria-live="polite">{adminTodoCharacterCount(draft)}/100</span>
            <button
              className="primary adminTodosPrimaryButton"
              type="submit"
              disabled={Boolean(busy) || !isValidAdminTodoContent(draft)}
              aria-busy={createBusy}
            >
              {createBusy ? '建立中…' : '建立'}
            </button>
          </div>
        </form>
      </section>

      <div className="adminTodosFeedback" aria-live="polite">{feedback}</div>

      {loading && items.length === 0 && <div className="adminTodosState" role="status">代辦事項讀取中…</div>}
      {loadError && (
        <div className="adminTodosState adminTodosStateError" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={() => { void load(); }} disabled={loading}>重新讀取</button>
        </div>
      )}
      {!loading && !loadError && items.length === 0 && (
        <div className="adminTodosState">目前沒有代辦事項，可以從上方新增。</div>
      )}

      {items.length > 0 && (
        <div className="adminTodosList" aria-label="代辦事項清單">
          {items.map((item) => {
            const editing = editingId === item.id;
            const editBusy = busy?.kind === 'edit' && busy.id === item.id;
            const deleteBusy = (busy?.kind === 'delete' || busy?.kind === 'confirm') && busy.id === item.id;
            return (
              <article className="adminTodoCard" key={item.id}>
                <div className="adminTodoMeta">
                  <strong>{item.authorName}</strong>
                  <time dateTime={item.createdAt}>{formatAdminDateTime(item.createdAt)}</time>
                </div>
                {editing ? (
                  <form noValidate onSubmit={(event) => { event.preventDefault(); void saveEdit(item); }}>
                    <label className="adminTodosVisuallyHidden" htmlFor={`admin-todo-edit-${item.id}`}>編輯代辦事項</label>
                    <textarea
                      autoFocus
                      id={`admin-todo-edit-${item.id}`}
                      rows={3}
                      maxLength={100}
                      value={editDraft}
                      onChange={(event) => { setEditDraft(event.target.value); setEditError(''); }}
                      onKeyDown={(event) => onEditKeyDown(event, item)}
                      aria-invalid={Boolean(editError) || !isValidAdminTodoContent(editDraft)}
                      aria-describedby={`admin-todo-edit-help-${item.id}`}
                      disabled={editBusy}
                    />
                    <div className="adminTodosEditFooter">
                      <p id={`admin-todo-edit-help-${item.id}`} className={editError ? 'adminTodosInlineError' : ''} role={editError ? 'alert' : undefined}>
                        {editError || `${adminTodoCharacterCount(editDraft)}/100`}
                      </p>
                      <div className="adminTodoActions">
                        <button type="button" onClick={cancelEdit} disabled={editBusy}>取消</button>
                        <button className="primary" type="submit" disabled={editBusy || !isValidAdminTodoContent(editDraft)} aria-busy={editBusy}>
                          {editBusy ? '儲存中…' : '儲存'}
                        </button>
                      </div>
                    </div>
                  </form>
                ) : (
                  <p className="adminTodoContent">{item.content}</p>
                )}
                {!editing && (canEditAdminTodo(item, admin) || canDeleteAdminTodo(item, admin)) && (
                  <div className="adminTodoActions">
                    {canEditAdminTodo(item, admin) && (
                      <button type="button" onClick={() => beginEdit(item)} disabled={Boolean(busy)}>
                        <Pencil size={14} aria-hidden="true" />編輯
                      </button>
                    )}
                    {canDeleteAdminTodo(item, admin) && (
                      <button className="adminTodoDelete" type="button" onClick={() => { void remove(item); }} disabled={Boolean(busy)} aria-busy={deleteBusy}>
                        <Trash2 size={14} aria-hidden="true" />{deleteBusy ? '處理中…' : '刪除'}
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
