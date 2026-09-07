#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""樂彩 Matrix｜Matrix 天工演算法核心。

正式固定範圍
------------
- 模式：二段式。
- 命中條件：準2進3。
- 來源期：三組等距排列，50／80期只限制來源組合。
- 第一段：C、B、A 三組使用相同完整規則成立。
- 第二段：C、B 使用相同完整規則成立，A 套用規則預測下一期。
- 排除：向更舊的 D 組延伸；若相同完整規則兩段皆成立，排除隱藏準3進4。
- 球位：固定、依序遞增、依序遞減；球位不可循環。
- 版路：循環加減、直接合值；+0 是合法加減規則。
- 去重：只有完整規則與預測結果全部相同才去重。

輸入的 ``draws`` 必須依期數由舊到新排列；正碼統一由小到大排序，特別號保留最後，``target_period``
是緊接在最後一筆歷史資料之後、尚未開獎的下一期。

本檔只使用 Python 標準函式庫，可作為模組匯入，也可直接以 CLI 執行：

    python tiangong_algorithm.py input.json --pretty
    cat input.json | python tiangong_algorithm.py - --pretty
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

ALGORITHM_VERSION = "tiangong-two-stage-near-2-to-3-v2.1.0-sorted"

RuleKind = Literal["add_sub", "sum"]
PatternKind = Literal["fixed", "increasing", "decreasing"]


LOTTERY_SPECS: dict[str, dict[str, Any]] = {
    "今彩539": {"canonical": "今彩539", "ball_count": 5, "max_number": 39},
    "天天樂": {"canonical": "天天樂", "ball_count": 5, "max_number": 39},
    "六合彩": {"canonical": "六合彩", "ball_count": 7, "max_number": 49},
    "香港六合彩": {"canonical": "六合彩", "ball_count": 7, "max_number": 49},
    "大樂透": {"canonical": "大樂透", "ball_count": 7, "max_number": 49},
}

MODE_ALIASES = {
    "二段式": "two_stage",
    "two_stage": "two_stage",
}

HIT_RULE_ALIASES = {
    "準2進3": "near_2_to_3",
    "準2進3（排除準3進4）": "near_2_to_3",
    "near_2_to_3": "near_2_to_3",
    "2_to_3": "near_2_to_3",
}

PATTERN_ALIASES = {
    "固定": "fixed",
    "fixed": "fixed",
    "依序遞增": "increasing",
    "遞增": "increasing",
    "increasing": "increasing",
    "依序遞減": "decreasing",
    "遞減": "decreasing",
    "decreasing": "decreasing",
}

ROUTE_ALIASES = {
    "加減": "add_sub",
    "加減版路": "add_sub",
    "add_sub": "add_sub",
    "合值": "sum",
    "合值版路": "sum",
    "sum": "sum",
}

PATTERN_LABELS = {
    "fixed": "固定",
    "increasing": "依序遞增",
    "decreasing": "依序遞減",
}

ROUTE_LABELS = {
    "add_sub": "加減",
    "sum": "合值",
}


class TiangongError(ValueError):
    """天工輸入或計算錯誤。"""


class HistoryCoverageError(TiangongError):
    """歷史範圍不足，無法完成必要的 D 組排除檢查。"""


@dataclass(frozen=True, slots=True)
class Rule:
    """一段版路的唯一規則身分。"""

    kind: RuleKind
    value: int


@dataclass(frozen=True, slots=True)
class SourceGroup:
    """以最新一期為位置 1 時的 A／B／C 等距來源組。"""

    a: int
    b: int
    c: int
    spacing: int

    @property
    def d(self) -> int:
        """向更舊一期距延伸的 D 位置。"""

        return self.a + 3 * self.spacing


@dataclass(frozen=True, slots=True)
class PositionPath:
    """C→B→A 球位路徑，以及向更舊 D 組延伸的球位。"""

    pattern: PatternKind
    positions: tuple[int, ...]
    d_position: int | None


@dataclass(frozen=True, slots=True)
class Draw:
    period: str
    numbers: tuple[int, ...]
    draw_date: str | None = None


@dataclass(frozen=True, slots=True)
class ParsedRequest:
    lottery: str
    ball_count: int
    max_number: int
    draws: tuple[Draw, ...]
    target_period: str
    source_window: int
    mode: Literal["two_stage"]
    hit_rule: Literal["near_2_to_3"]
    source_patterns: tuple[PatternKind, ...]
    stage1_patterns: tuple[PatternKind, ...]
    stage1_routes: tuple[RuleKind, ...]
    stage2_patterns: tuple[PatternKind, ...]
    stage2_routes: tuple[RuleKind, ...]
    strict_history: bool


# ---------------------------------------------------------------------------
# 公開規則函式
# ---------------------------------------------------------------------------


def is_valid_sorted_prediction(number: int, position: int, maximum: int, main_count: int) -> bool:
    if main_count == 6 and position == 7:
        return 1 <= number <= maximum
    return 1 <= position <= main_count and position <= number <= maximum - main_count + position


