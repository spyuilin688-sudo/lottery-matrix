import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./admin-operations.css', import.meta.url), 'utf8');
const rule = (selector: string) => css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

describe('admin interface styles', () => {
  it('keeps primary action buttons visible inside form action rows', () => {
    expect(rule('.formActions .primary')).toMatch(/background\s*:/);
    expect(rule('.formActions .primary')).toMatch(/color\s*:\s*#111/);
  });

  it('uses one readable hierarchy for table headers and table data', () => {
    expect(rule('.tableWrap th')).toMatch(/font-size\s*:\s*12px/);
    expect(rule('.tableWrap td')).toMatch(/font-size\s*:\s*13px/);
    expect(rule('.tableWrap td')).toMatch(/padding\s*:\s*12px 14px/);
  });

  it('gives controls and row actions consistent touch sizes', () => {
    expect(rule('.managementToolbar input')).toMatch(/min-height\s*:\s*42px/);
    expect(rule('.compactButton')).toMatch(/min-height\s*:\s*36px/);
    expect(rule('.rowActions button')).toMatch(/width\s*:\s*36px/);
  });

  it('renders the shared confirmation dialog above other dialogs', () => {
    expect(rule('.confirmationBackdrop')).toMatch(/z-index\s*:\s*60/);
    expect(rule('.confirmationDialog')).toMatch(/max-width\s*:\s*420px/);
  });
});
