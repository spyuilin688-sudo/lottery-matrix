type BrowserForReturn = {
  location: Pick<Location, 'origin'> | URL;
  navigator: Pick<Navigator, 'userAgent'>;
};

export function createLinePwaReturnHref(browser: BrowserForReturn = window) {
  const rootUrl = new URL('/', browser.location.origin).href;
  if (!/Android/i.test(browser.navigator.userAgent)) return rootUrl;

  const parsedRoot = new URL(rootUrl);
  return `intent://${parsedRoot.host}${parsedRoot.pathname}#Intent;scheme=https;S.browser_fallback_url=${encodeURIComponent(rootUrl)};end`;
}

export function LinePwaReturnFallback({ returnHref }: { returnHref: string }) {
  return (
    <main className="line-pwa-return" aria-labelledby="line-pwa-return-title">
      <section className="line-pwa-return__card">
        <h1 id="line-pwa-return-title">登入成功</h1>
        <a className="line-pwa-return__action" href={returnHref}>返回 Matrix</a>
      </section>
    </main>
  );
}
