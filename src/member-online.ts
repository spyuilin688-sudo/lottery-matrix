export type MemberOnlinePost = (
  path: string,
  body: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

type ResumeMemberOnlineTracking = () => void;

let pauseActiveTracking: (() => Promise<ResumeMemberOnlineTracking>) | null = null;
let stopActiveTracking: (() => Promise<void>) | null = null;
let priorOwnerEnd: Promise<void> | null = null;
const BACKGROUND_TRANSITION_MS = 1_500;

export async function endActiveMemberOnlineSession(): Promise<ResumeMemberOnlineTracking> {
  const pause = pauseActiveTracking;
  if (!pause) return () => undefined;
  return pause();
}

export function startMemberOnlineTracking(post: MemberOnlinePost, target: Document = document): () => void | Promise<void> {
  let sessionId = '';
  let stopped = false;
  let paused = false;
  let startInFlight: Promise<void> | null = null;
  let endInFlight: Promise<void> | null = null;
  let conditionalEndInFlight = false;
  let pauseGeneration = 0;
  let listenersRemoved = false;
  let backgroundTimer: ReturnType<typeof setTimeout> | undefined;
  let visibilityGeneration = 0;
  const cancelBackgroundEnd = () => {
    if (backgroundTimer !== undefined) clearTimeout(backgroundTimer);
    backgroundTimer = undefined;
  };
  const start = async () => {
    if (stopped || paused || target.visibilityState !== 'visible' || sessionId || startInFlight) return;
    const request = (async () => {
      const pendingEnd = endInFlight;
      if (pendingEnd) await pendingEnd;
      const previousOwner = priorOwnerEnd;
      if (previousOwner) await previousOwner;
      if (stopped || paused || target.visibilityState !== 'visible' || sessionId) return;
      try {
        const result = await post('/api/member-online/start', {});
        sessionId = String(result.sessionId ?? '');
      } catch {
        sessionId = '';
      }
    })();
    startInFlight = request;
    await request;
    if (startInFlight === request) startInFlight = null;
  };
  const end = (hiddenGeneration?: number): Promise<void> => {
    if (endInFlight) {
      if (hiddenGeneration === undefined && conditionalEndInFlight) {
        return endInFlight.then(() => end());
      }
      return endInFlight;
    }
    const request = (async () => {
      const pendingStart = startInFlight;
      if (pendingStart) await pendingStart;
      if (hiddenGeneration !== undefined
        && (hiddenGeneration !== visibilityGeneration || target.visibilityState === 'visible')) return;
      const current = sessionId;
      sessionId = '';
      if (!current) return;
      try {
        await post('/api/member-online/end', { sessionId: current });
      } catch {
        // The next visible session can still start even if the background request is interrupted.
      }
    })();
    endInFlight = request;
    conditionalEndInFlight = hiddenGeneration !== undefined;
    void request.then(() => {
      if (endInFlight === request) {
        endInFlight = null;
        conditionalEndInFlight = false;
      }
    });
    return request;
  };
  const scheduleBackgroundEnd = () => {
    if (backgroundTimer !== undefined) return;
    if (endInFlight) {
      const pendingEnd = endInFlight;
      const generation = visibilityGeneration;
      void pendingEnd.then(() => {
        if (!stopped && !paused && generation === visibilityGeneration && target.visibilityState === 'hidden') {
          scheduleBackgroundEnd();
        }
      });
      return;
    }
    const generation = visibilityGeneration;
    backgroundTimer = setTimeout(() => {
      backgroundTimer = undefined;
      if (!stopped && !paused && generation === visibilityGeneration && target.visibilityState === 'hidden') {
        void end(generation);
      }
    }, BACKGROUND_TRANSITION_MS);
  };
  const visibility = () => {
    visibilityGeneration += 1;
    if (target.visibilityState === 'visible') {
      cancelBackgroundEnd();
      // A prior hidden event may still be waiting for a pending start/end.
      // Try again after that end settles; start() still checks current visibility.
      if (endInFlight) void endInFlight.then(() => { void start(); });
      else void start();
    }
    else scheduleBackgroundEnd();
  };
  const pagehide = () => {
    cancelBackgroundEnd();
    void end();
  };
  const pageshow = () => {
    if (target.visibilityState !== 'visible') return;
    if (endInFlight) void endInFlight.then(() => { void start(); });
    else void start();
  };
  const addListeners = () => {
    if (!listenersRemoved) return;
    listenersRemoved = false;
    target.addEventListener('visibilitychange', visibility);
    target.defaultView?.addEventListener('pagehide', pagehide);
    target.defaultView?.addEventListener('pageshow', pageshow);
  };
  const removeListeners = () => {
    if (listenersRemoved) return;
    listenersRemoved = true;
    target.removeEventListener('visibilitychange', visibility);
    target.defaultView?.removeEventListener('pagehide', pagehide);
    target.defaultView?.removeEventListener('pageshow', pageshow);
  };
  listenersRemoved = true;
  addListeners();
  // StrictMode may remove the first owner before this mount turn settles.
  queueMicrotask(() => { if (!stopped) void start(); });
  const pause = async (): Promise<ResumeMemberOnlineTracking> => {
    if (stopped) return () => undefined;
    const generation = ++pauseGeneration;
    paused = true;
    cancelBackgroundEnd();
    removeListeners();
    await end();

    return () => {
      if (stopped || generation !== pauseGeneration) return;
      pauseGeneration += 1;
      paused = false;
      addListeners();
      void start();
    };
  };
  const stop = () => {
    stopped = true;
    paused = false;
    pauseGeneration += 1;
    cancelBackgroundEnd();
    removeListeners();
    const finished = end();
    priorOwnerEnd = finished;
    void finished.finally(() => { if (priorOwnerEnd === finished) priorOwnerEnd = null; });
    return finished;
  };
  pauseActiveTracking = pause;
  stopActiveTracking = stop;
  return () => {
    if (pauseActiveTracking === pause) pauseActiveTracking = null;
    if (stopActiveTracking === stop) stopActiveTracking = null;
    return stop();
  };
}
