// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { focusSystemStatusAfterAction } from './system-status';

function renderStatusTarget(id = 'railway-health') {
  const section = document.createElement('section');
  section.tabIndex = -1;
  const row = document.createElement('article');
  row.tabIndex = -1;
  row.dataset.statusId = id;
  const action = document.createElement('button');
  action.textContent = '重新呼叫';
  row.append(action);
  section.append(row);
  document.body.append(section);
  action.focus();
  return { section, row, action };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('system status action focus', () => {
  it.each([
    ['Railway retry', 'success' as const],
    ['crawler refresh', 'success' as const],
    ['crawler refresh whose status reload failed', 'partial-success' as const],
  ])('moves focus to the surviving row after %s', (_label, outcome) => {
    const { section, row, action } = renderStatusTarget();
    action.remove();

    expect(focusSystemStatusAfterAction(section, 'railway-health', outcome)).toBe('row');
    expect(document.activeElement).toBe(row);
  });

  it('falls back to the focusable status section when the refreshed row no longer exists', () => {
    const { section, row } = renderStatusTarget();
    row.remove();

    expect(focusSystemStatusAfterAction(section, 'railway-health', 'success')).toBe('section');
    expect(document.activeElement).toBe(section);
  });

  it('preserves the original action focus after a failed request', () => {
    const { section, action } = renderStatusTarget();

    expect(focusSystemStatusAfterAction(section, 'railway-health', 'failure')).toBe('preserved');
    expect(document.activeElement).toBe(action);
  });
});
