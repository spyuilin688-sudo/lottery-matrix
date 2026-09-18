export type MemberOnlinePost = (
  path: string,
  body: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

type ResumeMemberOnlineTracking = () => void;

let pauseActiveTracking: (() => Promise<ResumeMemberOnlineTracking>) | null = null;
let stopActiveTracking: (() => Promise<void>) | null = null;

export async function endActiveMemberOnlineSession(): Promise<ResumeMemberOnlineTracking> {
  const pause = pauseActiveTracking;
  if (!pause) return () => undefined;
  return pause();
}

export function startMemberOnlineTracking(post: MemberOnlinePost, target: Document = document) {
  let sessionId = '';
  let stopped = false;
  let paused = false;
  let startInFlight: Promise<void> | null = null;
  let endInFlight: Promise<void> | null = null;
  let pauseGeneration = 0;
  let listenersRemoved = false;
  const start = async () => {
    if (stopped || paused || target.visibilityState !== 'visible' || sessionId || startInFlight) return;
    const request = (async () => {
      const pendingEnd = endInFlight;
      if (pendingEnd) await pendingEnd;
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
  const end = (): Promise<void> => {
    if (endInFlight) return endInFlight;
    const request = (async () => {
      const pendingStart = startInFlight;
      if (pendingStart) await pendingStart;
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
    void request.then(() => {
      if (endInFlight === request) endInFlight = null;
    });
    return request;
  };
  const visibility = () => {
    if (target.visibilityState === 'visible') void start();
    else void end();
  };
  const pagehide = () => void end();
  const addListeners = () => {
    if (!listenersRemoved) return;
    listenersRemoved = false;
    target.addEventListener('visibilitychange', visibility);
    target.defaultView?.addEventListener('pagehide', pagehide);
  };
  const removeListeners = () => {
    if (listenersRemoved) return;
    listenersRemoved = true;
    target.removeEventListener('visibilitychange', visibility);
    target.defaultView?.removeEventListener('pagehide', pagehide);
  };
  listenersRemoved = true;
  addListeners();
  void start();
  const pause = async (): Promise<ResumeMemberOnlineTracking> => {
    if (stopped) return () => undefined;
    const generation = ++pauseGeneration;
    paused = true;
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
  const stop = async () => {
    stopped = true;
    paused = false;
    pauseGeneration += 1;
    removeListeners();
    await end();
  };
  pauseActiveTracking = pause;
  stopActiveTracking = stop;
  return () => {
    if (pauseActiveTracking === pause) pauseActiveTracking = null;
    if (stopActiveTracking === stop) stopActiveTracking = null;
    void stop();
  };
}
