import { describe, expect, it } from 'vitest';
import { resolveMatrixEntitlements, type MemberContext } from './matrix-entitlements';

const free: MemberContext = {
  authUserId: 'acceptance-user',
  memberId: 'acceptance-member',
  plan: 'free',
  active: false,
  referralSuccessCount: 0,
};

const taipeiNoon = (date: string) => new Date(`${date}T04:00:00Z`);

describe('Matrix 演算法固定驗收案例 v1.0：權限', () => {
  it('E-31 免費會員於週二或週五可使用七期', () => {
    expect(resolveMatrixEntitlements(free, taipeiNoon('2026-08-18')).canUseSeven).toBe(true);
    expect(resolveMatrixEntitlements(free, taipeiNoon('2026-08-21')).canUseSeven).toBe(true);
  });

  it('E-32 免費會員於非週二、週五不可使用七期', () => {
    expect(resolveMatrixEntitlements(free, taipeiNoon('2026-08-19')).canUseSeven).toBe(false);
  });

  it('E-33 免費會員不可使用十三期', () => {
    expect(resolveMatrixEntitlements(free, taipeiNoon('2026-08-18')).canUseThirteen).toBe(false);
  });

  it('E-34 免費會員不可使用完整範圍', () => {
    expect(resolveMatrixEntitlements(free, taipeiNoon('2026-08-18')).canUseFullRange).toBe(false);
  });

  it('E-35 Matrix Pro 可使用十三期與完整範圍', () => {
    const pro: MemberContext = { ...free, plan: 'monthly', active: true };
    expect(resolveMatrixEntitlements(pro, taipeiNoon('2026-08-19'))).toMatchObject({
      canUseThirteen: true,
      canUseFullRange: true,
    });
  });
});