def normalize_number(value: int, max_number: int) -> int:
    """將任意整數循環正規化至 ``1..max_number``。"""

    if not isinstance(max_number, int) or max_number < 1:
        raise ValueError("max_number 必須是大於 0 的整數")
    return ((int(value) - 1) % max_number) + 1


def add_sub_aliases(residue: int, modulus: int) -> dict[str, str]:
    """回傳同一循環加減規則的正值與負值顯示別名。"""

    normalized = int(residue) % int(modulus)
    if normalized == 0:
        return {"positive": "+0", "negative": "0"}
    return {
        "positive": f"+{normalized}",
        "negative": str(normalized - modulus),
    }


def derive_rules(
    base: int,
    target: int,
    max_number: int,
    enabled_types: Sequence[str] = ("add_sub", "sum"),
) -> tuple[Rule, ...]:
    """由一組已知的基礎號碼與結果號碼直接反推候選規則。

    每種啟用類型最多產生一條規則；不暴力列舉全部加減值或合值。
    ``+0`` 保留為合法 ``add_sub`` 規則。
    """

    if not 1 <= int(base) <= max_number or not 1 <= int(target) <= max_number:
        raise ValueError("base 與 target 必須位於彩種合法號碼範圍")

    normalized_types: list[RuleKind] = []
    for raw in enabled_types:
        key = str(raw).strip()
        if key not in ("add_sub", "sum"):
            raise ValueError(f"不支援的版路類型：{raw}")
        if key not in normalized_types:
            normalized_types.append(key)  # type: ignore[arg-type]

    rules: list[Rule] = []
    if "add_sub" in normalized_types:
        rules.append(Rule("add_sub", (int(target) - int(base)) % max_number))
    if "sum" in normalized_types:
        rules.append(Rule("sum", int(base) + int(target)))
    return tuple(rules)


def apply_rule(base: int, rule: Rule, max_number: int) -> int | None:
    """套用規則；合值結果超界時回傳 ``None``，不得循環補回。"""

    if not 1 <= int(base) <= max_number:
        raise ValueError("base 必須位於彩種合法號碼範圍")

    if rule.kind == "add_sub":
        return normalize_number(int(base) + int(rule.value), max_number)
    if rule.kind == "sum":
        result = int(rule.value) - int(base)
        return result if 1 <= result <= max_number else None
    raise ValueError(f"不支援的規則類型：{rule.kind}")


