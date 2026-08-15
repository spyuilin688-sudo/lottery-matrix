import { useEffect, useState } from 'react';
import type { NumberBallLottery } from './NumberBall';
import { fetchLatestLotteryDraw, type LotteryDrawRecord } from './lottery-api';

export function useLatestLotteryDraw(lottery: NumberBallLottery) {
  const [data, setData] = useState<LotteryDrawRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const refreshLatestDraw = () => {
      fetchLatestLotteryDraw(lottery)
        .then((record) => {
          if (active) {
            setData(record);
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (!active) return;
          setError(reason instanceof Error ? reason.message : '讀取開獎資料失敗');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };

    refreshLatestDraw();
    const refreshTimer = window.setInterval(refreshLatestDraw, 60_000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, [lottery]);

  return { data, loading, error };
}

export default useLatestLotteryDraw;
