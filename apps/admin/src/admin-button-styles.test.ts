import { readFileSync } from 'node:fs';
import { parse } from 'postcss';
import { describe, expect, it } from 'vitest';

const operationsCss = readFileSync(new URL('./admin-operations.css', import.meta.url), 'utf8');
const adminCss = readFileSync(new URL('./admin.css', import.meta.url), 'utf8');
const statusCss = readFileSync(new URL('./system-status.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./AdminApp.tsx', import.meta.url), 'utf8');
const rule = (css: string, selector: string) => css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
const statusStyles = parse(statusCss);
const statusDeclarationsAt = (selector: string, viewportWidth: number) => {
  const declarations = new Map<string, string>();
  statusStyles.walkRules(selector, (statusRule) => {
    const media = statusRule.parent?.type === 'atrule' && statusRule.parent.name === 'media'
      ? statusRule.parent.params
      : '';
    const minimum = media.match(/min-width:\s*(\d+)px/)?.[1];
    const maximum = media.match(/max-width:\s*(\d+)px/)?.[1];
    if (minimum && viewportWidth < Number(minimum)) return;
    if (maximum && viewportWidth > Number(maximum)) return;
    statusRule.walkDecls((declaration) => {
      declarations.set(declaration.prop, declaration.value);
    });
  });
  return declarations;
};

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
    expect(rule(operationsCss, '.compactButton')).toMatch(/height\s*:\s*32px/);
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

  it('renders grouped semantic system status rows instead of legacy cards', () => {
    expect(appSource).toContain('groupSystemStatusItems(items).map');
    expect(appSource).toContain('<section className="statusGroup"');
    expect(appSource).toContain('<header className="statusGroupHeader">');
    expect(appSource).toContain('<article className="statusRow"');
    expect(appSource).not.toContain('className="statusCards"');
    expect(appSource).not.toContain('className="statusCard"');
  });

  it('keeps semantic status headers in normal flow despite the admin shell header rule', () => {
    expect(rule(statusCss, '.systemStatusHeader')).toMatch(/position: static;/);
    expect(rule(statusCss, '.systemStatusHeader')).toMatch(/min-height: 0;/);
    expect(rule(statusCss, '.statusGroupHeader')).toMatch(/position: static;/);
    expect(rule(statusCss, '.statusGroupHeader')).toMatch(/min-height: 0;/);
  });

  it('shows complete row diagnostics and explicit watchdog cadence', () => {
    for (const label of ['statusDescription', 'API 位址', '回應代碼', '檢查時間', '回應時間', '監控完成時間', '執行頻率', '檢查設定']) {
      expect(appSource).toContain(label);
    }
    expect(appSource).toContain('每 10 分鐘');
    expect(appSource).toContain('6 分鐘／50 次、10 分鐘／60 次、30 分鐘／18 次');
    expect(appSource).toContain('detail?.completedAt');
  });

  it('renders GitHub API health separately from read-only workflow facts', () => {
    expect(appSource).toContain('<details className="statusDetails">');
    expect(appSource).toContain('getGithubStatusFacts(item).map');
    expect(appSource).not.toContain('dispatchGithub');
    expect(appSource).not.toContain('retryGithub');
  });

  it('renders limited evidence neutrally and includes the check scope in each row', () => {
    expect(appSource).toContain('const presentation = getSystemStatusPresentation(item)');
    expect(appSource).toContain('className={`statusBadge ${presentation.tone}`}');
    expect(appSource).toContain('className="statusScope">{presentation.scope}');
    expect(appSource).toContain('項僅部分檢查');
    expect(rule(statusCss, '.statusState .statusBadge.limited')).toContain('color: #9dcfff;');
    expect(rule(statusCss, '.statusRowTitle')).toContain('grid-template-columns: minmax(0, 1fr) auto;');
    expect(rule(statusCss, '.statusState .statusBadge')).toContain('font-size: 11px;');
    expect(rule(statusCss, '.statusState .statusBadge')).toContain('padding: 2px 6px;');
  });

  it('keeps retry and permission-gated crawler refresh actions identifiable', () => {
    expect(appSource).toContain('<SystemSettings canEdit={can("edit")} confirm={requestConfirmation} />');
    expect(appSource).toContain('canRefreshCrawler(item, canEdit)');
    expect(appSource).toContain('refreshCrawlerSystemStatus(api, item.id)');
    expect(appSource).toContain('重新呼叫 Railway');
    expect(appSource).toContain('手動更新開獎資料');
  });

  it('connects successful status actions to the shared live notice and stable focus target', () => {
    expect(appSource).toContain('<div className="systemStatusNotice" role="status">');
    expect(appSource).toContain('setStatusNotice(`${next.name} 重新呼叫完成，API 連線${next.ok ? "正常" : "仍為異常"}`)');
    expect(appSource).toContain('focusSystemStatusAfterAction(statusSectionRef.current, focusRequest.id, focusRequest.outcome)');
    expect(appSource).toContain('setFocusRequest({ id: item.id, outcome: "partial-success" })');
    expect(appSource).toContain('data-status-id={item.id} tabIndex={-1}');
  });

  it('neutralizes the shell header into the compact inline mobile layout at 320, 390, and 430px', () => {
    for (const viewportWidth of [320, 390, 430]) {
      const header = statusDeclarationsAt('.systemStatusHeader', viewportWidth);
      expect(header.get('width')).toBe('100%');
      expect(header.get('display')).toBe('grid');
      expect(header.get('grid-template-columns')).toBe('minmax(0, 1fr) auto');
      expect(header.get('justify-content')).toBe('stretch');
      expect(header.get('align-items')).toBe('center');
      expect(statusDeclarationsAt('.systemStatusHeader button', viewportWidth).get('width')).toBe('auto');
    }
  });

  it('switches the system status header and action back to desktop layout at 761px', () => {
    const header = statusDeclarationsAt('.systemStatusHeader', 761);
    expect(header.get('display')).toBe('flex');
    expect(header.get('align-items')).toBe('flex-end');
    expect(header.get('justify-content')).toBe('space-between');
    expect(statusDeclarationsAt('.systemStatusHeader button', 761).get('width')).toBe('auto');
  });

  it('keeps status row actions content width and copy wrap-safe on phones', () => {
    expect(rule(statusCss, '.statusRowActions button')).toMatch(/width: auto;/);
    expect(statusCss).toMatch(/@media \(min-width: 761px\)/);
    expect(statusCss).toMatch(/\.statusRowTitle b \{[^}]*overflow-wrap: anywhere;/);
  });
});
