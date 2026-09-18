export const PWA_DISPLAY_QUERIES = [
  '(display-mode: standalone)',
  '(display-mode: fullscreen)',
  '(display-mode: minimal-ui)',
] as const;

type PwaDisplayWindow = Pick<Window, 'navigator' | 'matchMedia'>;

export function isPwaDisplayMode(browser: PwaDisplayWindow = window) {
  if (!browser) return false;
  return Boolean((browser.navigator as Navigator & { standalone?: boolean }).standalone)
    || PWA_DISPLAY_QUERIES.some((query) => browser.matchMedia?.(query).matches);
}

export function isMobilePwa(browser: PwaDisplayWindow = window) {
  if (!isPwaDisplayMode(browser)) return false;
  const device = browser.navigator as Navigator & {
    standalone?: boolean;
    userAgentData?: { mobile?: boolean };
  };
  return Boolean(device.standalone || device.userAgentData?.mobile)
    || /Android|iPhone|iPad|iPod/i.test(device.userAgent ?? '')
    || (device.platform === 'MacIntel' && device.maxTouchPoints > 1);
}
