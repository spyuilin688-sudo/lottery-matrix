// @vitest-environment jsdom
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppDialogProvider } from '../../dialog/AppDialog';
import { LineLoginErrorNotice } from '../LineLoginErrorNotice';

describe('LINE callback error notice', () => {
  it('shows an expiry notice once, including under StrictMode, and lets the user dismiss it', async () => {
    render(<StrictMode><AppDialogProvider><LineLoginErrorNotice error="expired" /></AppDialogProvider></StrictMode>);

    expect(await screen.findByRole('dialog', { name: '登入已逾時' })).toBeTruthy();
    expect(screen.getByText('請重新點選 LINE 登入。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('does not interrupt an ordinary page visit', () => {
    render(<AppDialogProvider><LineLoginErrorNotice /></AppDialogProvider>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
