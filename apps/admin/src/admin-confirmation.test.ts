import { describe, expect, it, vi } from 'vitest';
import { runConfirmed } from './admin-confirmation';

describe('admin write confirmation', () => {
  it('does not run a write when the administrator cancels', async () => {
    const write = vi.fn(async () => undefined);

    await expect(runConfirmed(async () => false, write)).resolves.toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it('runs an approved write exactly once', async () => {
    let writes = 0;

    await expect(runConfirmed(async () => true, async () => { writes += 1; })).resolves.toBe(true);
    expect(writes).toBe(1);
  });
});
