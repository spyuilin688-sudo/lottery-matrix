import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Page } from '@playwright/test';
/** Optional local CJK font for minimal test images without system Chinese fonts. */
export async function installAppTestFont(page: Page) {
  const path = process.env.APP_TEST_CJK_FONT_PATH;
  if (!path) return;
  const css = path.endsWith('.css')
    ? readFileSync(path, 'utf8').replace(/font-family:\s*'[^']+'/g, "font-family:'App Test CJK'").replace(/src:\s*url\(([^)]+\.woff2)\)[^;]+;/g, (_match, url) => `src:url(data:font/woff2;base64,${readFileSync(resolve(dirname(path), url)).toString('base64')}) format('woff2');`)
    : `@font-face{font-family:'App Test CJK';src:url(data:font/woff2;base64,${readFileSync(path).toString('base64')}) format('woff2')}`;
  await page.addStyleTag({ content: css + "body,body *{font-family:'App Test CJK',sans-serif!important}" });
  await page.evaluate(() => document.fonts.load('16px "App Test CJK"', document.body.textContent ?? '樂彩會員'));
}
