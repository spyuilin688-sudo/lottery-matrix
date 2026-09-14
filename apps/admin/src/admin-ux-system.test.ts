import { readFileSync } from 'node:fs';
import { parse } from 'postcss';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('./AdminApp.tsx', import.meta.url), 'utf8');
const adminSource = readFileSync(new URL('./AdminTodos.tsx', import.meta.url), 'utf8');
const listControlsSource = readFileSync(new URL('./AdminListControls.tsx', import.meta.url), 'utf8');
const adminCss = readFileSync(new URL('./admin.css', import.meta.url), 'utf8');
const operationsCss = readFileSync(new URL('./admin-operations.css', import.meta.url), 'utf8');
const todoCss = readFileSync(new URL('./admin-todos.css', import.meta.url), 'utf8');

function declarations(css: string, selector: string) {
  const values = new Map<string, string>();
  parse(css).walkRules((rule) => {
    if (rule.selector !== selector) return;
    rule.walkDecls((declaration) => values.set(declaration.prop, declaration.value));
  });
  return values;
}

function declarationsAt(css: string, selector: string, width: number) {
  const values = new Map<string, string>();
  parse(css).walkRules((rule) => {
    if (rule.selector !== selector) return;
    const media = rule.parent?.type === 'atrule' ? rule.parent.params : '';
    const maximum = media.match(/max-width:\s*(\d+)px/)?.[1];
    const minimum = media.match(/min-width:\s*(\d+)px/)?.[1];
    if (maximum && width > Number(maximum)) return;
    if (minimum && width < Number(minimum)) return;
    rule.walkDecls((declaration) => values.set(declaration.prop, declaration.value));
  });
  return values;
}

describe('admin UX system pass', () => {
  it('keeps the todo composer concise, taller, and clearly separated from the list', () => {
    expect(adminSource).not.toContain('所有管理員共用；只能編輯自己的留言。');
    expect(adminSource).not.toMatch(/>新增代辦<\/label>/);
    expect(adminSource).toContain('className="adminTodosVisuallyHidden" htmlFor="admin-todo-content"');
    expect(adminSource).toContain('新增代辦事項</label>');
    expect(adminSource).toContain('className="adminTodosDivider"');

    expect(declarations(todoCss, '.adminTodosComposer textarea').get('min-height')).toBe('104px');
    const divider = declarations(todoCss, '.adminTodosDivider');
    expect(divider.get('height')).toBe('1px');
    expect(divider.get('margin')).toBe('12px 0');
    expect(divider.get('background')).toBe('#30333a');
  });

  it('keeps operational search cards limited to search, filters, and count', () => {
    expect(listControlsSource).toContain('managementPrimaryFilters');
    expect(listControlsSource).toContain('managementSearchField');
    expect(listControlsSource).toContain('managementCount');
    expect(listControlsSource).not.toContain('managementSecondaryFilters');
    expect(listControlsSource).not.toContain('type="date"');
    expect(listControlsSource).not.toContain('排序方向');
    expect(operationsCss).not.toContain('.managementSecondaryFilters');
    expect(operationsCss).not.toContain('.managementFilterLabel');
  });

  it('keeps search, status, plan, and count on one row at phone width', () => {
    expect(declarationsAt(operationsCss, '.managementPrimaryFilters.hasCount.hasStatusFilter', 390).get('grid-template-columns'))
      .toBe('minmax(0, 1fr) 88px max-content');
    expect(declarationsAt(operationsCss, '.managementPrimaryFilters.hasCount.hasStatusFilter.hasExtraFilter', 390).get('grid-template-columns'))
      .toBe('minmax(0, 1fr) 80px 80px max-content');
    expect(declarationsAt(operationsCss, '.managementSearchField', 390).get('grid-column')).toBeUndefined();
    expect(declarationsAt(operationsCss, '.managementCount', 390).get('min-width')).toBe('44px');
  });

  it('keeps every admin data table dense by scrolling horizontally instead of crushing records vertically', () => {
    const table = declarations(adminCss, 'table');
    const sharedCells = declarations(adminCss, ':is(th,td)');
    const bodyCells = declarations(adminCss, 'td');
    const headers = declarations(adminCss, 'th');
    const wrapper = declarations(adminCss, '.tableWrap');

    expect(wrapper.get('overflow')).toBe('auto');
    expect(table.get('width')).toBe('max-content');
    expect(table.get('min-width')).toBe('100%');
    expect(sharedCells.get('max-width')).toBe('none');
    expect(bodyCells.get('white-space')).toBe('nowrap');
    expect(bodyCells.get('overflow-wrap')).toBe('normal');
    expect(bodyCells.get('word-break')).toBe('normal');
    expect(bodyCells.get('line-height')).toBe('1.35');
    expect(headers.get('white-space')).toBe('nowrap');
    expect(declarations(operationsCss, '.activationDeleteRestriction').get('white-space')).toBe('normal');
    expect(adminCss).toMatch(/\.notificationLogTable td\{[^}]*white-space:normal/);
  });

  it('caps the first operational list column instead of wasting width on member names', () => {
    const firstColumn = declarations(operationsCss, '.managementToolbar + .managementList th:first-child,\n.managementToolbar + .managementList td:first-child');
    expect(firstColumn.get('width')).toBe('124px');
    expect(firstColumn.get('max-width')).toBe('124px');
    expect(declarations(operationsCss, '.managementList table').get('width')).toBe('max-content');
  });

  it('keeps page actions smaller than form confirmation and header touch targets', () => {
    const toolbarAction = declarations(adminCss, '.toolbar .primary');
    expect(toolbarAction.get('height')).toBe('30px');
    expect(toolbarAction.get('font-size')).toBe('12px');
    expect(declarations(adminCss, '.formActions button').get('min-height')).toBe('32px');
    expect(declarations(operationsCss, '.actions button,\n.menu').get('min-height')).toBe('40px');
  });

  it('uses an eight-pixel section rhythm for page toolbars, panels, and expandable forms', () => {
    expect(declarations(adminCss, '.toolbar').get('margin-bottom')).toBe('8px');
    expect(declarations(adminCss, '.toolbar').get('gap')).toBe('8px');
    expect(declarations(adminCss, '.panel').get('margin-top')).toBe('8px');
    expect(declarations(adminCss, '.formCard').get('margin-bottom')).toBe('8px');
  });

  it('keeps payment reversal heading compact and moves revenue reset into the chart panel header', () => {
    const reversalSummary = declarations(operationsCss, '.paymentReversalSummary');
    expect(reversalSummary.get('font-size')).toBe('13px');
    expect(reversalSummary.get('font-weight')).toBe('600');
    expect(appSource).toContain('className="revenueChartHeader"');
    expect(appSource).not.toContain('className="revenueActions"');
    expect(declarations(operationsCss, '.revenueChartHeader').get('display')).toBe('flex');
    expect(declarations(operationsCss, '.revenueResetButton').get('height')).toBe('28px');
  });
});