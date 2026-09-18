import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'postcss';

const adminCss = readFileSync(new URL('./admin.css', import.meta.url), 'utf8');
const operationsCss = readFileSync(new URL('./admin-operations.css', import.meta.url), 'utf8');
const profileCss = readFileSync(new URL('./profile-name.css', import.meta.url), 'utf8');

function declarationsAt(css: string, selector: string) {
  const values = new Map<string, string>();
  parse(css).walkRules((rule) => {
    if (rule.selector !== selector) return;
    rule.walkDecls((declaration) => values.set(declaration.prop, declaration.value));
  });
  return values;
}

describe('admin style ownership', () => {
  it('keeps shell header typography and action geometry in admin.css only', () => {
    const title = declarationsAt(adminCss, '.shell > main > header>div:nth-child(2) b');
    expect(title.get('font-size')).toBe('16px');
    expect(title.get('letter-spacing')).toBe('.02em');

    const actions = declarationsAt(adminCss, '.actions button,.menu');
    expect(actions.get('width')).toBe('40px');
    expect(actions.get('height')).toBe('40px');

    expect(operationsCss).not.toMatch(/header\s*>\s*div:nth-child\(2\)\s+b/);
    expect(operationsCss).not.toMatch(/\.actions button,\s*\n?\.menu\s*\{[^}]*min-(?:width|height)/);
  });

  it('keeps the shared modal backdrop in the shared admin stylesheet', () => {
    const backdrop = declarationsAt(adminCss, '.modalBackdrop');
    expect(backdrop.get('position')).toBe('fixed');
    expect(backdrop.get('inset')).toBe('0');
    expect(backdrop.get('z-index')).toBe('40');
    expect(backdrop.get('overflow-y')).toBe('auto');
    expect(profileCss).not.toMatch(/\.modalBackdrop\s*\{/);
  });

  it('keeps management errors in normal flow without compensation offsets', () => {
    const error = declarationsAt(operationsCss, '.managementToolbarError');
    expect(error.get('margin')).toBe('0 0 8px');
    expect(error.get('margin')).not.toMatch(/(^|\s)-/);
  });
});
