import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const adminCss = readFileSync(new URL('./admin.css', import.meta.url), 'utf8');
const operationsCss = readFileSync(new URL('./admin-operations.css', import.meta.url), 'utf8');
const statusCss = readFileSync(new URL('./system-status.css', import.meta.url), 'utf8');

describe('admin compact density', () => {
  it('keeps the sticky title bar compact while content remains centered', () => {
    expect(adminCss).toMatch(/header\{min-height:46px;height:auto;/);
    expect(adminCss).toMatch(/header\{[^}]*align-items:center/);
  });

  it('reduces overview and revenue card height at desktop and mobile widths', () => {
    expect(operationsCss).toMatch(/\.metric \{ min-height: 60px; padding: 8px 10px;/);
    expect(operationsCss).toMatch(/@media \(max-width: 760px\)[\s\S]*\.metric \{ min-height: 60px; padding: 8px; \}/);
  });

  it('separates overview groups with 8px grid gaps and keeps the record count inline', () => {
    expect(operationsCss).toMatch(/\.cards \{ gap: 8px;/);
    expect(operationsCss).toMatch(/\.metricDivider \{ grid-column: 1 \/ -1; height: 1px; margin: 0;/);
    expect(operationsCss).toContain('grid-template-columns: minmax(0, 1fr) 94px auto');
    expect(operationsCss).toContain('.managementToolbar span { grid-column: auto; }');
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
    expect(statusCss).toMatch(/\.statusRows \{[^}]*gap: 1px;/);
    expect(statusCss).toMatch(/\.statusRow \{[^}]*padding: 8px 10px;/);
    expect(statusCss).toMatch(/\.statusEndpoint \{[^}]*overflow-wrap: anywhere;/);
    expect(statusCss).not.toMatch(/\.statusRow \{[^}]*(?:height|min-height|width):/);
    expect(statusCss).not.toMatch(/\.statusManualRefreshButton \{[^}]*min-inline-size:/);
  });

  it('uses compact shared action controls and reduced administration spacing', () => {
    expect(operationsCss).toMatch(/\.compactButton \{ height: 32px;/);
    expect(operationsCss).toMatch(/\.pagination button \{ min-width: 0; min-height: 30px;/);
    expect(operationsCss).toMatch(/\.content \{ padding: 14px; \}/);
    expect(operationsCss).toMatch(/\.actions \{ gap: 6px; \}/);
  });
});
