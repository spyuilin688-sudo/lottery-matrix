import { describe, expect, it } from 'vitest';
import { isPasswordRecoveryUrl } from '../password-recovery';
describe('password recovery callback routing', () => {
  it.each([
    'https://matrixlottery.idv.tw/#access_token=test&type=recovery',
    'https://matrixlottery.idv.tw/reset-password?code=test',
    'https://matrixlottery.idv.tw/reset-password/#error=access_denied&error_code=otp_expired',
  ])('recognizes a recovery destination: %s', value => {
    expect(isPasswordRecoveryUrl(new URL(value))).toBe(true);
  });
  it.each([
    'https://matrixlottery.idv.tw/',
    'https://matrixlottery.idv.tw/?code=line-code&state=line-state',
    'https://matrixlottery.idv.tw/#access_token=test&type=signup',
    'https://matrixlottery.idv.tw/?type=recovery',
  ])('preserves ordinary app and LINE destinations: %s', value => {
    expect(isPasswordRecoveryUrl(new URL(value))).toBe(false);
  });
});
