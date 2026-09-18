import { useEffect } from "react";
import type { LotteryId } from "./Prototype";

export const DAILY_SORTED_ONLY_DESCRIPTION = "天天樂僅提供順球";

export function supportsDrawOrder(lottery: LotteryId) {
  return lottery !== "天天樂";
}

export function normalizeLotteryOrder<T extends string>(lottery: LotteryId, order: T, sortedOrder: T): T {
  return supportsDrawOrder(lottery) ? order : sortedOrder;
}

export function useLotteryOrder<T extends string>(
  lottery: LotteryId,
  requestedOrder: T,
  setOrder: (order: T) => void,
  sortedOrder: T,
): T {
  // Normalize during render so restored drafts and immediate queries are safe before effects run.
  const order = normalizeLotteryOrder(lottery, requestedOrder, sortedOrder);
  useEffect(() => {
    if (requestedOrder !== order) setOrder(order);
  }, [order, requestedOrder, setOrder]);
  return order;
}
