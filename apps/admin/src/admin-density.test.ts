import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const adminCss = readFileSync(new URL('./admin.css', import.meta.url), 'utf8');
const operationsCss = readFileSync(new URL('./admin-operations.css', import.meta.url), 'utf8');
const statusCss = readFileSync(new URL('./system-status.css', import.meta.url), 'utf8');

describe('admin compact density', () => {
  it('keeps the sticky title bar compact while content remains centered', () => {
    expect(adminCss).toMatch(/header\{min-height:52px;height:auto;/);
    expect(adminCss).toMatch(/header\{[^}]*align-items:center/);
  });

  it('reduces overview and revenue card height at desktop and mobile widths', () => {
    expect(operationsCss).toMatch(/\.metric \{ min-height: 82px; padding: 12px;/);
    expect(operationsCss).toMatch(/@media \(max-width: 760px\)[\s\S]*\.metric \{ min-height: 78px; padding: 12px; \}/);
  });

  it('keeps user and subscription search cards compact', () => {
    expect(operationsCss).toMatch(/\.managementToolbar \{[\s\S]*?margin-bottom: 8px;[\s\S]*?padding: 6px;/);
    expect(operationsCss).toMatch(/\.managementToolbar input \{ height: 32px; \}/);
    expect(operationsCss).toMatch(/\.managementToolbar select \{ height: 32px; \}/);
  });

  it('compacts transfer requests without shrinking text actions into square buttons', () => {
    expect(operationsCss).toMatch(/\.transferPanel \{[^}]*margin-top: 10px;/);
    expect(operationsCss).toMatch(/\.panel\.transferPanel \{[^}]*padding: 10px;/);
    expect(operationsCss).toMatch(/\.transferRow \{[^}]*gap: 8px;[^}]*padding: 8px 0;/);
    expect(operationsCss).toMatch(/\.transferActions button \{[^}]*width: auto;[^}]*min-width: 52px;[^}]*white-space: nowrap;/);
    expect(operationsCss).toMatch(/@media \(max-width: 760px\)[\s\S]*\.transferRow \.transferActions \{[^}]*display: flex;[^}]*flex-wrap: nowrap;/);
  });

  it('uses grouped compact system status rows without fixed row geometry', () => {
    expect(statusCss).toMatch(/\.statusGroups \{[^}]*gap: 12px;/);
    expect(statusCss).toMatch(/\.statusRows \{[^}]*gap: 1px;/);
    expect(statusCss).toMatch(/\.statusRow \{[^}]*padding: 10px 12px;/);
    expect(statusCss).toMatch(/\.statusEndpoint \{[^}]*overflow-wrap: anywhere;/);
    expect(statusCss).not.toMatch(/\.statusRow \{[^}]*(?:height|min-height|width):/);
    expect(statusCss).not.toMatch(/\.statusManualRefreshButton \{[^}]*min-inline-size:/);
  });

  it('uses compact shared action controls and reduced administration spacing', () => {
    expect(operationsCss).toMatch(/\.compactButton \{ height: 30px;/);
    expect(operationsCss).toMatch(/\.pagination button \{ min-width: 32px; min-height: 32px; \}/);
    expect(operationsCss).toMatch(/\.content \{ padding: 16px; \}/);
    expect(operationsCss).toMatch(/\.actions \{ gap: 6px; \}/);
  });
});
