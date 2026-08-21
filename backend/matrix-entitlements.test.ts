import { describe, expect, it } from 'vitest';
import { resolveMatrixEntitlements, type MemberContext } from './matrix-entitlements';

const base: MemberContext = {
  authUserId: 'auth-1',
  memberId: 'member-1',
  plan: 'free',
  active: false,
  referralSuccessCount: 0,
};

const atTaipeiNoon = (date: string) => new Date(`${date}T04:00:00Z`);

describe('Matrix entitlements', () => {
  it('opens seven periods on Tuesday and Friday for free members', () => {
    expect(resolveMatrixEntitlements(base, atTaipeiNoon('2026-08-18')).canUseSeven).toBe(true);
    expect(resolveMatrixEntitlements(base, atTaipeiNoon('2026-08-19')).canUseSeven).toBe(false);
    expect(resolveMatrixEntitlements(base, atTaipeiNoon('2026-08-21')).canUseSeven).toBe(true);
  });

  it('applies the confirmed-referral weekday and permanent thresholds', () => {
    const ten = { ...base, referralSuccessCount: 10 };
    const fifteen = { ...base, referralSuccessCount: 15 };
    expect(resolveMatrixEntitlements(ten, atTaipeiNoon('2026-08-17')).canUseSeven).toBe(true);
    expect(resolveMatrixEntitlements(ten, atTaipeiNoon('2026-08-20')).canUseSeven).toBe(true);
    expect(resolveMatrixEntitlements(ten, atTaipeiNoon('2026-08-19')).canUseSeven).toBe(false);
    expect(resolveMatrixEntitlements(fifteen, atTaipeiNoon('2026-08-19')).canUseSeven).toBe(true);
  });

  it('applies full-range referral thresholds', () => {
    const thirty = { ...base, referralSuccessCount: 30 };
    const fifty = { ...base, referralSuccessCount: 50 };
    expect(resolveMatrixEntitlements(thirty, atTaipeiNoon('2026-08-18')).canUseFullRange).toBe(true);
    expect(resolveMatrixEntitlements(thirty, atTaipeiNoon('2026-08-19')).canUseFullRange).toBe(false);
    expect(resolveMatrixEntitlements(fifty, atTaipeiNoon('2026-08-19')).canUseFullRange).toBe(true);
  });

  it('grants paid features according to the active plan', () => {
    const active = true;
    expect(resolveMatrixEntitlements({ ...base, plan: 'monthly', active }, atTaipeiNoon('2026-08-19'))).toMatchObject({
      canUseThirteen: true,
      canUseFullRange: true,
      canCustomizeStatus: true,
      canUseCompositeCustomRoad: false,
    });
    expect(resolveMatrixEntitlements({ ...base, plan: 'quarterly', active }, atTaipeiNoon('2026-08-19'))).toMatchObject({
      canUseTianyan: true,
      canUseTiangong: false,
      canUseCompositeCustomRoad: true,
    });
    expect(resolveMatrixEntitlements({ ...base, plan: 'yearly', active }, atTaipeiNoon('2026-08-19'))).toMatchObject({
      canUseTianyan: true,
      canUseTiangong: true,
    });
  });

  it('lets an active trial view full status without custom settings', () => {
    expect(resolveMatrixEntitlements({ ...base, plan: 'trial', active: true }, atTaipeiNoon('2026-08-19'))).toMatchObject({
      canViewFullStatus: true,
      canCustomizeStatus: false,
      canUseTianyan: false,
      canUseTiangong: false,
    });
  });

  it('falls back to free access when a paid plan expires', () => {
    expect(resolveMatrixEntitlements({ ...base, plan: 'yearly', active: false }, atTaipeiNoon('2026-08-19'))).toMatchObject({
      canUseThirteen: false,
      canUseFullRange: false,
      canViewFullStatus: false,
      canCustomizeStatus: false,
      canUseTianyan: false,
      canUseTiangong: false,
    });
  });
});
