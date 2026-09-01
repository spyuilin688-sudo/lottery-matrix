// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

declare const process: { cwd(): string };

describe('PWA manifest', () => {
  it('declares the installed application metadata and an existing icon', () => {
    const path = `${process.cwd()}/public/manifest.webmanifest`;

    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;

    const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
      name?: string;
      short_name?: string;
      start_url?: string;
      display?: string;
      theme_color?: string;
      background_color?: string;
      icons?: Array<{ src?: string; type?: string; sizes?: string }>;
    };

    expect(manifest.name).toBe('樂彩 Matrix');
    expect(manifest.short_name).toBe('樂彩 Matrix');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#02070c');
    expect(manifest.background_color).toBe('#02070c');
    expect(manifest.icons).toContainEqual({ src: '/favicon.svg', type: 'image/svg+xml', sizes: 'any' });
    expect(existsSync(`${process.cwd()}/public/favicon.svg`)).toBe(true);
  });

  it('is linked from the application document without changing the app shell', () => {
    const index = readFileSync(`${process.cwd()}/index.html`, 'utf8');
    const document = new DOMParser().parseFromString(index, 'text/html');

    expect(document.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe('/manifest.webmanifest');
  });
});
