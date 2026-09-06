// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LinePwaReturnFallback,
  createLinePwaReturnHref,
} from '../LinePwaReturnFallback';

const ORIGIN = 'https://matrixlottery.idv.tw';

describe('LINE PWA return fallback', () => {
  afterEach(() => document.body.replaceChildren());

  it('shows only the successful login message and Matrix return action', () => {
    render(<LinePwaReturnFallback returnHref={`${ORIGIN}/`} />);

    expect(screen.getByRole('heading', { name: '登入成功' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回 Matrix' })).toHaveAttribute('href', `${ORIGIN}/`);
  });

  it('uses an Android intent from the user-activated return link', () => {
    const href = createLinePwaReturnHref({
      location: new URL(`${ORIGIN}/?code=oauth-code`),
      navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile' },
    });

    expect(href).toBe(
      'intent://matrixlottery.idv.tw/#Intent;scheme=https;S.browser_fallback_url=https%3A%2F%2Fmatrixlottery.idv.tw%2F;end',
    );
  });

  it('uses the site root outside Android', () => {
    const href = createLinePwaReturnHref({
      location: new URL(`${ORIGIN}/?code=oauth-code`),
      navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' },
    });

    expect(href).toBe(`${ORIGIN}/`);
  });
});
