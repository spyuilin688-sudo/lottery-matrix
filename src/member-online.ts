export type MemberOnlinePost = (
  path: string,
  body: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export function startMemberOnlineTracking(post: MemberOnlinePost, target: Document = document) {
  let sessionId = '';
  let stopped = false;
  const start = async () => {
    if (stopped || target.visibilityState !== 'visible' || sessionId) return;
    try {
      const result = await post('/api/member-online/start', {});
      if (!stopped) sessionId = String(result.sessionId ?? '');
    } catch {
      sessionId = '';
    }
  };
  const end = async () => {
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
  return () => {
    stopped = true;
    target.removeEventListener('visibilitychange', visibility);
    target.defaultView?.removeEventListener('pagehide', pagehide);
    void end();
  };
}
