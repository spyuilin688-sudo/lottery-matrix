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
