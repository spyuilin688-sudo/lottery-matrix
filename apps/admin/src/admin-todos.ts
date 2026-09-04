export type AdminTodo = {
  id: string;
  adminId: string;
  authorName: string;
  content: string;
  createdAt: string;
};

export type AdminTodoActor = {
  id: string;
  role: string;
};

export type AdminTodoApiClient = {
  get(url: string): Promise<{ data: unknown }>;
  post(url: string, data?: unknown): Promise<{ data: unknown }>;
  put(url: string, data?: unknown): Promise<{ data: unknown }>;
  delete(url: string): Promise<{ data: unknown }>;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {};
}

export function normalizeAdminTodo(value: unknown): AdminTodo {
  const item = record(value);
  return {
    id: String(item.id ?? ''),
    adminId: String(item.admin_id ?? item.adminId ?? ''),
    authorName: String(item.author_name ?? item.authorName ?? '管理員'),
    content: String(item.content ?? ''),
    createdAt: String(item.created_at ?? item.createdAt ?? ''),
  };
}

export function adminTodoCharacterCount(value: string) {
  return [...value].length;
}

export function isValidAdminTodoContent(value: string) {
  const content = value.trim();
  const length = adminTodoCharacterCount(content);
  return length >= 1 && length <= 100;
}

export function canEditAdminTodo(todo: AdminTodo, actor: AdminTodoActor) {
  return todo.adminId === actor.id;
}

export function canDeleteAdminTodo(todo: AdminTodo, actor: AdminTodoActor) {
  return todo.adminId === actor.id || actor.role === '超級管理員';
}

export async function listAdminTodos(client: Pick<AdminTodoApiClient, 'get'>) {
  const response = record((await client.get('/api/todos')).data);
  const items = Array.isArray(response.items) ? response.items : [];
  return items.map(normalizeAdminTodo);
}

export async function createAdminTodo(client: Pick<AdminTodoApiClient, 'post'>, content: string) {
  const response = record((await client.post('/api/todos', { content })).data);
  return normalizeAdminTodo(response.item);
}

export async function updateAdminTodo(
  client: Pick<AdminTodoApiClient, 'put'>,
  id: string,
  content: string,
) {
  const response = record((await client.put(`/api/todos/${encodeURIComponent(id)}`, { content })).data);
  return normalizeAdminTodo(response.item);
}

export async function deleteAdminTodo(client: Pick<AdminTodoApiClient, 'delete'>, id: string) {
  const response = record((await client.delete(`/api/todos/${encodeURIComponent(id)}`)).data);
  return { id: String(response.id ?? id) };
}

const safeErrors = new Set([
  '代辦事項限 1～100 字',
  '只能編輯自己的代辦事項',
  '只能刪除自己的代辦事項',
  '找不到此代辦事項',
]);

export function formatAdminTodoError(cause: unknown, fallback: string) {
  const value = cause as { message?: unknown; response?: { data?: unknown } };
  const envelope = record(value?.response?.data);
  const message = String(envelope.error ?? value?.message ?? '');
  return safeErrors.has(message) ? message : fallback;
}
