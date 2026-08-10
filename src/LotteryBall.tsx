import type { LotteryId } from "./Prototype";

export type LotteryBallTone = "orange" | "white" | "red" | "green" | "blue";

export const MARK_SIX_RED = new Set([
  "01", "02", "07", "08", "12", "13", "18", "19", "23",
  "24", "29", "30", "34", "35", "40", "45", "46",
]);

export const MARK_SIX_BLUE = new Set([
  "03", "04", "09", "10", "14", "15", "20", "25",
  "26", "31", "36", "37", "41", "42", "47", "48",
]);

export function getLotteryBallTone(
  lottery: LotteryId,
  number: string,
): LotteryBallTone {
  if (lottery === "今彩539") return "orange";
  if (lottery === "天天樂") return "white";
  if (lottery === "大樂透") return "red";
  if (MARK_SIX_RED.has(number)) return "red";
  if (MARK_SIX_BLUE.has(number)) return "blue";
  return "green";
}

export type LotteryBallProps = {
  lottery: LotteryId;
  number: string;
  isSpecial?: boolean;
  className?: string;
};

export function LotteryBall({
  lottery,
  number,
  isSpecial = false,
  className = "",
}: LotteryBallProps) {
  const tone = getLotteryBallTone(lottery, number);
  const usesDarkText =
    lottery === "今彩539" ||
    lottery === "天天樂" ||
    lottery === "六合彩";

  return (
    <span
      className={`number-ball ${className}`.trim()}
      data-lottery={lottery}
      data-special={isSpecial}
      data-tone={tone}
      data-dark-text={usesDarkText}
      aria-label={`${isSpecial ? "特別號" : "號碼"} ${number}`}
    >
      <span className="ball-surface" aria-hidden="true" />
      <span className="ball-number" aria-hidden="true">{number}</span>
    </span>
  );
}
