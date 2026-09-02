// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

declare const process: { cwd(): string };

describe('PWA manifest', () => {
  it('declares installable standard and maskable PNG icons at their real dimensions', () => {
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
      icons?: Array<{ src?: string; type?: string; sizes?: string; purpose?: string }>;
    };

    expect(manifest.name).toBe('樂彩 Matrix');
    expect(manifest.short_name).toBe('樂彩 Matrix');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('fullscreen');
    expect(manifest.theme_color).toBe('#02070c');
    expect(manifest.background_color).toBe('#02070c');
    const expectedIcons = [
      { src: '/icons/icon-72x72.png', sizes: '72x72', purpose: 'any' },
      { src: '/icons/icon-96x96.png', sizes: '96x96', purpose: 'any' },
      { src: '/icons/icon-128x128.png', sizes: '128x128', purpose: 'any' },
      { src: '/icons/icon-144x144.png', sizes: '144x144', purpose: 'any' },
      { src: '/icons/icon-152x152.png', sizes: '152x152', purpose: 'any' },
      { src: '/icons/icon-192x192.png', sizes: '192x192', purpose: 'any' },
      { src: '/icons/icon-384x384.png', sizes: '384x384', purpose: 'any' },
      { src: '/icons/icon-512x512.png', sizes: '512x512', purpose: 'any' },
      { src: '/icons/maskable-icon-192x192.png', sizes: '192x192', purpose: 'maskable' },
      { src: '/icons/maskable-icon-512x512.png', sizes: '512x512', purpose: 'maskable' },
    ];

    expect(manifest.icons).toEqual(expectedIcons.map((icon) => ({ ...icon, type: 'image/png' })));

    for (const icon of expectedIcons) {
      const file = readFileSync(`${process.cwd()}/public${icon.src}`);
      expect(file.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(`${file.readUInt32BE(16)}x${file.readUInt32BE(20)}`).toBe(icon.sizes);
    }
  });

  it('is linked from the application document without changing the app shell', () => {
    const index = readFileSync(`${process.cwd()}/index.html`, 'utf8');
    const document = new DOMParser().parseFromString(index, 'text/html');

    expect(document.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe('/manifest.webmanifest');
    expect(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toBe('/icons/apple-touch-icon.png');

    const faviconSizes = Array.from(document.querySelectorAll('link[rel="icon"][type="image/png"]'))
      .map((link) => link.getAttribute('sizes'));
    expect(faviconSizes).toEqual(['16x16', '32x32', '48x48']);
  });
});
