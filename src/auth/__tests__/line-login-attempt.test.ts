// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  LINE_LOGIN_ATTEMPT_TTL_MS,
  clearLineLoginAttempt,
  consumeLineLoginAttempt,
  markLineLoginAttempt,
} from '../line-login-attempt';

const STARTED_AT = Date.parse('2026-09-04T12:00:00.000Z');

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('LINE login attempt', () => {
  it('stores only the attempt start time', () => {
    markLineLoginAttempt(window.sessionStorage, STARTED_AT);

    expect(JSON.parse(window.sessionStorage.getItem('matrix-line-login-pending') ?? 'null')).toEqual({
      startedAt: STARTED_AT,
    });
    expect(window.sessionStorage.getItem('matrix-line-login-pending')).not.toMatch(
      /token|provider|user/i,
    );
  });

  it('consumes a fresh attempt only after an authenticated callback', () => {
    markLineLoginAttempt(window.sessionStorage, STARTED_AT);

    expect(consumeLineLoginAttempt({
      hasSession: false,
      now: STARTED_AT + 1_000,
      callbackUrl: 'https://matrix.example/',
      storage: window.sessionStorage,
    })).toBe(false);
    expect(window.sessionStorage.getItem('matrix-line-login-pending')).not.toBeNull();

    expect(consumeLineLoginAttempt({
      hasSession: true,
      now: STARTED_AT + LINE_LOGIN_ATTEMPT_TTL_MS - 1,
      callbackUrl: 'https://matrix.example/',
      storage: window.sessionStorage,
    })).toBe(true);
    expect(window.sessionStorage.getItem('matrix-line-login-pending')).toBeNull();
  });

  it.each([
    ['legacy value', '1'],
    ['damaged JSON', '{'],
    ['extra provider data', JSON.stringify({ startedAt: STARTED_AT, provider: 'line' })],
    ['non-finite timestamp', JSON.stringify({ startedAt: 'now' })],
  ])('clears %s without reporting success', (_label, storedValue) => {
    window.sessionStorage.setItem('matrix-line-login-pending', storedValue);

    expect(consumeLineLoginAttempt({
      hasSession: true,
      now: STARTED_AT + 1_000,
      callbackUrl: 'https://matrix.example/',
      storage: window.sessionStorage,
    })).toBe(false);
    expect(window.sessionStorage.getItem('matrix-line-login-pending')).toBeNull();
  });

  it.each([
    ['expired', STARTED_AT + LINE_LOGIN_ATTEMPT_TTL_MS],
    ['from the future', STARTED_AT - 1],
  ])('clears an %s attempt without reporting success', (_label, now) => {
    markLineLoginAttempt(window.sessionStorage, STARTED_AT);

    expect(consumeLineLoginAttempt({
      hasSession: true,
      now,
      callbackUrl: 'https://matrix.example/',
      storage: window.sessionStorage,
    })).toBe(false);
    expect(window.sessionStorage.getItem('matrix-line-login-pending')).toBeNull();
  });

  it.each([
    'https://matrix.example/?error=access_denied&error_description=cancelled',
    'https://matrix.example/#error=server_error&error_code=unexpected_failure',
  ])('clears an attempt when the OAuth callback contains an error', (callbackUrl) => {
    markLineLoginAttempt(window.sessionStorage, STARTED_AT);

    expect(consumeLineLoginAttempt({
      hasSession: true,
      now: STARTED_AT + 1_000,
      callbackUrl,
      storage: window.sessionStorage,
    })).toBe(false);
    expect(window.sessionStorage.getItem('matrix-line-login-pending')).toBeNull();
  });

  it('tolerates unavailable session storage', () => {
    const unavailableStorage = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
      removeItem() { throw new Error('blocked'); },
    };

    expect(() => markLineLoginAttempt(unavailableStorage, STARTED_AT)).not.toThrow();
    expect(() => clearLineLoginAttempt(unavailableStorage)).not.toThrow();
    expect(consumeLineLoginAttempt({
      hasSession: true,
      now: STARTED_AT + 1_000,
      callbackUrl: 'https://matrix.example/',
      storage: unavailableStorage,
    })).toBe(false);
  });

  it('tolerates the browser blocking access to the sessionStorage getter', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() { throw new Error('blocked'); },
    });

    try {
      expect(() => markLineLoginAttempt()).not.toThrow();
      expect(() => clearLineLoginAttempt()).not.toThrow();
      expect(consumeLineLoginAttempt({ hasSession: true })).toBe(false);
    } finally {
      if (descriptor) Object.defineProperty(window, 'sessionStorage', descriptor);
    }
  });
});
