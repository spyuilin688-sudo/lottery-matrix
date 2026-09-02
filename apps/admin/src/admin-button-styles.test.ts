import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const operationsCss = readFileSync(new URL('./admin-operations.css', import.meta.url), 'utf8');
const adminCss = readFileSync(new URL('./admin.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./AdminApp.tsx', import.meta.url), 'utf8');
const rule = (css: string, selector: string) => css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

describe('admin interface styles', () => {
  it('keeps primary action buttons visible inside form action rows', () => {
    expect(rule(operationsCss, '.formActions .primary')).toMatch(/background\s*:/);
    expect(rule(operationsCss, '.formActions .primary')).toMatch(/color\s*:\s*#111/);
  });

  it('uses compact vertical spacing from the single shared table rule', () => {
    expect(rule(adminCss, 'th')).toMatch(/padding\s*:\s*8px 12px/);
    expect(rule(adminCss, 'td')).toMatch(/padding\s*:\s*6px 12px/);
    expect(rule(operationsCss, '.tableWrap th')).toBe('');
    expect(rule(operationsCss, '.tableWrap td')).toBe('');
  });

  it('shrinks management controls and every list action to the approved sizes', () => {
    expect(rule(operationsCss, '.managementToolbar input')).toMatch(/height\s*:\s*32px/);
    expect(rule(operationsCss, '.managementToolbar select')).toMatch(/height\s*:\s*32px/);
    expect(rule(operationsCss, '.compactButton')).toMatch(/height\s*:\s*30px/);
    expect(rule(adminCss, '.rowActions button')).toMatch(/width\s*:\s*32px/);
  });

  it('does not pin the final management-list column', () => {
    expect(rule(operationsCss, '.managementList th:last-child')).toBe('');
    expect(rule(operationsCss, '.managementList td:last-child')).toBe('');
  });

  it('uses a narrow mobile drawer with an outside-click backdrop and no header refresh action', () => {
    expect(adminCss).toMatch(/\.side\{position:fixed;left:-234px;width:220px/);
    expect(appSource).toContain('aria-label="關閉功能選單"');
    expect(appSource).toContain('onClick={() => setDrawer(false)}');
    expect(appSource).not.toContain('title="重新整理"');
  });

  it('gives the activation-code delete action an accessible name', () => {
    expect(appSource).toContain('aria-label={`刪除啟動碼 ${text(r.code)}`}');
  });

  it('renders the shared confirmation dialog above other dialogs', () => {
    expect(rule(operationsCss, '.confirmationBackdrop')).toMatch(/z-index\s*:\s*60/);
    expect(rule(operationsCss, '.confirmationDialog')).toMatch(/max-width\s*:\s*420px/);
  });

  it('keeps the approved notification manager reachable without adding broadcast controls', () => {
    expect(appSource).toContain('["通知管理", Bell]');
    expect(appSource).toContain('active === "通知管理"');
    expect(appSource).toContain('<NotificationManagement');
    expect(appSource).not.toContain('全體會員群發');
  });

  it('labels member and transfer rows with LINE names rather than LINE identifiers', () => {
    expect(appSource).toContain('"LINE名稱"');
    expect(appSource).toContain('lineDisplayName');
    expect(appSource).not.toContain('"LINE用戶ID"');
    expect(appSource).toContain('className="transferActions"');
    expect(appSource).toContain('className="transferReject"');
  });

  it('shows the confirmed revenue reset only to super administrators', () => {
    expect(appSource).toContain('<Revenue d={dash} isSuper={Boolean(isSuper)}');
    expect(appSource).toContain('title: "確認重設收入"');
    expect(appSource).toContain('message: "五項收入將歸零，付款紀錄仍會保留。"');
    expect(appSource).toContain('await api.post("/api/revenue/reset")');
    expect(appSource).toMatch(/function Revenue\([\s\S]*?isSuper && [<(][\s\S]*?重設收入/);
  });

  it('stacks notification controls and records without horizontal overflow on phones', () => {
    expect(adminCss).toMatch(/@media\(max-width:760px\)[\s\S]*\.notificationComposer\{grid-template-columns:1fr\}/);
    expect(adminCss).toMatch(/@media\(max-width:760px\)[\s\S]*\.notificationLogTable table\{[^}]*min-width:0/);
    expect(adminCss).toMatch(/@media\(max-width:760px\)[\s\S]*\.notificationLogTable td\{[^}]*overflow-wrap:anywhere/);
    expect(adminCss).not.toContain('.notificationLogCards');
  });
});