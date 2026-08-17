// @ts-ignore Node built-in is available in the test runtime but excluded from the app tsconfig types.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../FeaturePages.tsx', import.meta.url), 'utf8');

describe('Matrix 同星號碼輸入整合', () => {
  it('保留單獨輸入的 0，並使用共用 01-49 草稿清理規則', () => {
    expect(source).toContain('const nextValue = sanitizeReferenceNumber(rawValue);');
    expect(source).not.toContain('if (nextValue === "0") nextValue = "";');
  });
});
