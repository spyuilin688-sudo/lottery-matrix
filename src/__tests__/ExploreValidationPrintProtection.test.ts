// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

declare const process: { cwd(): string };

afterEach(() => document.querySelector('[data-explore-print-test]')?.remove());

describe('Matrix 探索驗證過程列印保護', () => {
  it('uses a scoped print rule that removes the complete validation card from printed output', () => {
    const path = `${process.cwd()}/src/explore-validation-protection.css`;
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;

    const style = document.createElement('style');
    style.dataset.explorePrintTest = 'true';
    style.textContent = readFileSync(path, 'utf8');
    document.head.append(style);

    const printRule = Array.from(style.sheet?.cssRules ?? [])
      .find((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule && rule.conditionText === 'print');

    expect(printRule).toBeDefined();
    if (!printRule) return;

    const validationRule = Array.from(printRule.cssRules)
      .find((rule): rule is CSSStyleRule => (
        rule instanceof CSSStyleRule
        && rule.selectorText.includes('.matrix-explore-main-screen:not(.explore-result-preview-screen) .explore-validation-card')
      ));

    expect(validationRule?.style.getPropertyValue('display')).toBe('none');

    const selectionRule = Array.from(style.sheet?.cssRules ?? [])
      .find((rule): rule is CSSStyleRule => (
        rule instanceof CSSStyleRule
        && rule.selectorText.includes('.matrix-explore-main-screen:not(.explore-result-preview-screen) .explore-validation-card')
        && rule.style.getPropertyValue('user-select') === 'none'
      ));
    expect(selectionRule).toBeDefined();
  });
});
