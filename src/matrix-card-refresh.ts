import type { NumberBallLottery } from './NumberBall';
import { getSupabaseClient } from './lib/supabase';

type PublishedCard = {
  generation?: string;
  cards: Partial<Record<'sorted' | 'draw', { url: string }>>;
};

function hasPublishedCardChanged(
  signal: { lottery?: unknown; generation?: unknown; orders?: unknown },
  lottery: NumberBallLottery,
  current: PublishedCard | null,
) {
  if (signal.lottery !== lottery
    || (signal.generation !== null && typeof signal.generation !== 'string')
    || !Array.isArray(signal.orders)
    || signal.orders.some(order => order !== 'sorted' && order !== 'draw')
    || new Set(signal.orders).size !== signal.orders.length) return false;
  const shown = Object.keys(current?.cards ?? {});
  return signal.generation !== (current?.generation ?? null)
    || signal.orders.length !== shown.length
    || signal.orders.some(order => !shown.includes(order));
}

// Only a mounted card reader subscribes. A failed channel retains the prior
// hourly refresh; a healthy channel reads the card only after publication.
export function subscribeMatrixCardRefresh(
  lottery: NumberBallLottery,
  refresh: (requireFresh?: boolean) => Promise<boolean>,
  currentCard: () => PublishedCard | null,
) {
  let disposed = false;
  let queued: ReturnType<typeof setTimeout> | undefined;
  let fallback: ReturnType<typeof setInterval> | undefined;
  let client: ReturnType<typeof getSupabaseClient> | undefined;
  let channel: ReturnType<ReturnType<typeof getSupabaseClient>['channel']> | undefined;
  let pendingSignal: { lottery?: unknown; generation?: unknown; orders?: unknown } | undefined;
  let pendingKey: string | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryAttempts = 0;
  let recoveryNeeded = false;
  let connected = false;
  let streamReady = false;
  let refreshing = false;
  let readinessRead = false;

  const clearRetry = () => {
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
  };
  const queueRefresh = () => {
    if (disposed || document.visibilityState === 'hidden' || queued !== undefined || refreshing) return;
    queued = setTimeout(() => {
      queued = undefined;
      if (disposed || document.visibilityState === 'hidden') return;
      const expected = pendingSignal;
      refreshing = true;
      const requireFresh = readinessRead;
      readinessRead = false;
      void refresh(requireFresh).then(success => {
        refreshing = false;
        if (disposed) return;
        // A newer publication may arrive while a coalesced read is pending.
        // Recheck that signal once this read settles, never concurrently.
        if (readinessRead || (expected !== pendingSignal && pendingSignal
          && hasPublishedCardChanged(pendingSignal, lottery, currentCard()))) {
          queueRefresh();
          return;
        }
        if (pendingSignal && success && !hasPublishedCardChanged(pendingSignal, lottery, currentCard())) {
          pendingSignal = undefined;
          pendingKey = undefined;
          retryAttempts = 0;
          recoveryNeeded = false;
          clearRetry();
          if (connected && streamReady) stopFallback();
        } else if (!expected && success) {
          retryAttempts = 0;
          recoveryNeeded = false;
          clearRetry();
          if (connected && streamReady) stopFallback();
        } else if (!success || expected) {
          // A published signal can precede an API replica or a transient error.
          // Retry only that mismatch, with an upper bound and no standing poll.
          if (retryAttempts < 3) {
            const delay = [2_000, 10_000, 30_000][retryAttempts++];
            clearRetry();
            retryTimer = setTimeout(() => { retryTimer = undefined; queueRefresh(); }, delay);
          } else {
            // Keep the expected card for the next recovery read. A long outage
            // must not leave a healthy socket showing an old card indefinitely.
            recoveryNeeded = true;
            startFallback();
          }
        }
      });
    }, 0);
  };
  const startFallback = () => {
    fallback ??= setInterval(queueRefresh, 3_600_000);
  };
  const stopFallback = () => {
    if (fallback !== undefined) clearInterval(fallback);
    fallback = undefined;
  };

  startFallback();
  document.addEventListener('visibilitychange', queueRefresh);
  window.addEventListener('online', queueRefresh);
  try {
    client = getSupabaseClient();
    channel = client.channel(`matrix-card:${lottery}`);
    channel.on('system', '*', payload => {
      if (disposed || payload.extension !== 'postgres_changes') return;
      if (payload.status === 'ok') {
        if (streamReady) return;
        streamReady = true;
        if (connected) {
          if (!recoveryNeeded) stopFallback();
          // SUBSCRIBED can precede the replication listener; read after its ack.
          readinessRead = true;
          queueRefresh();
        }
      } else {
        streamReady = false;
        startFallback();
      }
    });
    channel.on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'matrix_card_signals', filter: `lottery=eq.${lottery}`,
    }, message => {
      const payload = message.new as { lottery?: unknown; generation?: unknown; orders?: unknown } | undefined;
      if (!payload || !hasPublishedCardChanged(payload, lottery, currentCard())) return;
      const signal = JSON.stringify([payload.generation, payload.orders]);
      if (signal === pendingKey) return;
      pendingSignal = payload;
      pendingKey = signal;
      retryAttempts = 0;
      clearRetry();
      queueRefresh();
    });
    channel.subscribe(status => {
      if (disposed) return;
      if (status === 'SUBSCRIBED') {
        connected = true;
        if (streamReady) {
          if (!recoveryNeeded) stopFallback();
          readinessRead = true;
          queueRefresh();
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        connected = false;
        streamReady = false;
        startFallback();
      }
    });
  } catch {
    // Unsupported or unavailable Realtime must not hide cards or stop recovery.
  }

  return () => {
    disposed = true;
    stopFallback();
    if (queued !== undefined) clearTimeout(queued);
    clearRetry();
    document.removeEventListener('visibilitychange', queueRefresh);
    window.removeEventListener('online', queueRefresh);
    if (client && channel) void client.removeChannel(channel).catch(() => {});
  };
}
