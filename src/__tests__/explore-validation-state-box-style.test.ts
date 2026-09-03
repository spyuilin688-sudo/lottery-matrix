// @vitest-environment node

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(new URL('../explore-result-preview.css', import.meta.url), 'utf8');
const stateRule = stylesheet.match(
  /\.explore-validation-number--source,\s*\.explore-validation-number--step,\s*\.explore-validation-number--hit\s*\{([\\s\\S]*?)\n\}/,
)?.[1] ?? '';

describe('Matrix 探索驗證顏色狀態框間距', () => {
  it('keeps the original horizontal inset, uses the requested vertical inset, and avoids fixed-size overrides', () => {
    expect(stateRule).toContain('padding-block: 0.3px;');
    expect(stateRule).toContain('padding-inline: 0.5px;');
    expect(stateRule).not.toContain('height: auto;');
    expect(stateRule).not.toContain('aspect-ratio: auto;');
    expect(stylesheet).not.toContain(
      '.explore-validation-group[data-wide-numbers="true"] .explore-validation-number--source,',
    );
  });
});
