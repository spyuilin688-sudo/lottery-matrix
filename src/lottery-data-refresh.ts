import type { NumberBallLottery } from './NumberBall';
import { subscribeMatrixDataRevision } from './matrix-data-revision';

// Mounted readers share one cadence per lottery. No work remains after the last reader leaves.
const groups = new Map<NumberBallLottery, { listeners: Set<() => void>; dispose: () => void }>();

export function subscribeLotteryRefresh(lottery: NumberBallLottery, listener: () => void) {
  let group = groups.get(lottery);
  if (!group) {
    const listeners = new Set<() => void>();
    let queued: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      listeners.forEach(callback => callback());
    };
    // Run after the API finishes replacing all related caches, coalescing one update.
    const queueRefresh = () => {
      if (queued !== undefined) return;
      queued = setTimeout(() => { queued = undefined; refresh(); }, 0);
    };
    const timer = setInterval(refresh, 60_000);
    const unsubscribe = subscribeMatrixDataRevision(queueRefresh);
    document.addEventListener('visibilitychange', queueRefresh);
    window.addEventListener('online', queueRefresh);
    group = { listeners, dispose: () => {
      clearInterval(timer);
      if (queued !== undefined) clearTimeout(queued);
      unsubscribe();
      document.removeEventListener('visibilitychange', queueRefresh);
      window.removeEventListener('online', queueRefresh);
    } };
    groups.set(lottery, group);
  }
  group.listeners.add(listener);
  return () => {
    group.listeners.delete(listener);
    if (group.listeners.size === 0) {
      group.dispose();
      groups.delete(lottery);
    }
  };
}
