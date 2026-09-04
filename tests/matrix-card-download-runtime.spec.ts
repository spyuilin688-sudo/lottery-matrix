import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

test('prepared matrix card downloads as PNG and repeated downloads reuse the prepared blob', async ({ page }) => {
  await page.goto('/tests/matrix-card-download-runtime-fixture.html');

  await page.getByRole('button', { name: 'prepare' }).click();
  await expect.poll(() => page.evaluate(() => window.__matrixCardDownloadTest.prepared())).toBe(true);
  expect(await page.evaluate(() => window.__matrixCardDownloadTest.fetchCount())).toBe(1);

  const firstDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'download', exact: true }).click();
  const firstDownload = await firstDownloadPromise;
  expect(firstDownload.suggestedFilename()).toBe('matrix-card.png');
  const firstPath = await firstDownload.path();
  expect(firstPath).not.toBeNull();
  const firstBytes = await readFile(firstPath!);
  expect([...firstBytes.subarray(0, PNG_SIGNATURE.length)]).toEqual(PNG_SIGNATURE);
  expect(await page.evaluate(() => window.__matrixCardDownloadTest.fetchCount())).toBe(1);

  const secondDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'download again' }).click();
  const secondDownload = await secondDownloadPromise;
  expect(secondDownload.suggestedFilename()).toBe('matrix-card-again.png');
  expect(await page.evaluate(() => window.__matrixCardDownloadTest.fetchCount())).toBe(1);
});

test('matrix card download does not revoke its blob URL synchronously', async ({ page }) => {
  await page.goto('/tests/matrix-card-download-runtime-fixture.html');
  await page.getByRole('button', { name: 'prepare' }).click();
  await expect.poll(() => page.evaluate(() => window.__matrixCardDownloadTest.prepared())).toBe(true);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'download', exact: true }).click();
  await downloadPromise;

  expect(await page.evaluate(() => window.__matrixCardDownloadTest.revokeCount())).toBe(0);
  await expect.poll(
    () => page.evaluate(() => window.__matrixCardDownloadTest.revokeCount()),
    { timeout: 5_000 },
  ).toBeGreaterThan(0);
});

declare global {
  interface Window {
    __matrixCardDownloadTest: {
      cardUrl: string;
      fetchCount: () => number;
      revokeCount: () => number;
      prepared: () => boolean;
    };
  }
}
