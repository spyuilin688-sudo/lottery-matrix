import { disablePushSubscription, fetchPushSubscriptionStatus, savePushSubscription } from './member-api';

export type PushStatus = { supported: boolean; permission: NotificationPermission; enabled: boolean };
export type PushSubscriptionFailureStage =
  | 'service-worker-registration'
  | 'browser-subscription'
  | 'supabase-save';
type PushContext = { pushManager: PushManager };
const SERVICE_WORKER_PATH = '/push-service-worker.js';
const REGISTRATION_TIMEOUT_MS = 10_000;

export class PushSubscriptionError extends Error {
  readonly status: PushStatus;
  readonly stage?: PushSubscriptionFailureStage;

  constructor(status: PushStatus, stage?: PushSubscriptionFailureStage) {
    super('PUSH_SUBSCRIPTION_FAILED');
    this.name = 'PushSubscriptionError';
    this.status = status;
    this.stage = stage;
  }
}

function serviceWorkerContainer(): ServiceWorkerContainer | null {
  if (typeof navigator === 'undefined') return null;
  const serviceWorker = navigator.serviceWorker;
  if (!serviceWorker || typeof serviceWorker.register !== 'function') return null;
  return serviceWorker;
}

// Notifications are optional; the PWA worker also owns caching and LINE handoff.
function supportsPushNotifications(): boolean {
  return typeof Notification !== 'undefined' && serviceWorkerContainer() !== null;
}

function registrationTimeoutError() {
  return new Error('PUSH_SERVICE_WORKER_TIMEOUT');
}

function withRegistrationTimeout<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(registrationTimeoutError());
    }, REGISTRATION_TIMEOUT_MS);
    void operation(controller.signal).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function observeControllerChange(serviceWorker: ServiceWorkerContainer, signal: AbortSignal) {
  let changed = false;
  let resolveChange!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolveChange = resolve;
  });
  const handleChange = () => {
    changed = true;
    resolveChange();
  };
  const handleAbort = () => {
    serviceWorker.removeEventListener('controllerchange', handleChange);
    resolveChange();
  };
  serviceWorker.addEventListener('controllerchange', handleChange);
  signal.addEventListener('abort', handleAbort, { once: true });
  if (signal.aborted) handleAbort();
  return {
    changed: () => changed,
    promise,
    stop: () => {
      serviceWorker.removeEventListener('controllerchange', handleChange);
      signal.removeEventListener('abort', handleAbort);
    },
  };
}

export async function registerPushServiceWorker(
  { update = true }: { update?: boolean } = {},
): Promise<ServiceWorkerRegistration> {
  const serviceWorker = serviceWorkerContainer();
  if (!serviceWorker) throw new Error('PUSH_SERVICE_WORKER_UNSUPPORTED');
  return withRegistrationTimeout(async (signal) => {
    const existing = typeof serviceWorker.getRegistration === 'function'
      ? await serviceWorker.getRegistration(SERVICE_WORKER_PATH)
      : undefined;
    if (!existing) return await serviceWorker.register(SERVICE_WORKER_PATH);
    // Push operations can use an activated worker without a network update.
    // Startup still waits for updates needed by the LINE return handshake.
    if (!update && existing.active?.state === 'activated') return existing;
    if (typeof existing.update !== 'function') return existing;

    const previousController = serviceWorker.controller;
    const controllerChange = observeControllerChange(serviceWorker, signal);
    try {
      const updated = await existing.update();
      if (signal.aborted) throw registrationTimeoutError();
      if (controllerChange.changed() || serviceWorker.controller !== previousController) return updated;
      if (!updated.installing && !updated.waiting) return updated;
      await controllerChange.promise;
      if (signal.aborted) throw registrationTimeoutError();
      return updated;
    } finally {
      controllerChange.stop();
    }
  });
}

async function getRegisteredServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  const serviceWorker = serviceWorkerContainer();
  if (!serviceWorker) return null;
  return withRegistrationTimeout(async (signal) => {
    const existing = typeof serviceWorker.getRegistration === 'function'
      ? await serviceWorker.getRegistration(SERVICE_WORKER_PATH)
      : undefined;
    if (existing) return existing;
    if (!serviceWorker.ready) return null;
    const registration = await serviceWorker.ready;
    if (signal.aborted) throw registrationTimeoutError();
    return registration;
  });
}

