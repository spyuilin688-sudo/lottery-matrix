import { getSupabaseClient } from './lib/supabase';
import { confirmPublishedResultRevisions, invalidatePublishedLotteryData } from './lottery-api';
import type { NumberBallLottery } from './NumberBall';

const LOTTERIES: readonly string[] = ['今彩539', '天天樂', '六合彩', '大樂透'];

// One subscription while the home page is mounted. Timed cache expiry still
// rechecks the public API if the browser misses a database event.
export function subscribePublishedResultRefresh() {
  let disposed = false;
  let connected = false;
  let connectionRevision = 0;
  let probePending = false;
  let probeAgain = false;
  let streamReady = false;
  let connectionReady = false;
  let client: ReturnType<typeof getSupabaseClient> | undefined;
  let channel: ReturnType<ReturnType<typeof getSupabaseClient>['channel']> | undefined;
  const revisions = new Map<string, number>();
  const confirmReady = () => {
    if (disposed || !connectionReady) return;
    if (probePending) { probeAgain = true; return; }
    probePending = true;
    const revision = connectionRevision;
    void confirmPublishedResultRevisions(() => !disposed && connectionReady && revision === connectionRevision)
      .catch(() => { /* Existing timed cache expiry remains the fallback. */ })
      .finally(() => {
        probePending = false;
        if (probeAgain) { probeAgain = false; confirmReady(); }
      });
  };
  const markReady = () => {
    if (!connected || !streamReady || connectionReady) return;
    connectionReady = true;
    connectionRevision += 1;
    confirmReady();
  };

  try {
    client = getSupabaseClient();
    channel = client.channel('matrix-published-results');
    channel.on('system', '*', message => {
      if (disposed || message.extension !== 'postgres_changes') return;
      streamReady = message.status === 'ok';
      if (!streamReady) connectionReady = false;
      markReady();
    });
    channel.on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'matrix_card_signals',
    }, message => {
      if (disposed) return;
      const record = message.new as { lottery?: unknown; revision?: unknown } | undefined;
      if (!record || typeof record.lottery !== 'string' || !LOTTERIES.includes(record.lottery)
        || !Number.isSafeInteger(record.revision) || (record.revision as number) < 0) return;
      const previous = revisions.get(record.lottery);
      if (previous !== undefined && previous >= (record.revision as number)) return;
      revisions.set(record.lottery, record.revision as number);
      connectionRevision += 1; // A late probe cannot supersede an observed publication.
      if (probePending) probeAgain = true;
      invalidatePublishedLotteryData(record.lottery as NumberBallLottery);
    });
    channel.subscribe(status => {
      if (disposed) return;
      if (status === 'SUBSCRIBED') {
        connected = true;
        markReady();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        connected = false;
        streamReady = false;
        connectionReady = false;
      }
    });
  } catch { /* Revalidate through the bounded cache TTL if Realtime is unavailable. */ }

  return () => {
    disposed = true;
    if (client && channel) void client.removeChannel(channel).catch(() => {});
  };
}