def enumerate_source_groups(source_window: int) -> tuple[SourceGroup, ...]:
    """列舉所有 ``a>=1、d>=1、a+2d<=H`` 的 A／B／C 等距來源組。"""

    if not isinstance(source_window, int) or source_window < 3:
        raise ValueError("source_window 至少為 3")

    groups: list[SourceGroup] = []
    for spacing in range(1, ((source_window - 1) // 2) + 1):
        for a in range(1, source_window - 2 * spacing + 1):
            groups.append(
                SourceGroup(
                    a=a,
                    b=a + spacing,
                    c=a + 2 * spacing,
                    spacing=spacing,
                )
            )
    return tuple(groups)


def required_history_length(source_window: int) -> int:
    """回傳完整執行 D 組排除所需的最低歷史期數。

    50 期來源範圍需要 74 期歷史；80 期來源範圍需要 119 期歷史。
    """

    if source_window not in (50, 80):
        raise ValueError("source_window 必須是 50 或 80")
    max_spacing = (source_window - 1) // 2
    return source_window + max_spacing


def generate_position_paths(
    ball_count: int,
    group_count: int = 3,
    patterns: Iterable[str] = ("fixed", "increasing", "decreasing"),
) -> tuple[PositionPath, ...]:
    """建立 C→B→A 球位路徑；球位越界時不循環。"""

    if not isinstance(ball_count, int) or ball_count < 1:
        raise ValueError("ball_count 必須大於 0")
    if not isinstance(group_count, int) or group_count < 2:
        raise ValueError("group_count 至少為 2")

    pattern_items = tuple(patterns)
    normalized_patterns: list[PatternKind] = []
    for raw in pattern_items:
        key = str(raw).strip()
        if key not in ("fixed", "increasing", "decreasing"):
            raise ValueError(f"不支援的球位模式：{raw}")
        if key not in normalized_patterns:
            normalized_patterns.append(key)  # type: ignore[arg-type]

    paths: list[PositionPath] = []
    for pattern in normalized_patterns:
        if pattern == "fixed":
            for position in range(1, ball_count + 1):
                paths.append(
                    PositionPath(
                        pattern="fixed",
                        positions=(position,) * group_count,
                        d_position=position,
                    )
                )
            continue

        if pattern == "increasing":
            max_start = ball_count - group_count + 1
            for start in range(1, max_start + 1):
                positions = tuple(start + offset for offset in range(group_count))
                d_position = start - 1 if start > 1 else None
                paths.append(PositionPath("increasing", positions, d_position))
            continue

        # decreasing
        for start in range(ball_count, group_count - 1, -1):
            positions = tuple(start - offset for offset in range(group_count))
            d_position = start + 1 if start < ball_count else None
            paths.append(PositionPath("decreasing", positions, d_position))

    return tuple(paths)


# 舊呼叫名稱的相容別名。
build_position_paths = generate_position_paths


# ---------------------------------------------------------------------------
# 輸入解析
# ---------------------------------------------------------------------------


def _normalize_single(value: Any, aliases: Mapping[str, str], field: str) -> str:
    key = str(value or "").strip()
    try:
        return aliases[key]
    except KeyError as exc:
        allowed = "、".join(sorted(aliases))
        raise TiangongError(f"{field} 無效；允許值：{allowed}") from exc


def _normalize_list(
    value: Any,
    aliases: Mapping[str, str],
    field: str,
) -> tuple[str, ...]:
    if not isinstance(value, list) or not value:
        raise TiangongError(f"{field} 必須是非空陣列")
    result: list[str] = []
    for raw in value:
        normalized = _normalize_single(raw, aliases, field)
        if normalized not in result:
            result.append(normalized)
    return tuple(result)


def _parse_request(payload: Mapping[str, Any]) -> ParsedRequest:
    if not isinstance(payload, Mapping):
        raise TiangongError("payload 必須是 JSON 物件")

    lottery_raw = str(payload.get("lottery", "")).strip()
    if lottery_raw not in LOTTERY_SPECS:
        raise TiangongError("lottery 必須是今彩539、天天樂、六合彩或大樂透")
    lottery_spec = LOTTERY_SPECS[lottery_raw]

    source_window_raw = payload.get("source_window")
    try:
        source_window = int(source_window_raw)
    except (TypeError, ValueError) as exc:
        raise TiangongError("source_window 必須是 50 或 80") from exc
    if source_window not in (50, 80):
        raise TiangongError("source_window 必須是 50 或 80")

    mode = _normalize_single(payload.get("mode", "二段式"), MODE_ALIASES, "mode")
    hit_rule = _normalize_single(
        payload.get("hit_rule", "準2進3"), HIT_RULE_ALIASES, "hit_rule"
    )
    if mode != "two_stage":
        raise TiangongError("天工正式版本只接受二段式")
    if hit_rule != "near_2_to_3":
        raise TiangongError("天工正式版本只接受準2進3")

    draws_raw = payload.get("draws")
    if not isinstance(draws_raw, list) or not draws_raw:
        raise TiangongError("draws 必須是由舊到新排列的非空陣列")

    ball_count = int(lottery_spec["ball_count"])
    max_number = int(lottery_spec["max_number"])
    draws: list[Draw] = []
    seen_periods: set[str] = set()

    for draw_index, raw_draw in enumerate(draws_raw):
        if not isinstance(raw_draw, Mapping):
            raise TiangongError(f"draws[{draw_index}] 必須是物件")

        period = str(raw_draw.get("period", "")).strip()
        if not period:
            raise TiangongError(f"draws[{draw_index}].period 不可為空")
        if period in seen_periods:
            raise TiangongError(f"期號重複：{period}")
        seen_periods.add(period)

        numbers_raw = raw_draw.get("numbers")
        if not isinstance(numbers_raw, list) or len(numbers_raw) != ball_count:
            raise TiangongError(
                f"draws[{draw_index}].numbers 必須包含 {ball_count} 個正式球位號碼"
            )

        numbers: list[int] = []
        for number_index, raw_number in enumerate(numbers_raw):
            try:
                number = int(raw_number)
            except (TypeError, ValueError) as exc:
                raise TiangongError(
                    f"draws[{draw_index}].numbers[{number_index}] 必須是整數"
                ) from exc
            if not 1 <= number <= max_number:
                raise TiangongError(
                    f"draws[{draw_index}].numbers[{number_index}] 必須介於 1～{max_number}"
                )
            numbers.append(number)

        numbers = sorted(numbers[:6]) + numbers[6:] if ball_count == 7 else sorted(numbers)
        draw_date_raw = raw_draw.get("drawDate", raw_draw.get("draw_date"))
        draw_date = None if draw_date_raw is None else str(draw_date_raw).strip() or None
        draws.append(Draw(period=period, numbers=tuple(numbers), draw_date=draw_date))

    target_period = str(payload.get("target_period", "")).strip()
    if not target_period:
        raise TiangongError("target_period 不可為空")
    if target_period in seen_periods:
        raise TiangongError("target_period 必須是尚未存在於 draws 的下一期")

    strict_history = payload.get("strict_history", True)
    if not isinstance(strict_history, bool):
        raise TiangongError("strict_history 必須是 true 或 false")

    if len(draws) < source_window:
        raise HistoryCoverageError(
            f"來源範圍為 {source_window} 期，但只提供 {len(draws)} 期歷史資料"
        )
    if strict_history and len(draws) < required_history_length(source_window):
        raise HistoryCoverageError(
            f"{source_window} 期天工為完成 D 組排除至少需要 "
            f"{required_history_length(source_window)} 期歷史資料；目前只有 {len(draws)} 期"
        )

    source_patterns = _normalize_list(
        payload.get("source_position_patterns"),
        PATTERN_ALIASES,
        "source_position_patterns",
    )
    stage1_patterns = _normalize_list(
        payload.get("stage1_position_patterns"),
        PATTERN_ALIASES,
        "stage1_position_patterns",
    )
    stage1_routes = _normalize_list(
        payload.get("stage1_route_types"),
        ROUTE_ALIASES,
        "stage1_route_types",
    )
    stage2_patterns = _normalize_list(
        payload.get("stage2_position_patterns"),
        PATTERN_ALIASES,
        "stage2_position_patterns",
    )
    stage2_routes = _normalize_list(
        payload.get("stage2_route_types"),
        ROUTE_ALIASES,
        "stage2_route_types",
    )

    return ParsedRequest(
        lottery=str(lottery_spec["canonical"]),
        ball_count=ball_count,
        max_number=max_number,
        draws=tuple(draws),
        target_period=target_period,
        source_window=source_window,
        mode="two_stage",
        hit_rule="near_2_to_3",
        source_patterns=source_patterns,  # type: ignore[arg-type]
        stage1_patterns=stage1_patterns,  # type: ignore[arg-type]
        stage1_routes=stage1_routes,  # type: ignore[arg-type]
        stage2_patterns=stage2_patterns,  # type: ignore[arg-type]
        stage2_routes=stage2_routes,  # type: ignore[arg-type]
        strict_history=strict_history,
    )


# ---------------------------------------------------------------------------
# 搜尋索引：由已知號碼形狀交集，避免無條件笛卡兒積
# ---------------------------------------------------------------------------


def _read_path_values(
    draws: Sequence[Draw],
    indices: Sequence[int],
    path: PositionPath,
    *,
    count: int | None = None,
) -> tuple[int, ...]:
    limit = len(indices) if count is None else count
    return tuple(
        draws[index].numbers[position - 1]
        for index, position in zip(indices[:limit], path.positions[:limit])
    )


def _source_add_shape(values: Sequence[int], modulus: int) -> tuple[int, ...]:
    first = int(values[0])
    return tuple((int(value) - first) % modulus for value in values[1:])


def _target_add_shape(values: Sequence[int], modulus: int) -> tuple[int, ...]:
    first = int(values[0])
    return tuple((int(value) - first) % modulus for value in values[1:])


def _source_sum_shape(values: Sequence[int]) -> tuple[int, ...]:
    first = int(values[0])
    return tuple(int(value) - first for value in values[1:])


def _target_sum_shape(values: Sequence[int]) -> tuple[int, ...]:
    first = int(values[0])
    return tuple(first - int(value) for value in values[1:])


def _build_target_path_indexes(
    *,
    draws: Sequence[Draw],
    indices: Sequence[int],
    paths: Sequence[PositionPath],
    count: int,
    modulus: int,
) -> dict[str, dict[tuple[int, ...], list[tuple[PositionPath, tuple[int, ...]]]]]:
    add_index: dict[tuple[int, ...], list[tuple[PositionPath, tuple[int, ...]]]] = {}
    sum_index: dict[tuple[int, ...], list[tuple[PositionPath, tuple[int, ...]]]] = {}

    for path in paths:
        values = _read_path_values(draws, indices, path, count=count)
        add_index.setdefault(_target_add_shape(values, modulus), []).append(
            (path, values)
        )
        sum_index.setdefault(_target_sum_shape(values), []).append((path, values))

    return {"add_sub": add_index, "sum": sum_index}


def _matching_target_paths(
    *,
    source_values: Sequence[int],
    route_type: str,
    target_indexes: Mapping[
        str,
        Mapping[tuple[int, ...], Sequence[tuple[PositionPath, tuple[int, ...]]]],
    ],
    modulus: int,
) -> Sequence[tuple[PositionPath, tuple[int, ...]]]:
    if route_type == "add_sub":
        shape = _source_add_shape(source_values, modulus)
    elif route_type == "sum":
        shape = _source_sum_shape(source_values)
    else:
        raise TiangongError(f"不支援的版路類型：{route_type}")
    return target_indexes[route_type].get(shape, ())


def _infer_sequence_rule(
    sources: Sequence[int],
    targets: Sequence[int],
    route_type: RuleKind,
    modulus: int,
) -> Rule | None:
    if not sources or len(sources) != len(targets):
        return None
    rule = derive_rules(sources[0], targets[0], modulus, (route_type,))[0]
    for source, target in zip(sources, targets):
        if apply_rule(source, rule, modulus) != target:
            return None
    return rule


# ---------------------------------------------------------------------------
# D 組排除
# ---------------------------------------------------------------------------


def _check_d_extension(
    *,
    request: ParsedRequest,
    source_indices: Sequence[int],
    stage1_indices: Sequence[int],
    stage2_indices: Sequence[int],
    spacing: int,
    source_path: PositionPath,
    stage1_path: PositionPath,
    stage2_path: PositionPath,
    stage1_rule: Rule,
    stage2_rule: Rule,
) -> tuple[str, dict[str, Any]]:
    """檢查同一完整規則是否能向更舊 D 組延伸。

    回傳狀態：
    - ``extends_to_near_3_to_4``：兩段皆成立，候選必須排除。
    - ``breaks_at_stage1``／``breaks_at_stage2``：D 不成立，可保留。
    - ``path_not_extendable``：球位無法合法延伸，不構成相同完整規則。
    - ``unverifiable``：歷史不足；不得假設 D 失敗。
    """

    d_positions = (
        source_path.d_position,
        stage1_path.d_position,
        stage2_path.d_position,
    )
    if any(position is None for position in d_positions):
        return (
            "path_not_extendable",
            {
                "status": "path_not_extendable",
                "source_position": source_path.d_position,
                "stage1_position": stage1_path.d_position,
                "stage2_position": stage2_path.d_position,
            },
        )

    source_d_index = int(source_indices[0]) - spacing
    stage1_d_index = int(stage1_indices[0]) - spacing
    stage2_d_index = int(stage2_indices[0]) - spacing
    if min(source_d_index, stage1_d_index, stage2_d_index) < 0:
        return (
            "unverifiable",
            {
                "status": "unverifiable",
                "reason": "insufficient_older_history",
                "source_index": source_d_index,
                "stage1_index": stage1_d_index,
                "stage2_index": stage2_d_index,
            },
        )

    source_d_position = int(source_path.d_position)
    stage1_d_position = int(stage1_path.d_position)
    stage2_d_position = int(stage2_path.d_position)

    source_draw = request.draws[source_d_index]
    stage1_draw = request.draws[stage1_d_index]
    stage2_draw = request.draws[stage2_d_index]

    source_number = source_draw.numbers[source_d_position - 1]
    stage1_actual = stage1_draw.numbers[stage1_d_position - 1]
    stage1_calculated = apply_rule(source_number, stage1_rule, request.max_number)
    stage1_matched = stage1_calculated == stage1_actual

    evidence: dict[str, Any] = {
        "status": "breaks_at_stage1",
        "source": {
            "period": source_draw.period,
            "position": source_d_position,
            "number": _format_number(source_number),
        },
        "stage1": {
            "period": stage1_draw.period,
            "position": stage1_d_position,
            "calculated_number": _format_number(stage1_calculated),
            "actual_number": _format_number(stage1_actual),
            "matched": stage1_matched,
        },
        "stage2": None,
    }

    if not stage1_matched:
        return "breaks_at_stage1", evidence

    stage2_actual = stage2_draw.numbers[stage2_d_position - 1]
    stage2_calculated = apply_rule(stage1_actual, stage2_rule, request.max_number)
    stage2_matched = stage2_calculated == stage2_actual
    evidence["stage2"] = {
        "period": stage2_draw.period,
        "position": stage2_d_position,
        "calculated_number": _format_number(stage2_calculated),
        "actual_number": _format_number(stage2_actual),
        "matched": stage2_matched,
    }

    if not stage2_matched:
        evidence["status"] = "breaks_at_stage2"
        return "breaks_at_stage2", evidence

    evidence["status"] = "extends_to_near_3_to_4"
    return "extends_to_near_3_to_4", evidence


# ---------------------------------------------------------------------------
# 結果、證據與去重
# ---------------------------------------------------------------------------


def _rule_to_output(rule: Rule, modulus: int) -> dict[str, Any]:
    if rule.kind == "sum":
        return {"type": "sum", "value": int(rule.value)}
    return {
        "type": "add_sub",
        "residue": int(rule.value) % modulus,
        "aliases": add_sub_aliases(rule.value, modulus),
    }


def _rule_identity(rule: Rule, modulus: int) -> dict[str, Any]:
    if rule.kind == "sum":
        return {"type": "sum", "value": int(rule.value)}
    return {"type": "add_sub", "residue": int(rule.value) % modulus}


def _route_label(stage1_rule: Rule, stage2_rule: Rule) -> str:
    first = ROUTE_LABELS[stage1_rule.kind]
    second = ROUTE_LABELS[stage2_rule.kind]
    if first == second:
        return f"{first}版路"
    return f"{first}{second}"


def _format_number(value: int | None) -> str | None:
    return None if value is None else f"{int(value):02d}"


def _canonical_hash(identity: Mapping[str, Any]) -> str:
    encoded = json.dumps(
        identity,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _build_evidence(
    *,
    request: ParsedRequest,
    source_indices: Sequence[int],
    stage1_indices: Sequence[int],
    stage2_indices: Sequence[int],
    source_path: PositionPath,
    stage1_path: PositionPath,
    stage2_path: PositionPath,
    stage1_rule: Rule,
    stage2_rule: Rule,
    d_evidence: Mapping[str, Any],
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    labels = ("C", "B", "A")
    target_index = len(request.draws)

    for group_index, label in enumerate(labels):
        source_index = int(source_indices[group_index])
        stage1_index = int(stage1_indices[group_index])
        stage2_index = int(stage2_indices[group_index])
        source_position = int(source_path.positions[group_index])
        stage1_position = int(stage1_path.positions[group_index])
        stage2_position = int(stage2_path.positions[group_index])

        source_draw = request.draws[source_index]
        stage1_draw = request.draws[stage1_index]
        source_number = source_draw.numbers[source_position - 1]
        stage1_actual = stage1_draw.numbers[stage1_position - 1]
        stage1_calculated = apply_rule(source_number, stage1_rule, request.max_number)

        if stage2_index == target_index:
            stage2_period = request.target_period
            stage2_actual = None
        else:
            stage2_period = request.draws[stage2_index].period
            stage2_actual = request.draws[stage2_index].numbers[stage2_position - 1]
        stage2_calculated = apply_rule(stage1_actual, stage2_rule, request.max_number)

        rows.append(
            {
                "group": label,
                "role": "prediction" if label == "A" else "validation",
                "source": {
                    "period": source_draw.period,
                    "position": source_position,
                    "number": _format_number(source_number),
                },
                "stage1": {
                    "period": stage1_draw.period,
                    "position": stage1_position,
                    "calculated_number": _format_number(stage1_calculated),
                    "actual_number": _format_number(stage1_actual),
                    "matched": stage1_calculated == stage1_actual,
                },
                "stage2": {
                    "period": stage2_period,
                    "position": stage2_position,
                    "calculated_number": _format_number(stage2_calculated),
                    "actual_number": _format_number(stage2_actual),
                    "matched": (
                        None
                        if stage2_actual is None
                        else stage2_calculated == stage2_actual
                    ),
                },
            }
        )

    return {
        "rows": rows,
        "d_exclusion": dict(d_evidence),
    }


def _sort_key(result: Mapping[str, Any]) -> tuple[Any, ...]:
    return (
        int(result["source_spacing"]),
        int(result["stage1_distance"]),
        int(result["stage2_distance"]),
        int(result["prediction"]["position"]),
        int(result["prediction"]["number"]),
        str(result["route_label"]),
        str(result["item_id"]),
    )


# ---------------------------------------------------------------------------
# 正式二段式準2進3產生器
# ---------------------------------------------------------------------------


def calculate_tiangong(payload: Mapping[str, Any]) -> dict[str, Any]:
    """執行 Matrix 天工二段式準2進3，回傳可 JSON 序列化結果。"""

    request = _parse_request(payload)
    draws = request.draws
    target_index = len(draws)
    window_start = target_index - request.source_window

    source_paths = generate_position_paths(
        request.ball_count, 3, request.source_patterns
    )
    stage1_paths = generate_position_paths(
        request.ball_count, 3, request.stage1_patterns
    )
    stage2_paths = generate_position_paths(
        request.ball_count, 3, request.stage2_patterns
    )

    metrics: dict[str, int] = {
        "source_group_count": len(enumerate_source_groups(request.source_window)),
        "source_stage_pair_count": 0,
        "stage1_rule_derived_count": 0,
        "stage1_passed_count": 0,
        "stage2_rule_derived_count": 0,
        "stage2_passed_count": 0,
        "excluded_by_d_count": 0,
        "d_path_not_extendable_count": 0,
        "d_unverifiable_count": 0,
        "duplicate_count": 0,
        "emitted_count": 0,
    }

    results_by_id: dict[str, dict[str, Any]] = {}
    evidence_by_id: dict[str, dict[str, Any]] = {}
    max_spacing = (request.source_window - 1) // 2

    for spacing in range(1, max_spacing + 1):
        # 第二段固定以 C、B 歷史命中，A 為下一期待預測結果。
        stage2_indices = (
            target_index - 2 * spacing,
            target_index - spacing,
            target_index,
        )
        if stage2_indices[0] < 0:
            continue

        stage2_target_indexes = _build_target_path_indexes(
            draws=draws,
            indices=stage2_indices,
            paths=stage2_paths,
            count=2,
            modulus=request.max_number,
        )

        # A 是來源三元組中最新的一組；C 必須仍在最後 H 期來源範圍內。
        first_valid_latest_source = window_start + 2 * spacing

        # 第一段三組都必須是已開獎資料，且晚於對應來源組。
        for latest_stage1_index in range(first_valid_latest_source + 1, target_index):
            stage1_indices = (
                latest_stage1_index - 2 * spacing,
                latest_stage1_index - spacing,
                latest_stage1_index,
            )
            if stage1_indices[0] < 0:
                continue

            stage1_target_indexes = _build_target_path_indexes(
                draws=draws,
                indices=stage1_indices,
                paths=stage1_paths,
                count=3,
                modulus=request.max_number,
            )

            # n1 與 spacing 分開搜尋；n2 由第一段到下一期目標的位置決定。
            for latest_source_index in range(
                first_valid_latest_source, latest_stage1_index
            ):
                metrics["source_stage_pair_count"] += 1
                source_indices = (
                    latest_source_index - 2 * spacing,
                    latest_source_index - spacing,
                    latest_source_index,
                )
                if source_indices[0] < window_start:
                    continue

                stage1_distance = latest_stage1_index - latest_source_index
                stage2_distance = target_index - latest_stage1_index

                for source_path in source_paths:
                    source_values = _read_path_values(
                        draws, source_indices, source_path
                    )

                    for stage1_route in request.stage1_routes:
                        matching_stage1 = _matching_target_paths(
                            source_values=source_values,
                            route_type=stage1_route,
                            target_indexes=stage1_target_indexes,
                            modulus=request.max_number,
                        )

                        for stage1_path, stage1_values in matching_stage1:
                            metrics["stage1_rule_derived_count"] += 1
                            stage1_rule = _infer_sequence_rule(
                                source_values,
                                stage1_values,
                                stage1_route,
                                request.max_number,
                            )
                            if stage1_rule is None:
                                continue
                            metrics["stage1_passed_count"] += 1

                            historical_stage1_values = stage1_values[:2]
                            for stage2_route in request.stage2_routes:
                                matching_stage2 = _matching_target_paths(
                                    source_values=historical_stage1_values,
                                    route_type=stage2_route,
                                    target_indexes=stage2_target_indexes,
                                    modulus=request.max_number,
                                )

                                for stage2_path, historical_stage2_values in matching_stage2:
                                    metrics["stage2_rule_derived_count"] += 1
                                    stage2_rule = _infer_sequence_rule(
                                        historical_stage1_values,
                                        historical_stage2_values,
                                        stage2_route,
                                        request.max_number,
                                    )
                                    if stage2_rule is None:
                                        continue

                                    predicted_number = apply_rule(
                                        stage1_values[2],
                                        stage2_rule,
                                        request.max_number,
                                    )
                                    if predicted_number is None or not is_valid_sorted_prediction(
                                        predicted_number, stage2_path.positions[2], request.max_number,
                                        6 if request.ball_count == 7 else 5,
                                    ):
                                        continue
                                    metrics["stage2_passed_count"] += 1

                                    d_status, d_evidence = _check_d_extension(
                                        request=request,
                                        source_indices=source_indices,
                                        stage1_indices=stage1_indices,
                                        stage2_indices=stage2_indices,
                                        spacing=spacing,
                                        source_path=source_path,
                                        stage1_path=stage1_path,
                                        stage2_path=stage2_path,
                                        stage1_rule=stage1_rule,
                                        stage2_rule=stage2_rule,
                                    )

                                    if d_status == "extends_to_near_3_to_4":
                                        metrics["excluded_by_d_count"] += 1
                                        continue
                                    if d_status == "unverifiable":
                                        metrics["d_unverifiable_count"] += 1
                                        if request.strict_history:
                                            raise HistoryCoverageError(
                                                "完整歷史不足，無法完成 D 組排除檢查"
                                            )
                                        # 無法證明不是準3進4時，不輸出。
                                        continue
                                    if d_status == "path_not_extendable":
                                        metrics["d_path_not_extendable_count"] += 1

                                    source_periods = [
                                        draws[index].period for index in source_indices
                                    ]
                                    stage1_periods = [
                                        draws[index].period for index in stage1_indices
                                    ]
                                    stage2_periods = [
                                        draws[stage2_indices[0]].period,
                                        draws[stage2_indices[1]].period,
                                        request.target_period,
                                    ]

                                    identity: dict[str, Any] = {
                                        "algorithm_version": ALGORITHM_VERSION,
                                        "lottery": request.lottery,
                                        "anchor_period": draws[-1].period,
                                        "target_period": request.target_period,
                                        "mode": request.mode,
                                        "hit_rule": request.hit_rule,
                                        "source_spacing": spacing,
                                        "source_periods": source_periods,
                                        "source_pattern": source_path.pattern,
                                        "source_positions": list(source_path.positions),
                                        "stage1_distance": stage1_distance,
                                        "stage1_periods": stage1_periods,
                                        "stage1_pattern": stage1_path.pattern,
                                        "stage1_positions": list(stage1_path.positions),
                                        "stage1_rule": _rule_identity(
                                            stage1_rule, request.max_number
                                        ),
                                        "stage2_distance": stage2_distance,
                                        "stage2_periods": stage2_periods,
                                        "stage2_pattern": stage2_path.pattern,
                                        "stage2_positions": list(stage2_path.positions),
                                        "stage2_rule": _rule_identity(
                                            stage2_rule, request.max_number
                                        ),
                                        "prediction": {
                                            "period": request.target_period,
                                            "position": stage2_path.positions[2],
                                            "number": _format_number(predicted_number),
                                        },
                                    }
                                    item_id = _canonical_hash(identity)

                                    if request.source_window == 80:
                                        eligible_windows = (
                                            [50, 80]
                                            if source_indices[0] >= target_index - 50
                                            else [80]
                                        )
                                    else:
                                        eligible_windows = [50]

                                    if item_id in results_by_id:
                                        metrics["duplicate_count"] += 1
                                        existing = results_by_id[item_id]
                                        merged = sorted(
                                            set(existing["eligible_windows"])
                                            | set(eligible_windows)
                                        )
                                        existing["eligible_windows"] = merged
                                        continue

                                    result: dict[str, Any] = {
                                        "item_id": item_id,
                                        "evidence_id": item_id,
                                        "mode": request.mode,
                                        "mode_label": "二段式",
                                        "hit_rule": request.hit_rule,
                                        "hit_rule_label": "準2進3",
                                        "eligible_windows": eligible_windows,
                                        "source_spacing": spacing,
                                        "source_periods": source_periods,
                                        "source_pattern": source_path.pattern,
                                        "source_pattern_label": PATTERN_LABELS[
                                            source_path.pattern
                                        ],
                                        "source_positions": list(source_path.positions),
                                        "stage1_distance": stage1_distance,
                                        "stage1_periods": stage1_periods,
                                        "stage1_pattern": stage1_path.pattern,
                                        "stage1_pattern_label": PATTERN_LABELS[
                                            stage1_path.pattern
                                        ],
                                        "stage1_positions": list(stage1_path.positions),
                                        "stage1_operation": _rule_to_output(
                                            stage1_rule, request.max_number
                                        ),
                                        "stage2_distance": stage2_distance,
                                        "stage2_periods": stage2_periods,
                                        "stage2_pattern": stage2_path.pattern,
                                        "stage2_pattern_label": PATTERN_LABELS[
                                            stage2_path.pattern
                                        ],
                                        "stage2_positions": list(stage2_path.positions),
                                        "stage2_operation": _rule_to_output(
                                            stage2_rule, request.max_number
                                        ),
                                        "prediction": {
                                            "period": request.target_period,
                                            "position": stage2_path.positions[2],
                                            "number": _format_number(predicted_number),
                                        },
                                        "route_label": _route_label(
                                            stage1_rule, stage2_rule
                                        ),
                                    }

                                    results_by_id[item_id] = result
                                    evidence_by_id[item_id] = _build_evidence(
                                        request=request,
                                        source_indices=source_indices,
                                        stage1_indices=stage1_indices,
                                        stage2_indices=stage2_indices,
                                        source_path=source_path,
                                        stage1_path=stage1_path,
                                        stage2_path=stage2_path,
                                        stage1_rule=stage1_rule,
                                        stage2_rule=stage2_rule,
                                        d_evidence=d_evidence,
                                    )

    results = sorted(results_by_id.values(), key=_sort_key)
    metrics["emitted_count"] = len(results)

    return {
        "ok": True,
        "algorithm": "Matrix 天工",
        "algorithm_version": ALGORITHM_VERSION,
        "lottery": request.lottery,
        "mode": request.mode,
        "mode_label": "二段式",
        "hit_rule": request.hit_rule,
        "hit_rule_label": "準2進3",
        "source_window": request.source_window,
        "target_period": request.target_period,
        "anchor_period": draws[-1].period,
        "history_draw_count": len(draws),
        "required_history_count": required_history_length(request.source_window),
        "candidate_count": len(results),
        "metrics": metrics,
        "input_contract": {
            "draw_order": "oldest_to_newest",
            "numbers_reordered": True,
            "period_distance_basis": "draw_array_index",
            "target_is_next_draw_after_history": True,
            "reference_offset_search": False,
        },
        "results": results,
        "evidence": evidence_by_id,
    }


def calculate_tiangong_json(json_text: str, *, pretty: bool = False) -> str:
    """原始 JSON 字串轉接器。"""

    payload = json.loads(json_text)
    if not isinstance(payload, Mapping):
        raise TiangongError("JSON 根節點必須是物件")
    result = calculate_tiangong(payload)
    return json.dumps(
        result,
        ensure_ascii=False,
        indent=2 if pretty else None,
        separators=None if pretty else (",", ":"),
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _load_json_input(path: str) -> Mapping[str, Any]:
    text = sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8")
    data = json.loads(text)
    if not isinstance(data, Mapping):
        raise TiangongError("JSON 根節點必須是物件")
    return data


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Matrix 天工二段式準2進3演算法")
    parser.add_argument("input", help="輸入 JSON 路徑；使用 - 代表標準輸入")
    parser.add_argument("-o", "--output", help="輸出 JSON 路徑；省略則輸出至標準輸出")
    parser.add_argument("--pretty", action="store_true", help="格式化輸出 JSON")
    args = parser.parse_args(argv)

    try:
        payload = _load_json_input(args.input)
        response: dict[str, Any] = calculate_tiangong(payload)
        exit_code = 0
    except Exception as exc:  # CLI 邊界統一回傳結構化錯誤
        response = {
            "ok": False,
            "algorithm": "Matrix 天工",
            "algorithm_version": ALGORITHM_VERSION,
            "error_type": type(exc).__name__,
            "error": str(exc),
        }
        exit_code = 2

    output_text = json.dumps(
        response,
        ensure_ascii=False,
        indent=2 if args.pretty else None,
        separators=None if args.pretty else (",", ":"),
    )
    if args.output:
        Path(args.output).write_text(output_text + "\n", encoding="utf-8")
    else:
        sys.stdout.write(output_text + "\n")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
