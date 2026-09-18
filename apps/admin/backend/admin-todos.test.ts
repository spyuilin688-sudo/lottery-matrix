import { describe, expect, it } from 'vitest';
import { createAdminTodos } from './admin-todos';

type Row = {
  id: string;
  admin_id: string;
  content: string;
  created_at: string;
};

const actors = {
  owner: { id: 'admin-owner', account: 'owner@example.com', name: 'Owner', role: '營運管理員' },
  other: { id: 'admin-other', account: 'other@example.com', name: 'Other', role: '查看人員' },
  super: { id: 'admin-super', account: 'super@example.com', name: 'Super', role: '超級管理員' },
} as const;

function createStore(initialRows: Row[] = []) {
  const rows = initialRows.map((row) => ({ ...row }));
  const authors = new Map([
    [actors.owner.id, { name: actors.owner.name, account: actors.owner.account }],
    [actors.other.id, { name: actors.other.name, account: actors.other.account }],
    [actors.super.id, { name: actors.super.name, account: actors.super.account }],
  ]);
  let sequence = rows.length;

  const match = (query: string, row: Row) => {
    const id = /(?:^|&)id=eq\.([^&]+)/.exec(query)?.[1];
    const adminId = /(?:^|&)admin_id=eq\.([^&]+)/.exec(query)?.[1];
    return (!id || row.id === decodeURIComponent(id))
      && (!adminId || row.admin_id === decodeURIComponent(adminId));
  };

  return {
    rows,
    transport: {
      async selectRows(_table: string, query: string) {
        const selected = rows.filter((row) => match(query, row));
        if (query.includes('order=created_at.desc,id.desc')) {
          selected.sort((left, right) => right.created_at.localeCompare(left.created_at)
            || right.id.localeCompare(left.id));
        }
        return selected.map((row) => ({
          ...row,
          ...(query.includes('author:admin_accounts') ? { author: authors.get(row.admin_id) ?? null } : {}),
        }));
      },
      async insertRows(_table: string, records: unknown[]) {
        return records.map((record) => {
          const input = record as Pick<Row, 'admin_id' | 'content'>;
          const saved: Row = {
            id: `todo-${++sequence}`,
            admin_id: input.admin_id,
            content: input.content,
            created_at: `2026-09-04T0${sequence}:00:00.000Z`,
          };
          rows.push(saved);
          return { ...saved };
        });
      },
      async updateRows(_table: string, query: string, record: unknown) {
        const found = rows.find((row) => match(query, row));
        if (!found) return [];
        Object.assign(found, record);
        return [{ ...found }];
      },
      async deleteRows(_table: string, query: string) {
        const index = rows.findIndex((row) => match(query, row));
        if (index < 0) return [];
        return rows.splice(index, 1);
      },
    },
  };
}

const row = (
  id: string,
  adminId: string,
  content: string,
  createdAt: string,
): Row => ({ id, admin_id: adminId, content, created_at: createdAt });

describe('createAdminTodos', () => {
  it('lists newest todos first and exposes only safe author information', async () => {
    const store = createStore([
      row('todo-old', actors.owner.id, '較早', '2026-09-04T01:00:00.000Z'),
      row('todo-new', actors.other.id, '較新', '2026-09-04T02:00:00.000Z'),
    ]);

    await expect(createAdminTodos(store.transport).list()).resolves.toEqual([
      {
        id: 'todo-new', admin_id: actors.other.id, author_name: 'Other', content: '較新',
        created_at: '2026-09-04T02:00:00.000Z',
      },
      {
        id: 'todo-old', admin_id: actors.owner.id, author_name: 'Owner', content: '較早',
        created_at: '2026-09-04T01:00:00.000Z',
      },
    ]);
  });

  it('trims content and always stores the credential-session administrator', async () => {
    const store = createStore();
    const todos = createAdminTodos(store.transport);

    await todos.create('  由本人建立  ', actors.owner);

    expect(store.rows).toEqual([
      expect.objectContaining({ admin_id: actors.owner.id, content: '由本人建立' }),
    ]);
  });

  it.each(['   ', '\n\t', '字'.repeat(101)])('rejects invalid 1 to 100 character content: %j', async (content) => {
    const store = createStore();
    await expect(createAdminTodos(store.transport).create(content, actors.owner)).rejects.toMatchObject({
      statusCode: 400,
      message: '代辦事項限 1～100 字',
    });
    expect(store.rows).toHaveLength(0);
  });

  it('allows the owner to update content without changing its creation time', async () => {
    const createdAt = '2026-09-04T01:00:00.000Z';
    const store = createStore([row('todo-1', actors.owner.id, '原內容', createdAt)]);

    await expect(createAdminTodos(store.transport).update('todo-1', '  新內容  ', actors.owner)).resolves.toEqual({
      id: 'todo-1', admin_id: actors.owner.id, author_name: 'Owner', content: '新內容', created_at: createdAt,
    });
    expect(store.rows[0].created_at).toBe(createdAt);
  });

  it('rejects another administrator updating the todo', async () => {
    const store = createStore([row('todo-1', actors.owner.id, '原內容', '2026-09-04T01:00:00.000Z')]);

    await expect(createAdminTodos(store.transport).update('todo-1', '越權修改', actors.other)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(store.rows[0].content).toBe('原內容');
  });

  it('lets the owner delete a todo', async () => {
    const store = createStore([row('todo-1', actors.owner.id, '本人留言', '2026-09-04T01:00:00.000Z')]);

    await expect(createAdminTodos(store.transport).remove('todo-1', actors.owner)).resolves.toEqual({ id: 'todo-1' });
    expect(store.rows).toHaveLength(0);
  });

  it('rejects another administrator deleting a todo', async () => {
    const store = createStore([row('todo-1', actors.owner.id, '他人留言', '2026-09-04T01:00:00.000Z')]);

    await expect(createAdminTodos(store.transport).remove('todo-1', actors.other)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(store.rows).toHaveLength(1);
  });

  it('lets a super administrator delete another administrator todo', async () => {
    const store = createStore([row('todo-1', actors.owner.id, '他人留言', '2026-09-04T01:00:00.000Z')]);

    await expect(createAdminTodos(store.transport).remove('todo-1', actors.super)).resolves.toEqual({ id: 'todo-1' });
    expect(store.rows).toHaveLength(0);
  });

  it.each([
    ['update', (todos: ReturnType<typeof createAdminTodos>) => todos.update('missing', '內容', actors.owner)],
    ['delete', (todos: ReturnType<typeof createAdminTodos>) => todos.remove('missing', actors.owner)],
  ])('returns 404 when %s targets a missing todo', async (_operation, invoke) => {
    const todos = createAdminTodos(createStore().transport);
    await expect(invoke(todos)).rejects.toMatchObject({ statusCode: 404 });
  });
});
