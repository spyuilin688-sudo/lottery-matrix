import { usePermissionSettings } from './permission-settings';
export function useSubscriptionPurchaseVisible() {
  return usePermissionSettings()?.subscriptionPurchaseVisible ?? false;
}
