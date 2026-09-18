// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { isPwaDisplayMode } from './pwa-display-mode';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(['standalone', 'fullscreen', 'minimal-ui'])('recognizes the installed %s display mode', (mode) => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query === `(display-mode: ${mode})` })));
  expect(isPwaDisplayMode()).toBe(true);
});

it('keeps regular browser login on the existing redirect flow', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  expect(isPwaDisplayMode()).toBe(false);
});

it('recognizes an iOS home-screen app without matchMedia', () => {
  vi.stubGlobal('navigator', { standalone: true });
  vi.stubGlobal('matchMedia', undefined);
  expect(isPwaDisplayMode()).toBe(true);
});
