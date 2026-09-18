// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const memberApi = vi.hoisted(() => ({
  disablePushSubscription: vi.fn(),
  fetchPushSubscriptionStatus: vi.fn(),
  savePushSubscription: vi.fn(),
}));

const supabase = vi.hoisted(() => ({
  auth: { getSession: vi.fn() },
}));

vi.mock('./member-api', () => memberApi);
vi.mock('./lib/supabase', () => ({ getSupabaseClient: () => supabase }));

import {
  cleanupBrowserPushSubscription,
  disablePushNotifications,
  enablePushNotifications,
  getPushStatus,
  PushSubscriptionError,
  registerPushServiceWorker,
} from './push-subscription';

const requestPermission = vi.fn<() => Promise<NotificationPermission>>();
const subscribe = vi.fn();
const getSubscription = vi.fn();
const unsubscribe = vi.fn<() => Promise<boolean>>();
const register = vi.fn();
const getRegistration = vi.fn();
const updateRegistration = vi.fn();
const addServiceWorkerListener = vi.fn();
const removeServiceWorkerListener = vi.fn();

const subscription = {
  endpoint: 'https://push.test/device',
  toJSON: () => ({
    endpoint: 'https://push.test/device',
    keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
  }),
  unsubscribe,
} as unknown as PushSubscription;

function installSupportedPushApi(
  permission: NotificationPermission = 'default',
  serviceWorker: unknown = {
    register,
    getRegistration,
    addEventListener: addServiceWorkerListener,
    removeEventListener: removeServiceWorkerListener,
  },
) {
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    value: { permission, requestPermission },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      serviceWorker,
    },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  memberApi.fetchPushSubscriptionStatus.mockResolvedValue({ enabled: false });
  memberApi.savePushSubscription.mockResolvedValue({ enabled: true });
  memberApi.disablePushSubscription.mockResolvedValue({
    disabled: true,
    endpoint: 'https://push.test/device',
  });
  requestPermission.mockResolvedValue('default');
  subscribe.mockResolvedValue(subscription);
  getSubscription.mockResolvedValue(subscription);
  unsubscribe.mockResolvedValue(true);
  const registration = {
    pushManager: { subscribe, getSubscription },
    update: updateRegistration,
  };
  updateRegistration.mockResolvedValue(registration);
  register.mockResolvedValue(registration);
  getRegistration.mockResolvedValue(registration);
  supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'member-token' } }, error: null });
  installSupportedPushApi();
});

async function expectFixedFailure(
  operation: Promise<unknown>,
  permission: NotificationPermission = 'granted',
  stage?: string,
) {
  const error = await operation.catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(PushSubscriptionError);
  expect(error).toMatchObject({
    message: 'PUSH_SUBSCRIPTION_FAILED',
    status: { supported: true, permission, enabled: false },
  });
  if (stage) expect(error).toMatchObject({ stage });
}

