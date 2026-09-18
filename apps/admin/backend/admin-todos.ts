type TodoTransport = {
  selectRows<T = unknown>(table: string, query: string): Promise<T[]>;
  insertRows<T = unknown>(table: string, rows: unknown[]): Promise<T[]>;
  updateRows<T = unknown>(table: string, query: string, record: unknown): Promise<T[]>;
  deleteRows<T = unknown>(table: string, query: string): Promise<T[]>;
};

export type TodoActor = {
  id: string;
  account?: string;
  name?: string;
  role?: string;
};

type TodoRow = {
  id?: unknown;
  admin_id?: unknown;
  content?: unknown;
  created_at?: unknown;
  author?: { name?: unknown; account?: unknown } | null;
};

export type AdminTodo = {
  id: string;
  admin_id: string;
  author_name: string;
  content: string;
  created_at: string;
};

export class AdminTodoError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'AdminTodoError';
    this.statusCode = statusCode;
  }
}

export function normalizeTodoContent(value: unknown) {
  const content = String(value ?? '').trim();
  if (!content || [...content].length > 100) {
    throw new AdminTodoError('代辦事項限 1～100 字', 400);
  }
  return content;
}

function safeTodo(row: TodoRow, actor?: TodoActor): AdminTodo {
  const authorName = String(
    row.author?.name
      || row.author?.account
      || actor?.name
      || actor?.account
      || '管理員',
  );
  return {
    id: String(row.id ?? ''),
    admin_id: String(row.admin_id ?? actor?.id ?? ''),
    author_name: authorName,
    content: String(row.content ?? ''),
    created_at: String(row.created_at ?? ''),
  };
}

export function createAdminTodos(transport: TodoTransport) {
  async function find(id: string) {
    const [item] = await transport.selectRows<TodoRow>(
      'admin_todos',
      `select=id,admin_id,content,created_at&id=eq.${encodeURIComponent(id)}&limit=1`,
    );
    if (!item) throw new AdminTodoError('找不到此代辦事項', 404);
    return item;
  }

  return {
    async list() {
      const rows = await transport.selectRows<TodoRow>(
        'admin_todos',
        'select=id,admin_id,content,created_at,author:admin_accounts!admin_todos_admin_id_fkey(name,account)&order=created_at.desc,id.desc',
      );
      return rows.map((row) => safeTodo(row));
    },

    async create(value: unknown, actor: TodoActor) {
      const content = normalizeTodoContent(value);
      const [created] = await transport.insertRows<TodoRow>('admin_todos', [{
        admin_id: actor.id,
        content,
      }]);
      if (!created) throw new AdminTodoError('建立代辦事項失敗', 500);
      return safeTodo(created, actor);
    },

    async update(id: string, value: unknown, actor: TodoActor) {
      const content = normalizeTodoContent(value);
      const before = await find(id);
      if (String(before.admin_id) !== actor.id) {
        throw new AdminTodoError('只能編輯自己的代辦事項', 403);
      }
      const [updated] = await transport.updateRows<TodoRow>(
        'admin_todos',
        `id=eq.${encodeURIComponent(id)}&admin_id=eq.${encodeURIComponent(actor.id)}`,
        { content },
      );
      if (!updated) throw new AdminTodoError('找不到此代辦事項', 404);
      return safeTodo(updated, actor);
    },

    async remove(id: string, actor: TodoActor) {
      const before = await find(id);
      const isOwner = String(before.admin_id) === actor.id;
      if (!isOwner && actor.role !== '超級管理員') {
        throw new AdminTodoError('只能刪除自己的代辦事項', 403);
      }
      const ownerFilter = actor.role === '超級管理員'
        ? ''
        : `&admin_id=eq.${encodeURIComponent(actor.id)}`;
      const [deleted] = await transport.deleteRows<TodoRow>(
        'admin_todos',
        `id=eq.${encodeURIComponent(id)}${ownerFilter}`,
      );
      if (!deleted) throw new AdminTodoError('找不到此代辦事項', 404);
      return { id: String(deleted.id) };
    },
  };
}