async function getPushContext(): Promise<PushContext | null> {
  if (!supportsPushNotifications()) return null;
  let registration: ServiceWorkerRegistration | null;
  try {
    registration = await getRegisteredServiceWorker();
  } catch {
    return failure(Notification.permission, false, 'service-worker-registration');
  }
  // Missing or unavailable registration is recoverable; only a registered
  // worker lacking PushManager establishes that this browser cannot use push.
  if (!registration) return failure(Notification.permission, false, 'service-worker-registration');
  const pushManager = registration.pushManager;
  if (!pushManager || typeof pushManager.getSubscription !== 'function' || typeof pushManager.subscribe !== 'function') return null;
  return { pushManager };
}

function unsupportedStatus(): PushStatus {
  return { supported: false, permission: 'default', enabled: false };
}

function failure(
  permission: NotificationPermission,
  enabled = false,
  stage?: PushSubscriptionFailureStage,
): never {
  throw new PushSubscriptionError({ supported: true, permission, enabled }, stage);
}

function urlBase64ToUint8Array(value: string) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function subscriptionInput(subscription: PushSubscription) {
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) return null;
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

export async function getPushStatus(authenticated = true): Promise<PushStatus> {
  if (!supportsPushNotifications()) return unsupportedStatus();
  if (!authenticated) return { supported: true, permission: Notification.permission, enabled: false };
  const context = await getPushContext();
  if (!context) return unsupportedStatus();
  const permission = Notification.permission;
  if (permission !== 'granted') return { supported: true, permission, enabled: false };
  try {
    const subscription = await context.pushManager.getSubscription();
    if (!subscription) return { supported: true, permission, enabled: false };
    const { enabled } = await fetchPushSubscriptionStatus(subscription.endpoint);
    return { supported: true, permission, enabled };
  } catch {
    return failure(permission);
  }
}

export function enablePushNotifications(publicKey: string, authenticated = false): Promise<PushStatus> {
  if (!supportsPushNotifications()) return Promise.resolve(unsupportedStatus());
  const permission = Notification.permission;
  if (!authenticated) return Promise.reject(new PushSubscriptionError({ supported: true, permission, enabled: false }));
  const permissionRequest = permission === 'default'
    ? Notification.requestPermission()
    : Promise.resolve(permission);
  return (async () => {
    let resolvedPermission = permission;
    try {
      resolvedPermission = await permissionRequest;
    } catch {
      return failure(resolvedPermission);
    }
    if (resolvedPermission !== 'granted') return { supported: true, permission: resolvedPermission, enabled: false };

    let registration: ServiceWorkerRegistration;
    try {
      const existingRegistration = await getRegisteredServiceWorker();
      if (!existingRegistration) return failure(resolvedPermission, false, 'service-worker-registration');
      registration = existingRegistration;
    } catch {
      return failure(resolvedPermission, false, 'service-worker-registration');
    }

    const pushManager = registration?.pushManager;
    if (!pushManager || typeof pushManager.getSubscription !== 'function' || typeof pushManager.subscribe !== 'function') {
      return failure(resolvedPermission, false, 'browser-subscription');
    }

    let input: ReturnType<typeof subscriptionInput>;
    try {
      let subscription = await pushManager.getSubscription();
      if (subscription) {
        let enabled: boolean;
        try {
          ({ enabled } = await fetchPushSubscriptionStatus(subscription.endpoint));
        } catch {
          return failure(resolvedPermission, false, 'supabase-save');
        }
        if (!enabled) {
          if (!await subscription.unsubscribe()) return failure(resolvedPermission, false, 'browser-subscription');
          subscription = null;
        }
      }
      subscription ??= await pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      input = subscriptionInput(subscription);
    } catch (error) {
      if (error instanceof PushSubscriptionError) throw error;
      return failure(resolvedPermission, false, 'browser-subscription');
    }
    if (!input) return failure(resolvedPermission, false, 'browser-subscription');

    try {
      const { enabled } = await savePushSubscription(input);
      return { supported: true, permission: resolvedPermission, enabled };
    } catch {
      return failure(resolvedPermission, false, 'supabase-save');
    }
  })();
}

export async function disablePushNotifications(): Promise<PushStatus> {
  const context = await getPushContext();
  if (!context) return unsupportedStatus();
  const permission = Notification.permission;
  try {
    const subscription = await context.pushManager.getSubscription();
    if (!subscription) return { supported: true, permission, enabled: false };
    try {
      await disablePushSubscription(subscription.endpoint);
    } catch {
      return failure(permission, true);
    }
    if (!await subscription.unsubscribe()) return failure(permission);
    return { supported: true, permission, enabled: false };
  } catch (error) {
    if (error instanceof PushSubscriptionError) throw error;
    return failure(permission);
  }
}

export async function cleanupBrowserPushSubscription(): Promise<void> {
  const context = await getPushContext();
  if (!context) return;
  const subscription = await context.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await disablePushSubscription(subscription.endpoint);
  } finally {
    await subscription.unsubscribe();
  }
}

