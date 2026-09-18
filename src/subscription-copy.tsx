import { useSubscriptionPurchaseVisible } from './subscription-purchase-visibility';

/** Reactive copy also updates inside an already-open shared dialog. */
export function SubscriptionCopy({ formal, alternative }: { formal: string; alternative: string }) {
  return useSubscriptionPurchaseVisible() ? formal : alternative;
}
