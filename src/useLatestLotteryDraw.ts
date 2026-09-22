import { subscribeLotteryRefresh } from "./lottery-data-refresh";
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NumberBallLottery } from './NumberBall';
import { fetchLatestLotteryDraw, type LotteryDrawRecord } from './lottery-api';

type LatestDrawOptions = {
  subscribeToRefresh?: boolean;
  initialFetch?: boolean;
};

export function useLatestLotteryDraw(
  lottery: NumberBallLottery,
  options: LatestDrawOptions = {},
) {
  const subscribeToRefresh = options.subscribeToRefresh ?? true;
  const initialFetch = options.initialFetch ?? true;
  const [dataLottery, setDataLottery] = useState(lottery);
  const [data, setData] = useState<LotteryDrawRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const revision = useRef(0);
  const currentLottery = useRef(lottery);

  const refresh = useCallback(async (): Promise<LotteryDrawRecord | null | undefined> => {
    const requestedLottery = lottery;
    const current = ++revision.current;
    try {
      const record = await fetchLatestLotteryDraw(requestedLottery);
      if (active.current && current === revision.current && currentLottery.current === requestedLottery) {
        setData(record);
        setError(null);
        setLoading(false);
        return record;
      }
    } catch (reason: unknown) {
      if (active.current && current === revision.current && currentLottery.current === requestedLottery) {
        setError(reason instanceof Error ? reason.message : '讀取開獎資料失敗');
        setLoading(false);
      }
    }
    return undefined;
  }, [lottery]);

  useEffect(() => {
    active.current = true;
    currentLottery.current = lottery;
    revision.current += 1;
    setDataLottery(lottery);
    setData(null);
    setLoading(true);
    setError(null);

    if (initialFetch) void refresh();
    const unsubscribe = subscribeToRefresh
      ? subscribeLotteryRefresh(lottery, () => { void refresh(); })
      : () => {};

    return () => {
      active.current = false;
      revision.current += 1;
      unsubscribe();
    };
  }, [initialFetch, lottery, refresh, subscribeToRefresh]);

  // Effects run after render: never pair the newly selected lottery with the
  // previous lottery's result, even during that first render before cleanup.
  return dataLottery === lottery
    ? { data, loading, error, refresh }
    : { data: null, loading: true, error: null, refresh };
}

export default useLatestLotteryDraw;
