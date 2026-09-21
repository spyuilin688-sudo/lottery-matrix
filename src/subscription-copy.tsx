import type { ReactNode } from 'react';
import { useSubscriptionPurchaseVisible } from './subscription-purchase-visibility';

/** Reactive copy also updates inside an already-open shared dialog. */
export function SubscriptionCopy({ formal, alternative }: { formal: ReactNode; alternative: ReactNode }) {
  return useSubscriptionPurchaseVisible() ? formal : alternative;
}
