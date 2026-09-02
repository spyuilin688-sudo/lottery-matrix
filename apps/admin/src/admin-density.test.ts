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

  it('reduces system service card spacing without fixed description height', () => {
    expect(statusCss).toMatch(/\.statusCards \{[^}]*gap: 8px;/);
    expect(statusCss).toMatch(/\.statusCard \{[^}]*padding: 10px;/);
    expect(statusCss).toMatch(/\.statusCard p \{[^}]*margin: 6px 0;/);
    expect(statusCss).not.toMatch(/\.statusCard p \{[^}]*min-height:/);
    expect(statusCss).toMatch(/\.statusMeta \{[^}]*padding: 5px 0;/);
  });

  it('uses compact shared action controls and reduced administration spacing', () => {
    expect(operationsCss).toMatch(/\.compactButton \{ height: 30px;/);
    expect(operationsCss).toMatch(/\.pagination button \{ min-width: 32px; min-height: 32px; \}/);
    expect(operationsCss).toMatch(/\.content \{ padding: 16px; \}/);
    expect(operationsCss).toMatch(/\.actions \{ gap: 6px; \}/);
  });
});
