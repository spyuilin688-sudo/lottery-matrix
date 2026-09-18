// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { installGlobalInputBehavior } from './input-behavior';

describe('active input behavior after record retirement', () => {
  it('selects the focused input and detaches the focus listener on cleanup', () => {
    const input = document.createElement('input');
    input.value = '筆記標題';
    document.body.append(input);
    const dispose = installGlobalInputBehavior();
    try {
      input.focus();
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, 4]);
      dispose();
      input.setSelectionRange(2, 2);
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      expect([input.selectionStart, input.selectionEnd]).toEqual([2, 2]);
    } finally { dispose(); input.remove(); }
  });

  it('does not retain global input/blur rewriting for retired record controls', () => {
    const legacy = document.createElement('div');
    legacy.className = 'note-number-group';
    legacy.innerHTML = '<input aria-label="投注號碼" value="77">';
    document.body.append(legacy);
    const input = legacy.querySelector('input')!;
    const dispose = installGlobalInputBehavior();
    try {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      expect(input.value).toBe('77');
    } finally { dispose(); legacy.remove(); }
  });
});
