// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminTodos } from './AdminTodos';
import type { AdminTodoApiClient } from './admin-todos';

const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'todo-1',
  admin_id: 'admin-owner',
  author_name: 'Owner',
  content: '原本內容',
  created_at: '2026-09-04T07:30:00.000Z',
  ...overrides,
});

function clientWith(items = [item()]): AdminTodoApiClient {
  return {
    get: vi.fn(async () => ({ data: { items } })),
    post: vi.fn(async (_url, data) => ({ data: { item: item({ id: 'todo-new', content: (data as { content: string }).content }) } })),
    put: vi.fn(async (_url, data) => ({ data: { item: item({ content: (data as { content: string }).content }) } })),
    delete: vi.fn(async () => ({ data: { deleted: true, id: 'todo-1' } })),
  };
}

function button(container: HTMLElement, label: string) {
  const found = Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.trim() === label);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Missing button: ${label}`);
  return found;
}

function setTextarea(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

describe('AdminTodos', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function render(client: AdminTodoApiClient, admin = { id: 'admin-owner', role: '營運管理員' }) {
    await act(async () => {
      root.render(<AdminTodos client={client} admin={admin} requestConfirmation={vi.fn(async () => true)} />);
    });
    await settle();
  }

  it('renders an app-validated compact form with a visible character count', async () => {
    await render(clientWith([]));

    const form = container.querySelector('form');
    const textarea = container.querySelector('textarea');
    const label = container.querySelector('label');
    expect(form?.noValidate).toBe(true);
    expect(textarea?.maxLength).toBe(100);
    expect(label?.htmlFor).toBe(textarea?.id);
    expect(container.textContent).toContain('0/100');
    expect(button(container, '建立').disabled).toBe(true);

    await act(async () => setTextarea(textarea as HTMLTextAreaElement, '待辦'));
    expect(container.textContent).toContain('2/100');
    expect(button(container, '建立').disabled).toBe(false);
  });

  it('shows edit/delete only for the owner and delete-only for a super administrator', async () => {
    const client = clientWith([
      item(),
      item({ id: 'todo-other', admin_id: 'admin-other', author_name: 'Other', content: '他人內容' }),
    ]);
    await render(client);

    const cards = container.querySelectorAll('article');
    expect(cards[0].querySelectorAll('button')).toHaveLength(2);
    expect(cards[1].querySelectorAll('button')).toHaveLength(0);

    await act(async () => {
      root.render(<AdminTodos client={client} admin={{ id: 'admin-super', role: '超級管理員' }} requestConfirmation={vi.fn(async () => false)} />);
    });
    expect(container.querySelectorAll('article')[0].querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelectorAll('article')[0].textContent).toContain('刪除');
  });

  it('blocks duplicate create submissions while preserving one stable busy action', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const client = clientWith([]);
    client.post = vi.fn(async (_url, data) => {
      await pending;
      return { data: { item: item({ id: 'todo-new', content: (data as { content: string }).content }) } };
    });
    await render(client);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => setTextarea(textarea, '只建立一次'));

    await act(async () => {
      button(container, '建立').click();
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[aria-busy="true"]')?.textContent).toContain('建立中');

    release();
    await settle();
    expect(container.textContent).toContain('只建立一次');
    expect(textarea.value).toBe('');
  });

  it('keeps an inline edit draft when the server rejects the save', async () => {
    const client = clientWith();
    client.put = vi.fn(async () => { throw new Error('network detail'); });
    await render(client);
    await act(async () => button(container, '編輯').click());
    const editTextarea = container.querySelector('article textarea') as HTMLTextAreaElement;
    await act(async () => setTextarea(editTextarea, '保留這份草稿'));
    await act(async () => button(container, '儲存').click());
    await settle();

    expect((container.querySelector('article textarea') as HTMLTextAreaElement).value).toBe('保留這份草稿');
    expect(container.querySelector('article [role="alert"]')?.textContent).toContain('儲存失敗');
  });

  it('uses the app confirmation contract before permanently deleting a todo', async () => {
    const client = clientWith();
    const requestConfirmation = vi.fn(async () => true);
    await act(async () => {
      root.render(<AdminTodos client={client} admin={{ id: 'admin-owner', role: '營運管理員' }} requestConfirmation={requestConfirmation} />);
    });
    await settle();
    await act(async () => button(container, '刪除').click());
    await settle();

    expect(requestConfirmation).toHaveBeenCalledWith({
      title: '確認刪除代辦事項',
      message: '「原本內容」刪除後無法復原。',
      confirmLabel: '確認刪除',
      tone: 'danger',
    });
    expect(client.delete).toHaveBeenCalledWith('/api/todos/todo-1');
    expect(container.textContent).not.toContain('原本內容');
  });
});
