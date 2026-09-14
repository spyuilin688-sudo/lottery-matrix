import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'postcss';

const adminCss = readFileSync(new URL('./admin.css', import.meta.url), 'utf8');
const operationsCss = readFileSync(new URL('./admin-operations.css', import.meta.url), 'utf8');
const statusCss = readFileSync(new URL('./system-status.css', import.meta.url), 'utf8');

const profileCss = readFileSync(new URL('./profile-name.css', import.meta.url), 'utf8');
const declarationsAt = (css: string, selector: string, width: number) => {
  const values = new Map<string, string>();
  parse(css).walkRules(candidate => {
    if (candidate.selector !== selector) return;
    const media = candidate.parent?.type === 'atrule' ? candidate.parent.params : '';
    const maximum = media.match(/max-width:\s*(\d+)px/)?.[1];
    if (maximum && width > Number(maximum)) return;
    candidate.walkDecls(declaration => { values.set(declaration.prop, declaration.value); });
  });
  return values;
};

describe('admin compact density', () => {
  it('keeps profile dialog geometry in its component owner', () => {
    expect(declarationsAt(profileCss, '.nameDialog', 1000).get('padding')).toBe('14px');
    expect(declarationsAt(profileCss, '.nameDialog', 390).get('padding')).toBe('12px');
    expect(declarationsAt(profileCss, '.nameDialog input', 390).get('min-height')).toBe('34px');
    expect(declarationsAt(profileCss, '.nameDialog input', 390).get('padding')).toBe('6px 8px');
    expect(operationsCss).not.toMatch(/\.nameDialog(?: h2| input)?\s*\{/);
  });
  it('keeps the sticky title bar compact while content remains centered', () => {
    expect(adminCss).toMatch(/header\{min-height:46px;height:auto;/);
    expect(adminCss).toMatch(/header\{[^}]*align-items:center/);
  });

  it('reduces overview and revenue card height at desktop and mobile widths', () => {
    for (const width of [320, 390, 430, 761]) {
      expect(declarationsAt(adminCss, '.metric', width).get('min-height')).toBe('60px');
      expect(declarationsAt(adminCss, '.metric', width).get('padding')).toBe(width <= 760 ? '8px' : '8px 10px');
      expect(declarationsAt(adminCss, '.metric strong', width).get('font-size')).toBe('22px');
    }
    expect(operationsCss).not.toMatch(/\.metric\s*\{/);
  });

  it('separates overview groups with 8px grid gaps and keeps the record count inline', () => {
    expect(declarationsAt(adminCss, '.cards', 390).get('gap')).toBe('8px');
    expect(declarationsAt(adminCss, '.cards', 1000).get('gap')).toBe('8px');
    expect(operationsCss).toMatch(/\.metricDivider \{ grid-column: 1 \/ -1; height: 1px; margin: 0;/);
    expect(operationsCss).toContain('grid-template-columns: minmax(0, 1fr) 92px minmax(64px, max-content)');
    expect(operationsCss).toContain('.managementToolbar span { grid-column: auto; }');
    expect(operationsCss).toMatch(/\.managementCount \{[^}]*min-width: 64px;[^}]*text-align: right;/);
  });

  it('keeps user and subscription search cards compact', () => {
    expect(operationsCss).toMatch(/\.managementToolbar \{[\s\S]*?margin-bottom: 8px;[\s\S]*?padding: 6px;/);
    expect(operationsCss).toMatch(/\.managementToolbar input \{ height: 32px; \}/);
    expect(operationsCss).toMatch(/\.managementToolbar select \{ height: 32px; \}/);
  });

  it('compacts transfer requests without shrinking text actions into square buttons', () => {
    expect(operationsCss).toMatch(/\.transferPanel \{[^}]*margin-top: 8px;/);
    expect(operationsCss).toMatch(/\.panel\.transferPanel \{[^}]*padding: 8px 10px;/);
    expect(operationsCss).toMatch(/\.transferPanel h2 \{[^}]*margin: 0 0 4px;/);
    expect(operationsCss).toMatch(/\.transferRow \{[^}]*gap: 6px;[^}]*padding: 5px 0;/);
    expect(operationsCss).toMatch(/\.transferRow > div:first-child \{[^}]*gap: 2px;/);
    expect(operationsCss).toMatch(/\.transferActions button \{[^}]*width: auto;[^}]*min-width: 52px;[^}]*white-space: nowrap;/);
    expect(operationsCss).toMatch(/@media \(max-width: 760px\)[\s\S]*\.transferRow > div:first-child \{[^}]*grid-row: 1 \/ span 2;/);
    expect(operationsCss).toMatch(/@media \(max-width: 760px\)[\s\S]*\.transferRow \.transferActions \{[^}]*grid-column: 2;[^}]*grid-row: 2;/);
  });

  it('uses grouped compact system status rows without fixed row geometry', () => {
    expect(statusCss).toMatch(/\.statusGroups \{[^}]*gap: 8px;/);
    expect(statusCss).toMatch(/\.statusRows \{[^}]*gap: 8px;/);
    expect(statusCss).toMatch(/\.statusRow \{[^}]*padding: 8px 10px;/);
    expect(statusCss).toMatch(/\.statusEndpoint \{[^}]*overflow-wrap: anywhere;/);
    expect(statusCss).not.toMatch(/\.statusRow \{[^}]*(?:height|min-height|width):/);
    expect(statusCss).not.toMatch(/\.statusManualRefreshButton \{[^}]*min-inline-size:/);
  });

  it('uses compact shared action controls and reduced administration spacing', () => {
    expect(operationsCss).toMatch(/\.compactButton \{ height: 32px;/);
    const pagination = declarationsAt(operationsCss, '.pagination button', 390);
    expect(pagination.get('min-width')).toBe('0');
    expect(pagination.get('min-height')).toBe('30px');
    expect(declarationsAt(adminCss, '.content', 1000).get('padding')).toBe('14px');
    expect(declarationsAt(adminCss, '.content', 390).get('padding')).toBe('10px');
    expect(declarationsAt(adminCss, '.actions', 390).get('gap')).toBe('6px');
    expect(operationsCss).not.toMatch(/\.content\s*\{/);
  });
});
