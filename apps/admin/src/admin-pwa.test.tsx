// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { registerAdminServiceWorker } from './admin-pwa';

describe('admin PWA identity', () => {
  it('uses an explicit admin-only app identity and navigation boundary', () => {
    const manifest = JSON.parse(readFileSync(new NodeURL('../public/manifest.webmanifest', import.meta.url), 'utf8'));

    expect(manifest).toMatchObject({
      id: '/admin/',
      start_url: '/admin/',
      scope: '/admin/',
    });
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/admin/icons/admin-192x192.png', sizes: '192x192' }),
      expect.objectContaining({ src: '/admin/icons/admin-512x512.png', sizes: '512x512' }),
    ]));
  });

  it('ships dedicated admin install icons instead of reusing the public PWA icon', () => {
    expect(() => readFileSync(new NodeURL('../public/icons/admin-192x192.png', import.meta.url))).not.toThrow();
    expect(() => readFileSync(new NodeURL('../public/icons/admin-512x512.png', import.meta.url))).not.toThrow();
    const html = readFileSync(new NodeURL('../index.html', import.meta.url), 'utf8');
    expect(html).toContain('href="/admin/icons/admin-192x192.png"');
    expect(html).toContain('href="/admin/icons/admin-180x180.png"');
  });

  it('registers the admin service worker at startup with the admin scope', async () => {
    const register = vi.fn(async () => ({ scope: '/admin/' }));

    await expect(registerAdminServiceWorker({ register })).resolves.toEqual({ scope: '/admin/' });
    expect(register).toHaveBeenCalledWith('/admin/admin-push-sw.js', { scope: '/admin/' });
  });

  it('ships the registered service-worker asset in the admin public output', () => {
    const worker = readFileSync(new NodeURL('../public/admin-push-sw.js', import.meta.url), 'utf8');
    expect(worker).toContain("self.addEventListener('install'");
    expect(worker).toContain("self.addEventListener('notificationclick'");
    expect(worker).toContain("icons/admin-192x192.png");
  });

  it('does nothing when service workers are unavailable', async () => {
    await expect(registerAdminServiceWorker(undefined)).resolves.toBeNull();
  });
});
