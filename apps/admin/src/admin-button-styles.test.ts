import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin button styles', () => {
  it('keeps primary action buttons visible inside form action rows', () => {
    const css = readFileSync(new URL('./admin-operations.css', import.meta.url), 'utf8');
    const rule = css.match(/\.formActions \.primary\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(rule).toMatch(/background\s*:/);
    expect(rule).toMatch(/color\s*:\s*#111/);
  });
});
