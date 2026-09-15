// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { referralErrorText } from '../features/MemberPages';

test('推薦碼登入提示同時支援 LINE 與 Google', () => {
  expect(referralErrorText.LINE_IDENTITY_REQUIRED).toContain('LINE 或 Google');
});
