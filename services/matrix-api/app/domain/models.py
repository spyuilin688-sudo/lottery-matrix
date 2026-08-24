from typing import Literal, TypedDict


MatrixLottery = Literal["今彩539", "天天樂", "六合彩", "大樂透"]
MatrixAlgorithmType = Literal["加減", "合值", "拖牌"]


class MatrixDraw(TypedDict, total=False):
    period: str
    drawDate: str
    numbers: list[str]
    sortedNumbers: list[str]
    drawOrderNumbers: list[str] | None


def normalize_matrix_number(value: int, maximum: int) -> int:
    return ((value - 1) % maximum + maximum) % maximum + 1


def lottery_maximum(lottery: str) -> int:
    return 39 if lottery in {"今彩539", "天天樂"} else 49


def lottery_position_count(lottery: str) -> int:
    return 5 if lottery in {"今彩539", "天天樂"} else 7
