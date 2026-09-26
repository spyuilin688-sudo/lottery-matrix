// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../App';
const bridge = vi.hoisted(() => vi.fn(() => null));
vi.mock('../auth/MemberSessionBridge', () => ({ MemberSessionBridge: bridge }));
vi.mock('./app-info-client', () => ({ getAppInfoClient: () => { throw new Error('Privacy must not initialize auth'); } }));
afterEach(() => { cleanup(); window.history.replaceState({}, '', '/'); });
it('App information routes bypass the PWA member/session tree', () => {
  window.history.replaceState({}, '', '/app-info/privacy');
  render(<App />);
  expect(screen.getByRole('heading', { name: '樂彩 Matrix App 隱私權政策' })).toBeTruthy();
  expect(bridge).not.toHaveBeenCalled();
});
