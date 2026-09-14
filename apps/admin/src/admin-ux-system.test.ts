import { readFileSync } from 'node:fs';
import { parse } from 'postcss';
import { describe, expect, it } from 'vitest';

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
});
