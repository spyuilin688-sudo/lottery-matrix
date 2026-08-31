"""
Matrix 天工演算法（正式版）

唯一正式口徑：二段式、準2進3、50/80期來源範圍、排除隱藏準3進4、
球位不可循環、加減/合值、+0 合法、完整規則+預測結果完全相同才去重。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


ALGORITHM_VERSION = "tiangong-two-stage-near-2-to-3-v2.0.0"

LOTTERY_CONFIGS: Dict[str, Dict[str, int]] = {
    "今彩539": {"source_range": 50, "draw_size": 5, "max_number": 39},
    "天天樂": {"source_range": 50, "draw_size": 5, "max_number": 39},
    "六合彩": {"source_range": 80, "draw_size": 7, "max_number": 49},
    "大樂透": {"source_range": 80, "draw_size": 7, "max_number": 49},
}


@dataclass(frozen=True)
class Draw:
    period: str
    numbers: Tuple[int, ...]


@dataclass(frozen=True)
class SourceRef:
    step: int
    period: str
    draw_index: int
    ball_index: int
    number: int


@dataclass(frozen=True)
class TiangongRule:
    start_ball: int
    gaps: Tuple[int, int, int, int, int]
    moves: Tuple[str, str, str, str]
    road_type: str
    road_param: Optional[int]


@dataclass
class TiangongResult:
    algorithm_version: str
    lottery: str
    prediction_period: str
    prediction_number: int
    rule: TiangongRule
    sources: List[SourceRef]
    matched_numbers: Tuple[int, int]
    hidden_third_number: Optional[int]


def normalize_draws(raw_draws: Iterable[Any], draw_size: int) -> List[Draw]:
    """
    接受：
      - Draw
      - {"period": ..., "numbers": [...]}
      - (period, numbers)

    輸出固定為由舊到新排序的 Draw list。
    本函式不自行猜測期號排序；呼叫端傳入順序即視為時間順序。
    """
    out: List[Draw] = []
    for item in raw_draws:
        if isinstance(item, Draw):
            draw = item
        elif isinstance(item, dict):
            draw = Draw(str(item["period"]), tuple(int(x) for x in item["numbers"]))
        else:
            period, numbers = item
            draw = Draw(str(period), tuple(int(x) for x in numbers))

        if len(draw.numbers) != draw_size:
            raise ValueError(
                f"period={draw.period}: expected {draw_size} numbers, got {len(draw.numbers)}"
            )
        out.append(draw)
    return out


def arithmetic_road(x1: int, x2: int) -> Tuple[str, int]:
    """加減版路。+0 合法，固定表示為 ('+', 0)。"""
    if x2 >= x1:
        return "+", x2 - x1
    return "-", x1 - x2


def apply_arithmetic(x: int, sign: str, delta: int, max_number: int) -> Optional[int]:
    if sign == "+":
        y = x + delta
    elif sign == "-":
        y = x - delta
    else:
        raise ValueError(f"invalid arithmetic sign: {sign}")
    return y if 1 <= y <= max_number else None


def digit_sum(n: int) -> int:
    return (n // 10) + (n % 10)


def apply_sum_road(x: int, target_sum: int, max_number: int) -> List[int]:
    """合值版路：找出合法範圍內所有十位+個位=target_sum 的值。"""
    return [n for n in range(1, max_number + 1) if digit_sum(n) == target_sum]


def move_ball(ball_index: int, move: str, draw_size: int) -> Optional[int]:
    """
    球位不可循環：
      固定 = 同球位
      遞增 = +1
      遞減 = -1
    超出球位直接無效，不 wrap-around。
    """
    if move == "固定":
        nxt = ball_index
    elif move == "遞增":
        nxt = ball_index + 1
    elif move == "遞減":
        nxt = ball_index - 1
    else:
        raise ValueError(f"invalid move: {move}")
    return nxt if 0 <= nxt < draw_size else None


def source_at(
    draws: Sequence[Draw],
    draw_index: int,
    ball_index: int,
    step: int,
) -> SourceRef:
    d = draws[draw_index]
    return SourceRef(
        step=step,
        period=d.period,
        draw_index=draw_index,
        ball_index=ball_index,
        number=d.numbers[ball_index],
    )


def enumerate_source_paths(
    draws: Sequence[Draw],
    anchor_index: int,
    source_range: int,
    draw_size: int,
) -> Iterable[Tuple[List[SourceRef], Tuple[int, int, int, int, int], Tuple[str, str, str, str]]]:
    """
    產生六個來源點 S1..S6。

    五個間距各自為正整數；來源點必須全部落在 source_range 內。
    四次球位移動各為 固定/遞增/遞減，且不可循環。

    anchor_index 為 S6 所在期；所有來源均往前取。
    """
    min_index = max(0, anchor_index - source_range + 1)
    moves_all = ("固定", "遞增", "遞減")

    for g5 in range(1, anchor_index - min_index + 1):
        i5 = anchor_index - g5
        if i5 < min_index:
            break
        for g4 in range(1, i5 - min_index + 1):
            i4 = i5 - g4
            if i4 < min_index:
                break
            for g3 in range(1, i4 - min_index + 1):
                i3 = i4 - g3
                if i3 < min_index:
                    break
            # 第一段與第二段使用同一組三間距骨架；g1/g2 由 g4/g5 對應。
            # 正式五間距記錄為 (g4, g5, g3, g4, g5)。
            # 此處依來源六點展開：S1,S2,S3 與 S4,S5,S6。
                g1, g2 = g4, g5
                i2 = i3 - g2
                i1 = i2 - g1
                if i1 < min_index:
                    continue

                indices = (i1, i2, i3, i4, i5, anchor_index)
                gaps = (g1, g2, g3, g4, g5)

                for start_ball in range(draw_size):
                    for m1 in moves_all:
                        b2 = move_ball(start_ball, m1, draw_size)
                        if b2 is None:
                            continue
                        for m2 in moves_all:
                            b3 = move_ball(b2, m2, draw_size)
                            if b3 is None:
                                continue
                            for m3 in moves_all:
                                b5 = move_ball(start_ball, m3, draw_size)
                                if b5 is None:
                                    continue
                                for m4 in moves_all:
                                    b6 = move_ball(b5, m4, draw_size)
                                    if b6 is None:
                                        continue

                                    balls = (start_ball, b2, b3, start_ball, b5, b6)
                                    refs = [
                                        source_at(draws, di, bi, step + 1)
                                        for step, (di, bi) in enumerate(zip(indices, balls))
                                    ]
                                    yield refs, gaps, (m1, m2, m3, m4)


def evaluate_path(
    refs: Sequence[SourceRef],
    max_number: int,
) -> Iterable[Tuple[str, Optional[int], int, int, Optional[int]]]:
    """
    二段式、準2進3：
      第一段 S1,S2 -> S3 建立版路。
      第二段 S4,S5 已命中同一版路，S6 為預測來源。
      額外往前比對一次；若已形成隱藏準3進4則排除。

    回傳：road_type, road_param, matched1, matched2, hidden_third。
    """
    a, b, c, d, e, f = [r.number for r in refs]

    sign, delta = arithmetic_road(a, b)
    if apply_arithmetic(a, sign, delta, max_number) == b:
        p1 = apply_arithmetic(d, sign, delta, max_number)
        p2 = apply_arithmetic(e, sign, delta, max_number)
        if p1 == e and p2 == f:
            hidden = apply_arithmetic(c, sign, delta, max_number)
            if hidden is None or hidden != d:
                yield f"加減{sign}", delta, e, f, hidden

    target_sum = digit_sum(b)
    if b in apply_sum_road(a, target_sum, max_number):
        p1s = apply_sum_road(d, target_sum, max_number)
        p2s = apply_sum_road(e, target_sum, max_number)
        if e in p1s and f in p2s:
            hidden_candidates = apply_sum_road(c, target_sum, max_number)
            hidden = d if d in hidden_candidates else None
            if hidden is None:
                yield "合值", target_sum, e, f, None


def predict_from_result(
    road_type: str,
    road_param: Optional[int],
    source_number: int,
    max_number: int,
) -> List[int]:
    if road_type.startswith("加減"):
        sign = road_type[-1]
        y = apply_arithmetic(source_number, sign, int(road_param or 0), max_number)
        return [] if y is None else [y]
    if road_type == "合值":
        return apply_sum_road(source_number, int(road_param or 0), max_number)
    raise ValueError(f"invalid road type: {road_type}")


def result_key(result: TiangongResult) -> Tuple[Any, ...]:
    """只有完整規則 + 預測結果完全相同才去重。"""
    r = result.rule
    return (
        result.lottery,
        result.prediction_period,
        result.prediction_number,
        r.start_ball,
        r.gaps,
        r.moves,
        r.road_type,
        r.road_param,
        tuple((s.period, s.ball_index, s.number) for s in result.sources),
    )


def calculate_tiangong(
    lottery: str,
    raw_draws: Iterable[Any],
    prediction_period: str,
) -> List[TiangongResult]:
    """
    天工正式入口。

    raw_draws：由舊到新，最後一期為預測期之前的最新已開獎期。
    prediction_period：欲預測的期號，只作結果標記，不混入來源資料。
    """
    if lottery not in LOTTERY_CONFIGS:
        raise ValueError(f"unsupported lottery: {lottery}")

    cfg = LOTTERY_CONFIGS[lottery]
    draws = normalize_draws(raw_draws, cfg["draw_size"])
    if len(draws) < 6:
        return []

    source_range = cfg["source_range"]
    max_number = cfg["max_number"]
    draw_size = cfg["draw_size"]
    anchor_index = len(draws) - 1

    unique: Dict[Tuple[Any, ...], TiangongResult] = {}

    for refs, gaps, moves in enumerate_source_paths(
        draws=draws,
        anchor_index=anchor_index,
        source_range=source_range,
        draw_size=draw_size,
    ):
        for road_type, road_param, m1, m2, hidden in evaluate_path(refs, max_number):
            for prediction_number in predict_from_result(
                road_type=road_type,
                road_param=road_param,
                source_number=refs[-1].number,
                max_number=max_number,
            ):
                rule = TiangongRule(
                    start_ball=refs[0].ball_index,
                    gaps=gaps,
                    moves=moves,
                    road_type=road_type,
                    road_param=road_param,
                )
                result = TiangongResult(
                    algorithm_version=ALGORITHM_VERSION,
                    lottery=lottery,
                    prediction_period=str(prediction_period),
                    prediction_number=prediction_number,
                    rule=rule,
                    sources=list(refs),
                    matched_numbers=(m1, m2),
                    hidden_third_number=hidden,
                )
                unique[result_key(result)] = result

    return list(unique.values())


def serialize_result(result: TiangongResult) -> Dict[str, Any]:
    return {
        "algorithm_version": result.algorithm_version,
        "lottery": result.lottery,
        "prediction_period": result.prediction_period,
        "prediction_number": result.prediction_number,
        "rule": {
            "start_ball": result.rule.start_ball + 1,
            "gaps": list(result.rule.gaps),
            "moves": list(result.rule.moves),
            "road_type": result.rule.road_type,
            "road_param": result.rule.road_param,
        },
        "sources": [
            {
                "step": s.step,
                "period": s.period,
                "draw_index": s.draw_index,
                "ball": s.ball_index + 1,
                "number": s.number,
            }
            for s in result.sources
        ],
        "matched_numbers": list(result.matched_numbers),
        "hidden_third_number": result.hidden_third_number,
    }


def calculate_tiangong_api(payload: Dict[str, Any]) -> Dict[str, Any]:
    """可由既有 Worker/API 直接呼叫的純 Python adapter。"""
    lottery = str(payload["lottery"])
    prediction_period = str(payload["prediction_period"])
    draws = payload["draws"]
    results = calculate_tiangong(lottery, draws, prediction_period)
    return {
        "algorithm_version": ALGORITHM_VERSION,
        "lottery": lottery,
        "prediction_period": prediction_period,
        "count": len(results),
        "results": [serialize_result(r) for r in results],
    }
