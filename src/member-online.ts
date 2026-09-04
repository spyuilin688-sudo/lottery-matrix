export type MemberOnlinePost = (
  path: string,
  body: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

let stopActiveTracking: (() => Promise<void>) | null = null;

export async function endActiveMemberOnlineSession() {
  const stop = stopActiveTracking;
  if (!stop) return;
  stopActiveTracking = null;
  await stop();
}

export function startMemberOnlineTracking(post: MemberOnlinePost, target: Document = document) {
  let sessionId = '';
  let stopped = false;
  let startInFlight: Promise<void> | null = null;
  let listenersRemoved = false;
  const start = async () => {
    if (stopped || target.visibilityState !== 'visible' || sessionId || startInFlight) return;
    const request = (async () => {
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
  const end = async () => {
    await startInFlight;
    const current = sessionId;
    sessionId = '';
    if (!current) return;
    try {
      await post('/api/member-online/end', { sessionId: current });
    } catch {
      // The next visible session can still start even if the background request is interrupted.
    }
  };
  const visibility = () => {
    if (target.visibilityState === 'visible') void start();
    else void end();
  };
  const pagehide = () => void end();
  target.addEventListener('visibilitychange', visibility);
  target.defaultView?.addEventListener('pagehide', pagehide);
  void start();
  const stop = async () => {
    stopped = true;
    if (!listenersRemoved) {
      listenersRemoved = true;
      target.removeEventListener('visibilitychange', visibility);
      target.defaultView?.removeEventListener('pagehide', pagehide);
    }
    await end();
  };
  stopActiveTracking = stop;
  return () => {
    if (stopActiveTracking === stop) stopActiveTracking = null;
    void stop();
  };
}