describe('PWA push subscriptions', () => {
  it('registers the PWA worker without Notification or PushManager', async () => {
    Object.defineProperty(globalThis, 'Notification', { configurable: true, value: undefined });
    getRegistration.mockResolvedValue(undefined);
    const registration = { active: { state: 'activated' } };
    register.mockResolvedValue(registration);

    await expect(registerPushServiceWorker()).resolves.toBe(registration);
    expect(register).toHaveBeenCalledWith('/push-service-worker.js');
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('updates the existing PWA worker without Notification', async () => {
    Object.defineProperty(globalThis, 'Notification', { configurable: true, value: undefined });

    await expect(registerPushServiceWorker()).resolves.toBeDefined();
    expect(updateRegistration).toHaveBeenCalledTimes(1);
    expect(register).not.toHaveBeenCalled();
  });

  it.each(['default', 'denied', 'granted'] as const)('registers the PWA worker with %s notification permission', async (permission) => {
    installSupportedPushApi(permission);
    getRegistration.mockResolvedValue(undefined);

    await expect(registerPushServiceWorker()).resolves.toBeDefined();
    expect(register).toHaveBeenCalledWith('/push-service-worker.js');
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it.each([true, false])('reports push unsupported without Notification when authenticated=%s', async (authenticated) => {
    Object.defineProperty(globalThis, 'Notification', { configurable: true, value: undefined });
    const unsupported = { supported: false, permission: 'default', enabled: false };

    await expect(getPushStatus(authenticated)).resolves.toEqual(unsupported);
    await expect(enablePushNotifications('key', authenticated)).resolves.toEqual(unsupported);
    await expect(disablePushNotifications()).resolves.toEqual(unsupported);
    await expect(cleanupBrowserPushSubscription()).resolves.toBeUndefined();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(getSubscription).not.toHaveBeenCalled();
    expect(memberApi.fetchPushSubscriptionStatus).not.toHaveBeenCalled();
    expect(memberApi.savePushSubscription).not.toHaveBeenCalled();
    expect(memberApi.disablePushSubscription).not.toHaveBeenCalled();
  });

  it('rejects PWA registration when Service Worker is unavailable even with Notification', async () => {
    installSupportedPushApi('granted');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });

    await expect(registerPushServiceWorker()).rejects.toThrow('PUSH_SERVICE_WORKER_UNSUPPORTED');
    await expect(getPushStatus(false)).resolves.toEqual({ supported: false, permission: 'default', enabled: false });
    expect(register).not.toHaveBeenCalled();
  });

  it('enables push with an activated worker even when checking for an update would fail', async () => {
    requestPermission.mockResolvedValue('granted');
    getRegistration.mockResolvedValue({
      active: { state: 'activated' },
      installing: null,
      waiting: null,
      pushManager: { subscribe, getSubscription },
      update: updateRegistration,
    });
    updateRegistration.mockRejectedValue(new TypeError('Failed to fetch worker update'));

    await expect(enablePushNotifications('BElong-key', true)).resolves.toEqual({
      supported: true, permission: 'granted', enabled: true,
    });
    expect(memberApi.savePushSubscription).toHaveBeenCalledWith({
      endpoint: 'https://push.test/device', p256dh: 'p256dh-value', auth: 'auth-value',
    });
    expect(updateRegistration).not.toHaveBeenCalled();
  });

  it('reads current push status without requiring an update of an activated worker', async () => {
    installSupportedPushApi('granted');
    memberApi.fetchPushSubscriptionStatus.mockResolvedValue({ enabled: true });
    getRegistration.mockResolvedValue({
      active: { state: 'activated' },
      pushManager: { subscribe, getSubscription },
      update: updateRegistration,
    });
    updateRegistration.mockRejectedValue(new TypeError('Failed to fetch worker update'));

    await expect(getPushStatus()).resolves.toEqual({
      supported: true, permission: 'granted', enabled: true,
    });
  });

  it('waits for the startup-owned worker without registering from a push status read', async () => {
    installSupportedPushApi('granted', {
      register,
      getRegistration,
      ready: Promise.resolve({ pushManager: { subscribe, getSubscription } }),
      addEventListener: addServiceWorkerListener,
      removeEventListener: removeServiceWorkerListener,
    });
    getRegistration.mockResolvedValue(undefined);
    memberApi.fetchPushSubscriptionStatus.mockResolvedValue({ enabled: true });

    await expect(getPushStatus()).resolves.toEqual({
      supported: true, permission: 'granted', enabled: true,
    });
    expect(register).not.toHaveBeenCalled();
  });

  it('reports registration lookup failure as temporary and recovers on an explicit recheck', async () => {
    installSupportedPushApi('granted');
    getRegistration.mockRejectedValueOnce(new Error('temporary worker failure'));
    await expectFixedFailure(getPushStatus(), 'granted', 'service-worker-registration');
    memberApi.fetchPushSubscriptionStatus.mockResolvedValue({ enabled: true });
    await expect(getPushStatus()).resolves.toMatchObject({ supported: true, enabled: true });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('reports startup timeout as temporary and clears its timer', async () => {
    vi.useFakeTimers();
    try {
      installSupportedPushApi('granted', { register, getRegistration, ready: new Promise(() => {}) });
      getRegistration.mockResolvedValue(undefined);
      const status = getPushStatus().catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(status).resolves.toMatchObject({
        stage: 'service-worker-registration',
        status: { supported: true, permission: 'granted', enabled: false },
      });
      expect(vi.getTimerCount()).toBe(0);
      expect(register).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('treats a missing registration as temporary, not unsupported', async () => {
    getRegistration.mockResolvedValue(undefined);
    await expectFixedFailure(getPushStatus(), 'default', 'service-worker-registration');
  });

  it('reports a registered worker without PushManager as truly unsupported', async () => {
    getRegistration.mockResolvedValue({});
    await expect(getPushStatus()).resolves.toMatchObject({ supported: false, enabled: false });
  });

  it.each(['granted', 'denied'] as const)('does not ask again for an already %s permission', async (permission) => {
    installSupportedPushApi(permission);
    await expect(enablePushNotifications('BElong-key', true)).resolves.toMatchObject({
      supported: true, permission, enabled: permission === 'granted',
    });
    expect(requestPermission).not.toHaveBeenCalled();
    if (permission === 'denied') expect(subscribe).not.toHaveBeenCalled();
  });

  it('waits for the startup-owned worker without registering while enabling push', async () => {
    installSupportedPushApi('default', {
      register,
      getRegistration,
      ready: Promise.resolve({ pushManager: { subscribe, getSubscription } }),
      addEventListener: addServiceWorkerListener,
      removeEventListener: removeServiceWorkerListener,
    });
    getRegistration.mockResolvedValue(undefined);
    requestPermission.mockResolvedValue('granted');

    await expect(enablePushNotifications('BElong-key', true)).resolves.toMatchObject({ enabled: true });
    expect(register).not.toHaveBeenCalled();
  });

  it('checks an existing service worker registration for an update', async () => {
    getRegistration.mockResolvedValue({
      active: { state: 'activated' },
      update: updateRegistration,
      pushManager: { subscribe, getSubscription },
    });
    await expect(registerPushServiceWorker()).resolves.toBeDefined();

    expect(updateRegistration).toHaveBeenCalledTimes(1);
    expect(register).not.toHaveBeenCalled();
  });

  it('waits for an installing update to control the page before resolving', async () => {
    const listeners = new Set<EventListener>();
    const oldController = {} as ServiceWorker;
    const nextController = {} as ServiceWorker;
    const serviceWorker = {
      controller: oldController,
      getRegistration,
      register,
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === 'controllerchange') listeners.add(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === 'controllerchange') listeners.delete(listener);
      }),
    };
    const registration = {
      active: oldController,
      installing: {} as ServiceWorker,
      waiting: null,
      pushManager: { subscribe, getSubscription },
      update: updateRegistration,
    };
    updateRegistration.mockResolvedValue(registration);
    getRegistration.mockResolvedValue(registration);
    installSupportedPushApi('default', serviceWorker);

    let resolved = false;
    const operation = registerPushServiceWorker().then(() => { resolved = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    serviceWorker.controller = nextController;
    for (const listener of listeners) listener(new Event('controllerchange'));

    await operation;
    expect(resolved).toBe(true);
    expect(serviceWorker.removeEventListener).toHaveBeenCalled();
  });

  it('cleans the controller listener when a worker update times out without a second rejection', async () => {
    vi.useFakeTimers();
    const listeners = new Set<EventListener>();
    const serviceWorker = {
      controller: {} as ServiceWorker,
      getRegistration,
      register,
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === 'controllerchange') listeners.add(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === 'controllerchange') listeners.delete(listener);
      }),
    };
    let finishUpdate!: (registration: ServiceWorkerRegistration) => void;
    const registration = {
      active: serviceWorker.controller,
      installing: {} as ServiceWorker,
      waiting: null,
      pushManager: { subscribe, getSubscription },
      update: updateRegistration,
    } as unknown as ServiceWorkerRegistration;
    updateRegistration.mockReturnValue(new Promise((resolve) => { finishUpdate = resolve; }));
    getRegistration.mockResolvedValue(registration);
    installSupportedPushApi('default', serviceWorker);

    const operation = registerPushServiceWorker();
    const failure = operation.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(failure).resolves.toMatchObject({ message: 'PUSH_SERVICE_WORKER_TIMEOUT' });
    expect(listeners.size).toBe(0);

    finishUpdate(registration);
    await vi.runAllTimersAsync();
    expect(listeners.size).toBe(0);
    vi.useRealTimers();
  });

  it('does not create a subscription when the Push API is unsupported', async () => {
    Object.defineProperty(globalThis, 'Notification', { configurable: true, value: undefined });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });

    await expect(enablePushNotifications('key', true)).resolves.toEqual({
      supported: false,
      permission: 'default',
      enabled: false,
    });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(memberApi.savePushSubscription).not.toHaveBeenCalled();
  });

  it('reports unsupported when a browser does not expose a service worker', async () => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: undefined });

    await expect(getPushStatus()).resolves.toEqual({
      supported: false,
      permission: 'default',
      enabled: false,
    });
  });

  it('reports a fixed failure after permission when the registered worker has no Push API methods', async () => {
    installSupportedPushApi('default', { register: vi.fn().mockResolvedValue({ pushManager: {} }), getRegistration: vi.fn().mockResolvedValue(null) });
    requestPermission.mockResolvedValue('granted');

    await expectFixedFailure(enablePushNotifications('key', true));
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(subscribe).not.toHaveBeenCalled();
    expect(memberApi.savePushSubscription).not.toHaveBeenCalled();
  });

  it('identifies service worker registration failures', async () => {
    requestPermission.mockResolvedValue('granted');
    getRegistration.mockRejectedValue(new Error('registration failed'));

    await expectFixedFailure(
      enablePushNotifications('BElong-key', true),
      'granted',
      'service-worker-registration',
    );
    expect(subscribe).not.toHaveBeenCalled();
    expect(memberApi.savePushSubscription).not.toHaveBeenCalled();
  });

  it('does not prompt when the service worker implementation is invalid', async () => {
    installSupportedPushApi('default', null);

    await expect(enablePushNotifications('key', true)).resolves.toEqual({
      supported: false,
      permission: 'default',
      enabled: false,
    });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('does not save a subscription when the user denies permission', async () => {
    requestPermission.mockResolvedValue('denied');

    await expect(enablePushNotifications('key', true)).resolves.toEqual({
      supported: true,
      permission: 'denied',
      enabled: false,
    });
    expect(memberApi.savePushSubscription).not.toHaveBeenCalled();
  });

  it('does not request permission or subscribe when the member is not authenticated', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(enablePushNotifications('key', false)).rejects.toMatchObject({
      status: { supported: true, permission: 'default', enabled: false },
    });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(getRegistration).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('requests permission before awaiting service worker registration', async () => {
    requestPermission.mockResolvedValue('granted');
    let resolveRegistration!: (value: unknown) => void;
    getRegistration.mockReturnValue(new Promise((resolve) => { resolveRegistration = resolve; }));

    const operation = enablePushNotifications('BElong-key', true);

    expect(requestPermission).toHaveBeenCalledTimes(1);
    resolveRegistration({ pushManager: { subscribe, getSubscription } });
    await expect(operation).resolves.toMatchObject({ enabled: true });
  });

  it('creates a browser subscription only when no subscription exists', async () => {
    requestPermission.mockResolvedValue('granted');
    getSubscription.mockResolvedValue(null);

    await expect(enablePushNotifications('BElong-key', true)).resolves.toEqual({
      supported: true,
      permission: 'granted',
      enabled: true,
    });
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([4, 73, 104, 158, 15, 164, 123]),
    });
    expect(memberApi.savePushSubscription).toHaveBeenCalledWith({
      endpoint: 'https://push.test/device',
      p256dh: 'p256dh-value',
      auth: 'auth-value',
    });
  });

  it('reuses an existing browser subscription and saves it again', async () => {
    requestPermission.mockResolvedValue('granted');
    memberApi.fetchPushSubscriptionStatus.mockResolvedValue({ enabled: true });

    await expect(enablePushNotifications('BElong-key', true)).resolves.toEqual({
      supported: true,
      permission: 'granted',
      enabled: true,
    });
    expect(getSubscription).toHaveBeenCalledTimes(1);
    expect(subscribe).not.toHaveBeenCalled();
    expect(memberApi.savePushSubscription).toHaveBeenCalledWith({
      endpoint: 'https://push.test/device',
      p256dh: 'p256dh-value',
      auth: 'auth-value',
    });
  });

  it('replaces a disabled endpoint before saving a fresh browser subscription', async () => {
    requestPermission.mockResolvedValue('granted');
    memberApi.fetchPushSubscriptionStatus.mockResolvedValue({ enabled: false });
    const renewed = {
      endpoint: 'https://push.test/renewed',
      toJSON: () => ({ endpoint: 'https://push.test/renewed', keys: { p256dh: 'new-key', auth: 'new-auth' } }),
    };
    subscribe.mockResolvedValue(renewed);

    await expect(enablePushNotifications('BElong-key', true)).resolves.toMatchObject({ enabled: true });

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(subscribe.mock.invocationCallOrder[0]);
    expect(memberApi.savePushSubscription).toHaveBeenCalledWith({
      endpoint: 'https://push.test/renewed', p256dh: 'new-key', auth: 'new-auth',
    });
  });

  it('does not replace or save a subscription when its server status cannot be read', async () => {
    requestPermission.mockResolvedValue('granted');
    memberApi.fetchPushSubscriptionStatus.mockRejectedValue(new Error('offline'));

    await expectFixedFailure(enablePushNotifications('BElong-key', true), 'granted', 'supabase-save');

    expect(unsubscribe).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(memberApi.savePushSubscription).not.toHaveBeenCalled();
  });

  it('does not revive a disabled endpoint if browser unsubscription fails', async () => {
    requestPermission.mockResolvedValue('granted');
    memberApi.fetchPushSubscriptionStatus.mockResolvedValue({ enabled: false });
    unsubscribe.mockResolvedValue(false);

    await expectFixedFailure(enablePushNotifications('BElong-key', true), 'granted', 'browser-subscription');

    expect(subscribe).not.toHaveBeenCalled();
    expect(memberApi.savePushSubscription).not.toHaveBeenCalled();
  });

  it('reads the authenticated member subscription status without requesting permission', async () => {
    installSupportedPushApi('granted');
    memberApi.fetchPushSubscriptionStatus.mockResolvedValue({ enabled: true });

    await expect(getPushStatus()).resolves.toEqual({
      supported: true,
      permission: 'granted',
      enabled: true,
    });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(memberApi.fetchPushSubscriptionStatus).toHaveBeenCalledWith('https://push.test/device');
  });

  it('reports this device disabled even when another member device is enabled', async () => {
    installSupportedPushApi('granted');
    memberApi.fetchPushSubscriptionStatus.mockResolvedValue({ enabled: false });

    await expect(getPushStatus()).resolves.toMatchObject({ enabled: false });
    expect(memberApi.fetchPushSubscriptionStatus).toHaveBeenCalledWith('https://push.test/device');
  });

  it('disables the saved endpoint before removing the browser subscription', async () => {
    installSupportedPushApi('granted');
    const order: string[] = [];
    memberApi.disablePushSubscription.mockImplementation(async () => {
      order.push('rpc');
      return { disabled: true, endpoint: 'https://push.test/device' };
    });
    unsubscribe.mockImplementation(async () => {
      order.push('unsubscribe');
      return true;
    });

    await expect(disablePushNotifications()).resolves.toEqual({
      supported: true,
      permission: 'granted',
      enabled: false,
    });
    expect(memberApi.disablePushSubscription).toHaveBeenCalledWith('https://push.test/device');
    expect(order).toEqual(['rpc', 'unsubscribe']);
  });

  it('throws the exported fixed error when saving a granted subscription fails', async () => {
    requestPermission.mockResolvedValue('granted');
    memberApi.savePushSubscription.mockRejectedValue(new Error('database unavailable'));

    await expectFixedFailure(enablePushNotifications('BElong-key', true), 'granted', 'supabase-save');
  });

  it('throws the fixed failure with a disabled status when permission prompting fails', async () => {
    requestPermission.mockRejectedValue(new Error('browser failure'));

    await expectFixedFailure(enablePushNotifications('BElong-key', true), 'default');
  });

  it('throws the exported fixed error when no browser subscription can be read', async () => {
    requestPermission.mockResolvedValue('granted');
    getSubscription.mockRejectedValue(new Error('push manager unavailable'));

    await expectFixedFailure(enablePushNotifications('BElong-key', true));
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('throws the exported fixed error when subscribing fails', async () => {
    requestPermission.mockResolvedValue('granted');
    getSubscription.mockResolvedValue(null);
    subscribe.mockRejectedValue(new Error('subscription rejected'));

    await expectFixedFailure(enablePushNotifications('BElong-key', true), 'granted', 'browser-subscription');
  });

  it('throws the exported fixed error for malformed VAPID public keys', async () => {
    requestPermission.mockResolvedValue('granted');
    getSubscription.mockResolvedValue(null);

    await expectFixedFailure(enablePushNotifications('!!!', true));
    expect(memberApi.savePushSubscription).not.toHaveBeenCalled();
  });

  it('returns disabled without a server call when there is no browser subscription', async () => {
    installSupportedPushApi('granted');
    getSubscription.mockResolvedValue(null);

    await expect(disablePushNotifications()).resolves.toEqual({
      supported: true,
      permission: 'granted',
      enabled: false,
    });
    expect(memberApi.disablePushSubscription).not.toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('throws the exported fixed error when disabling the server subscription fails', async () => {
    installSupportedPushApi('granted');
    memberApi.disablePushSubscription.mockRejectedValue(new Error('rpc rejected'));

    const error = await disablePushNotifications().catch((failure: unknown) => failure);
    expect(error).toMatchObject({ status: { supported: true, permission: 'granted', enabled: true } });
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('throws the exported fixed error when browser unsubscribe returns false', async () => {
    installSupportedPushApi('granted');
    unsubscribe.mockResolvedValue(false);

    await expectFixedFailure(disablePushNotifications());
  });

  it('disables the saved endpoint before unsubscribing during logout cleanup', async () => {
    const order: string[] = [];
    memberApi.disablePushSubscription.mockImplementation(async () => {
      order.push('rpc');
      return { disabled: true, endpoint: 'https://push.test/device' };
    });
    unsubscribe.mockImplementation(async () => {
      order.push('unsubscribe');
      return true;
    });

    await cleanupBrowserPushSubscription();

    expect(order).toEqual(['rpc', 'unsubscribe']);
  });

  it('still removes the browser subscription when logout cleanup cannot update the server', async () => {
    memberApi.disablePushSubscription.mockRejectedValue(new Error('rpc rejected'));

    await expect(cleanupBrowserPushSubscription()).rejects.toThrow('rpc rejected');

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

