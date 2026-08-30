export const DEFAULT_WEB_PUSH_PUBLIC_KEY =
  'BFA4-N_J6crmoyUhDEi3TQen1o5_64-P1LEE20f86ODxgghyoG20mNI7DJOBeNfuuKm9FkLAwifb3RsPAcLWZjY';

export function resolveWebPushPublicKey(configuredKey: string | undefined): string {
  return configuredKey?.trim() || DEFAULT_WEB_PUSH_PUBLIC_KEY;
}
