import { expect, it } from 'vitest';
import { formatAdminRowForDisplay } from './admin-display';

it('uses the stored LINE nickname as subscription member name when enriched name is absent', () => {
  expect(formatAdminRowForDisplay('subscriptions', {
    id: 'member-1', lineDisplayName: 'LINE 暱稱', memberDisplayName: null,
  }).memberDisplayName).toBe('LINE 暱稱');
});
