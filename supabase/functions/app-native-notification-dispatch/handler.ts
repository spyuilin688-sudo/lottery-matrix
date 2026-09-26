import { createNativePushHandler } from '../native-notification-dispatch/handler.ts';
export function createAppNativePushHandler(deps: Parameters<typeof createNativePushHandler>[0]) {
  return createNativePushHandler(deps, 'app');
}
