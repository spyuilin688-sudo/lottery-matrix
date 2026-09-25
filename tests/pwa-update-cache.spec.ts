import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

// This server deliberately gives HTML a long freshness lifetime to reproduce
// browsers retaining a prior deployment's HTTP-cache headers. No route mocking:
// both the service worker and Chromium's HTTP cache participate in navigation.
async function startDeployment(legacy: boolean, updateWorker = false) {
  const worker = await readFile(new URL(legacy
    ? './fixtures/pwa-cache-before-540.js'
    : '../public/push-service-worker.js', import.meta.url), 'utf8');
  let version = 'old';
  let brokenCss = false;
  let rootRequests = 0;
  const server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname;
    if (path === '/push-service-worker.js') {
      response.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
      const workerVersion = updateWorker ? version : 'installed';
      response.end(worker.replaceAll('__BUILD_ID__', workerVersion).replaceAll('__SOURCE_SHA__', workerVersion));
    } else if (path === '/' || path === '/index.html') {
      if (path === '/') rootRequests++;
      response.writeHead(200, {
        'content-type': 'text/html', 'cache-control': 'public, max-age=3600', etag: `"${version}"`,
      });
      response.end(`<!doctype html><html><head><link rel="stylesheet" href="/assets/${version}.css"><script type="module" src="/assets/${version}.js"></script></head><body><h1>${version}</h1></body></html>`);
    } else if (path.endsWith('.css')) {
      response.writeHead(200, { 'content-type': brokenCss ? 'text/html' : 'text/css' });
      response.end(brokenCss ? '<html>SPA fallback</html>' : 'body { color: rgb(1, 2, 3); }');
    } else if (path.endsWith('.js')) {
      response.writeHead(200, { 'content-type': 'text/javascript' });
      response.end('document.body.dataset.booted = "yes";');
    } else if (path === '/manifest.webmanifest') {
      response.writeHead(200, { 'content-type': 'application/manifest+json' });
      response.end('{}');
    } else if (path.endsWith('.png')) {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end('optional fixture icon');
    } else {
      response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
      response.end('<!doctype html><title>Worker setup</title><body>Setup</body>');
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    rootRequests: () => rootRequests,
    deploy: (next: string, invalidCss = false) => { version = next; brokenCss = invalidCss; },
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

test('a new worker activates while the previous version remains open', async ({ page, context }) => {
  const deployment = await startDeployment(false, true);
  try {
    await page.goto(`${deployment.origin}/setup`);
    await page.evaluate(async () => {
      localStorage.setItem('member-session-fixture', 'existing-member');
      document.cookie = 'member-fixture=existing-member; Path=/; SameSite=Lax';
      await navigator.serviceWorker.register('/push-service-worker.js');
      await navigator.serviceWorker.ready;
    });
    await page.goto(`${deployment.origin}/`);
    await expect(page.locator('h1')).toHaveText('old');
    deployment.deploy('new');
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration!.update();
    });
    await expect.poll(() => page.evaluate(async () => {
      return (await (await fetch('/__matrix_pwa_version__')).json()).sourceSha;
    }), { timeout: 10_000 }).toBe('new');
    // Activation itself preserves the open page and its member storage.
    await expect(page.locator('h1')).toHaveText('old');
    expect(await page.evaluate(() => localStorage.getItem('member-session-fixture'))).toBe('existing-member');
    expect(await page.evaluate(() => document.cookie)).toContain('member-fixture=existing-member');
    await page.reload();
    await expect(page.locator('h1')).toHaveText('new');
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('h1')).toHaveText('new');
    await expect(page.locator('body')).toHaveAttribute('data-booted', 'yes');
  } finally {
    await context.setOffline(false);
    await page.close();
    await deployment.close();
  }
});

for (const legacy of [true, false]) {
  test(legacy
    ? 'prior worker reproduces stale HTML held fresh in the real HTTP cache'
    : 'current worker revalidates old HTTP HTML and retains complete-shell recovery', async ({ page, context }) => {
    const deployment = await startDeployment(legacy);
    try {
      await page.goto(`${deployment.origin}/setup`);
      await page.evaluate(async () => {
        localStorage.setItem('member-session-fixture', 'existing-member');
        document.cookie = 'member-fixture=existing-member; Path=/; SameSite=Lax';
        await navigator.serviceWorker.register('/push-service-worker.js');
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) {
          await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
        }
        // Explicitly prime the same root URL without changing Cache Storage.
        await fetch('/', { cache: 'reload' });
      });
      const primedRequests = deployment.rootRequests();
      await page.evaluate(async () => {
        const cached = await fetch('/', { cache: 'default' });
        if (!(await cached.text()).includes('<h1>old</h1>')) throw new Error('HTTP cache was not primed');
      });
      expect(deployment.rootRequests(), 'the browser must actually reuse fresh HTTP HTML').toBe(primedRequests);

      deployment.deploy('new');
      await page.goto(`${deployment.origin}/`);
      await expect(page.locator('h1')).toHaveText(legacy ? 'old' : 'new');
      await expect(page.locator('body')).toHaveAttribute('data-booted', 'yes');
      await expect(page.locator('body')).toHaveCSS('color', 'rgb(1, 2, 3)');
      expect(deployment.rootRequests()).toBe(primedRequests + (legacy ? 0 : 1));

      if (!legacy) {
        await page.goto(`${deployment.origin}/setup`);
        deployment.deploy('broken', true);
        await page.goto(`${deployment.origin}/`);
        await expect(page.locator('h1')).toHaveText('new');
        await expect(page.locator('body')).toHaveCSS('color', 'rgb(1, 2, 3)');
        expect(deployment.rootRequests()).toBe(primedRequests + 2);
        await context.setOffline(true);
        await page.goto(`${deployment.origin}/`);
        await expect(page.locator('h1')).toHaveText('new');
        await expect(page.locator('body')).toHaveAttribute('data-booted', 'yes');
      }
      expect(await page.evaluate(() => localStorage.getItem('member-session-fixture'))).toBe('existing-member');
      expect(await page.evaluate(() => document.cookie)).toContain('member-fixture=existing-member');
    } finally {
      await context.setOffline(false);
      await page.close();
      await deployment.close();
    }
  });
}
