import { useState } from "react";

export type NumberBallLottery = "今彩539" | "天天樂" | "六合彩" | "大樂透";
export type NumberBallTone = "orange" | "white" | "red" | "blue" | "green";

const MARK_SIX_RED = new Set([
  "01", "02", "07", "08", "12", "13", "18", "19", "23", "24",
  "29", "30", "34", "35", "40", "45", "46",
]);

const MARK_SIX_BLUE = new Set([
  "03", "04", "09", "10", "14", "15", "20", "25", "26", "31",
  "36", "37", "41", "42", "47", "48",
]);

const BALL_ASSET: Record<NumberBallLottery, Partial<Record<NumberBallTone, string>>> = {
  今彩539: {
    orange: "/assets/lottery/balls/jincai-539.png",
  },
  天天樂: {
    white: "/assets/lottery/balls/tiantianle.png",
  },
  六合彩: {
    red: "/assets/lottery/balls/marksix-red.png",
    blue: "/assets/lottery/balls/marksix-blue.png",
    green: "/assets/lottery/balls/marksix-green.png",
  },
  大樂透: {
    red: "/assets/lottery/balls/lotto-649.png",
  },
};

export function normalizeBallNumber(number: string | number) {
  return String(number).padStart(2, "0");
}

export function getBallTone(
  lottery: NumberBallLottery,
  number: string | number,
): NumberBallTone {
  const value = normalizeBallNumber(number);

  if (lottery === "今彩539") return "orange";
  if (lottery === "天天樂") return "white";
  if (lottery === "大樂透") return "red";
  if (MARK_SIX_BLUE.has(value)) return "blue";
  if (MARK_SIX_RED.has(value)) return "red";
  return "green";
}

export type NumberBallProps = {
  lottery: NumberBallLottery;
  number: string | number;
  isSpecial?: boolean;
  className?: string;
};

export function NumberBall({
  lottery,
  number,
  isSpecial = false,
  className = "",
}: NumberBallProps) {
  const value = normalizeBallNumber(number);
  const tone = getBallTone(lottery, value);
  const asset = BALL_ASSET[lottery][tone];
  const [assetFailed, setAssetFailed] = useState(false);
  const usesDarkText =
    lottery === "今彩539" || lottery === "天天樂" || lottery === "六合彩";

  return (
    <span
      className={`number-ball ${className}`.trim()}
      data-lottery={lottery}
      data-special={isSpecial}
      data-tone={tone}
      data-dark-text={usesDarkText}
      aria-label={`${isSpecial ? "特別號" : "號碼"} ${value}`}
    >
      <span className="ball-surface" aria-hidden="true" />
      {asset && !assetFailed ? (
        <img
          className="ball-asset"
          src={asset}
          alt=""
          aria-hidden="true"
          draggable={false}
          onError={() => setAssetFailed(true)}
        />
      ) : null}
      <span className="ball-number" aria-hidden="true">{value}</span>
    </span>
  );
}

export default NumberBall;
