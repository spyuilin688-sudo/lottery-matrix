import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('outstanding audit remediation contracts', () => {
  test('推薦碼 UX contract 反映現行 member_referral_submit，而不是宣告功能停用', () => {
    const contract = read('UX-CONTRACT.md');
    const referralRow = contract.split('\n').find((line) => line.includes('| Submit referral code |')) ?? '';

    expect(referralRow).toContain('member_referral_submit');
    expect(referralRow).toContain('推薦碼已儲存');
    expect(referralRow).not.toContain('Disabled because no mutation API is specified');
    expect(referralRow).not.toContain('No success is claimed');
  });

  test('matrix-core 保留相容路由但不保留不可達 MatrixCorePage 元件', () => {
    const featurePages = read('src/FeaturePages.tsx');
    const prototype = read('src/Prototype.tsx');

    expect(featurePages).not.toMatch(/(?:export\s+)?function\s+MatrixCorePage\s*\(/);
    expect(featurePages).toContain('if (screen === "matrix-core") return <MatrixExplorePage onNavigate={onNavigate} />;');
    expect(prototype).toContain('<MatrixCoreBanner onOpen={() => navigate("explore")} />');
  });
});
