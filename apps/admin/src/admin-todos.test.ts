import { describe, expect, it, vi } from 'vitest';
import {
  canDeleteAdminTodo,
  canEditAdminTodo,
  createAdminTodo,
  deleteAdminTodo,
  listAdminTodos,
  normalizeAdminTodo,
  updateAdminTodo,
} from './admin-todos';

const snakeTodo = {
  id: 'todo-1',
  admin_id: 'admin-1',
  author_name: '管理員一',
  content: '確認今日資料',
  created_at: '2026-09-04T07:30:00.000Z',
};

describe('admin todo client', () => {
  it('normalizes the backend todo envelope into the UI model', () => {
    expect(normalizeAdminTodo(snakeTodo)).toEqual({
      id: 'todo-1',
      adminId: 'admin-1',
      authorName: '管理員一',
      content: '確認今日資料',
      createdAt: '2026-09-04T07:30:00.000Z',
    });
  });

  it('uses the four dedicated endpoints without sending administrator identity', async () => {
    const client = {
      get: vi.fn(async () => ({ data: { items: [snakeTodo] } })),
      post: vi.fn(async () => ({ data: { item: snakeTodo } })),
      put: vi.fn(async () => ({ data: { item: { ...snakeTodo, content: '已更新' } } })),
      delete: vi.fn(async () => ({ data: { deleted: true, id: 'todo-1' } })),
    };

    await expect(listAdminTodos(client)).resolves.toEqual([expect.objectContaining({ id: 'todo-1' })]);
    await expect(createAdminTodo(client, '確認今日資料')).resolves.toMatchObject({ id: 'todo-1' });
    await expect(updateAdminTodo(client, 'todo-1', '已更新')).resolves.toMatchObject({ content: '已更新' });
    await expect(deleteAdminTodo(client, 'todo-1')).resolves.toEqual({ id: 'todo-1' });

    expect(client.get).toHaveBeenCalledWith('/api/todos');
    expect(client.post).toHaveBeenCalledWith('/api/todos', { content: '確認今日資料' });
    expect(client.put).toHaveBeenCalledWith('/api/todos/todo-1', { content: '已更新' });
    expect(client.delete).toHaveBeenCalledWith('/api/todos/todo-1');
  });
});

describe('admin todo action permissions', () => {
  const todo = normalizeAdminTodo(snakeTodo);

  it('allows only the owner to edit', () => {
    expect(canEditAdminTodo(todo, { id: 'admin-1', role: '查看人員' })).toBe(true);
    expect(canEditAdminTodo(todo, { id: 'admin-2', role: '超級管理員' })).toBe(false);
  });

  it('allows the owner or a super administrator to delete', () => {
    expect(canDeleteAdminTodo(todo, { id: 'admin-1', role: '查看人員' })).toBe(true);
    expect(canDeleteAdminTodo(todo, { id: 'admin-2', role: '超級管理員' })).toBe(true);
    expect(canDeleteAdminTodo(todo, { id: 'admin-2', role: '營運管理員' })).toBe(false);
  });
});
