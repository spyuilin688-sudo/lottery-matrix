export const PWA_DISPLAY_QUERIES = [
  '(display-mode: standalone)',
  '(display-mode: fullscreen)',
  '(display-mode: minimal-ui)',
] as const;

export function isPwaDisplayMode() {
  if (typeof window === 'undefined') return false;
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
    || PWA_DISPLAY_QUERIES.some((query) => window.matchMedia?.(query).matches);
}

export function isMobilePwa() {
  if (!isPwaDisplayMode()) return false;
  const device = window.navigator as Navigator & {
    standalone?: boolean;
    userAgentData?: { mobile?: boolean };
  };
  return Boolean(device.standalone || device.userAgentData?.mobile)
    || /Android|iPhone|iPad|iPod/i.test(device.userAgent ?? '')
    || (device.platform === 'MacIntel' && device.maxTouchPoints > 1);
}
