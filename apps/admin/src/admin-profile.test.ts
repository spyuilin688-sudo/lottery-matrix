import { describe, expect, it, vi } from 'vitest';
import { saveOwnAdminName } from './admin-profile';

describe('saveOwnAdminName', () => {
  it('sends the trimmed name to the current-administrator endpoint', async () => {
    const put = vi.fn(async () => ({
      data: { admin: { id: 'admin-1', name: '新的名稱' } },
    }));

    await expect(saveOwnAdminName({ put }, '  新的名稱  ')).resolves.toEqual({
      id: 'admin-1',
      name: '新的名稱',
    });
    expect(put).toHaveBeenCalledWith('/api/me/name', { name: '新的名稱' });
  });

  it('rejects an empty name without calling the API', async () => {
    const put = vi.fn();

    await expect(saveOwnAdminName({ put }, '   ')).rejects.toThrow('管理員名稱必填');
    expect(put).not.toHaveBeenCalled();
  });
});
