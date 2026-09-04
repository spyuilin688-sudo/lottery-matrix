from collections.abc import Callable
from datetime import datetime, timedelta
import re
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.domain.models import MatrixDraw
from app.scraping.html_tables import parse_table_rows


TAIWAN_539_URL = "https://api.taiwanlottery.com/TLCAPIWeB/Lottery/Daily539Result"
TAIWAN_649_URL = "https://api.taiwanlottery.com/TLCAPIWeB/Lottery/Lotto649Result"
CALIFORNIA_FANTASY5_HISTORY_URL = (
    "https://www.calottery.com/api/DrawGameApi/DrawGamePastDrawResults/10/{page}/{size}"
)
SC888_FANTASY5_URL = "https://sc888.net/index.php?s=/LotteryFan/index"
SC888_FANTASY5_DOWNLOAD_URL = "https://sc888.net/index.php?s=/LotteryFan/getDownloadXls"
SC888_MARKSIX_URL = "https://sc888.net/index.php?s=/LotterySix/index"
NFD_MARKSIX_URL = "https://www.nfd.com.tw/house/year/{year}.htm"
NFD_MARKSIX_DRAW_ORDER_URL = "https://www.nfd.com.tw/house/year/F{year}.htm"
NFD_MARKSIX_FIRST_YEAR = 1976
NFD_DAILY539_DRAW_ORDER_URL = "https://www.nfd.com.tw/lottery/39-year/39-f{year}.htm"
BIGA_LOTTO649_HISTORY_URL = (
    "https://rk.biga.com.tw/ARCHIVE/DRAWDATA/PAGINATION/ZP/"
    "biglottoresultlist?page={page}"
)
BIGA_LOTTO649_MAX_PAGES = 80
BIGA_LOTTO649_LEGACY_PERIODS = frozenset(
    f"{roc_year:03d}{sequence:06d}"
    for roc_year in range(93, 96)
    for sequence in range(1, 105)
)
LOTTO649_OFFICIAL_API_FIRST_MONTH = "2007-01"
MAX_TAIWAN_HISTORY_MONTHS = 360
FORMAL_PAGE_REFERERS = {
    "今彩539": "https://www.taiwanlottery.com/lotto/result/daily_cash",
    "大樂透": "https://www.taiwanlottery.com/lotto/result/lotto649",
}
HEADERS = {
    "user-agent": "Mozilla/5.0 (compatible; Matrix Lottery Data Fetcher)",
    "accept-language": "zh-TW,zh;q=0.9,en;q=0.5",
}
DATE_PATTERN = re.compile(r"(?:20\d{2}|19\d{2})[年/\-.](?:1[0-2]|0?[1-9])[月/\-.](?:3[01]|[12]\d|0?[1-9])日?")
EXPLICIT_PERIOD_PATTERN = re.compile(r"第\s*(\d{4,12})\s*期")
STANDALONE_PERIOD_PATTERN = re.compile(r"^(\d{5,12})$")


def _two_digit(value: Any, maximum: int) -> str:
    try:
        number = int(str(value).strip())
    except (TypeError, ValueError) as error:
        raise ValueError("DRAW_NUMBER_INVALID") from error
    if not 1 <= number <= maximum:
        raise ValueError("DRAW_NUMBER_INVALID")
    return str(number).zfill(2)


def _ordered_numbers(values: list[Any], count: int) -> list[str]:
    maximum = 39 if count == 5 else 49
    normalized = [_two_digit(value, maximum) for value in values]
    if len(normalized) != count or len(set(normalized)) != count:
        raise ValueError("DRAW_NUMBERS_INVALID")
    if count == 7:
        return sorted(normalized[:6], key=int) + [normalized[6]]
    return sorted(normalized, key=int)


def _materialize_draw(
    period: str,
    draw_date: str,
    values: list[Any],
    count: int,
    draw_order: list[Any] | None = None,
    *,
    allow_missing_date: bool = False,
) -> MatrixDraw:
    numbers = _ordered_numbers(values, count)
    order: list[str] | None = None
    if draw_order is not None:
        order_values = list(draw_order)
        if count == 7 and len(order_values) == 6:
            order_values.append(numbers[6])
        maximum = 39 if count == 5 else 49
        order = [_two_digit(value, maximum) for value in order_values]
        if len(order) != count or _ordered_numbers(order, count) != numbers:
            raise ValueError("DRAW_ORDER_MISMATCH")
    if (
        not str(period).strip()
        or (not allow_missing_date and not str(draw_date).strip())
    ):
        raise ValueError("DRAW_REQUIRED_FIELDS_MISSING")
    return {
        "period": str(period).strip(),
        "drawDate": str(draw_date).strip(),
        "numbers": numbers,
        "sortedNumbers": numbers,
        "drawOrderNumbers": order,
    }


def _newest_unique(draws: list[MatrixDraw], limit: int | None = None) -> list[MatrixDraw]:
    by_period: dict[str, MatrixDraw] = {}
    for draw in draws:
        by_period[draw["period"]] = draw
    ordered = sorted(
        by_period.values(),
        key=lambda draw: (str(draw.get("drawDate", "")), str(draw["period"])),
        reverse=True,
    )
    return ordered if limit is None else ordered[: max(0, limit)]


def parse_taiwan_lottery_history(payload: Any, key: str, count: int) -> list[MatrixDraw]:
    if not isinstance(payload, dict) or not isinstance(payload.get("content"), dict):
        raise ValueError("TAIWAN_LOTTERY_PAYLOAD_INVALID")
    items = payload["content"].get(key)
    if not isinstance(items, list):
        raise ValueError("TAIWAN_LOTTERY_PAYLOAD_INVALID")
    parsed: list[MatrixDraw] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        size = item.get("drawNumberSize", item.get("draw_number_size"))
        appear = item.get("drawNumberAppear", item.get("draw_number_appear"))
        if not isinstance(size, list) or not isinstance(appear, list):
            continue
        try:
            raw_period = str(item.get("period", "")).strip()
            period = raw_period.zfill(9) if len(raw_period) == 8 else raw_period
            parsed.append(_materialize_draw(period, str(item.get("lotteryDate", "")), size, count, appear))
        except ValueError:
            continue
    return _newest_unique(parsed)


def parse_taiwan_lottery_payload(payload: Any, key: str, count: int) -> MatrixDraw:
    parsed = parse_taiwan_lottery_history(payload, key, count)
    if not parsed:
        raise ValueError("TAIWAN_LOTTERY_DRAW_INCOMPLETE")
    return parsed[0]


def parse_california_fantasy5_history(payload: Any) -> list[MatrixDraw]:
    if not isinstance(payload, dict) or not isinstance(payload.get("PreviousDraws"), list):
        raise ValueError("CALIFORNIA_FANTASY5_PAYLOAD_INVALID")
    draws: list[MatrixDraw] = []
    for item in payload["PreviousDraws"]:
        if not isinstance(item, dict):
            continue
        raw_period = item.get("DrawNumber")
        if isinstance(raw_period, bool) or not isinstance(raw_period, (int, str)):
            continue
        period = str(raw_period)
        if not re.fullmatch(r"\d{4,12}", period) or int(period) <= 0:
            continue
        raw_draw_date = item.get("DrawDate")
        if not isinstance(raw_draw_date, str):
            continue
        try:
            california_draw_date = datetime.fromisoformat(
                raw_draw_date.replace("Z", "+00:00")
            ).date()
            draw_date = (california_draw_date + timedelta(days=1)).isoformat()
        except ValueError:
            continue
        winning_numbers = item.get("WinningNumbers")
        if isinstance(winning_numbers, dict):
            if not all(isinstance(key, str) and key.isdigit() for key in winning_numbers):
                continue
            number_records = [winning_numbers[key] for key in sorted(winning_numbers, key=int)]
        elif isinstance(winning_numbers, list):
            number_records = winning_numbers
        else:
            continue
        if not all(isinstance(number, dict) and "Number" in number for number in number_records):
            continue
        values = [number["Number"] for number in number_records]
        try:
            draws.append(_materialize_draw(period, draw_date, values, 5))
        except ValueError:
            continue
    return _newest_unique(draws)


def _period(cells: list[str]) -> str:
    for cell in cells:
        match = EXPLICIT_PERIOD_PATTERN.search(cell)
        if match:
            return match.group(1)
    for cell in cells:
        match = STANDALONE_PERIOD_PATTERN.match(cell)
        if match and int(match.group(1)) > 9999:
            return match.group(1)
    return ""


def _date(cells: list[str]) -> str:
    for cell in cells:
        match = DATE_PATTERN.search(cell)
        if match:
            return match.group(0)
    return ""


def _fantasy_numbers(value: str) -> list[str]:
    separated = re.findall(r"(?<!\d)(?:0[1-9]|[12]\d|3\d)(?!\d)", value)
    if len(separated) == 5:
        return separated
    digits = re.sub(r"\D", "", value)
    pairs = re.findall(r"\d{2}", digits) if len(digits) == 10 else []
    return pairs if len(pairs) == 5 and all(1 <= int(number) <= 39 for number in pairs) else []


def parse_sc888_fantasy5_history(html: str) -> list[MatrixDraw]:
    rows = parse_table_rows(html)
    drop_index = -1
    size_index = -1
    for cells in rows:
        for index, cell in enumerate(cells):
            if re.search(r"落球(?:順序|序)?", cell):
                drop_index = index
            if re.search(r"(?:大小|順序排序|大小順序)", cell):
                size_index = index
        if drop_index >= 0 and size_index >= 0:
            break
    draws: list[MatrixDraw] = []
    for cells in rows:
        period = _period(cells)
        draw_date = _date(cells)
        if not period or not draw_date:
            continue
        drop = _fantasy_numbers(cells[drop_index]) if 0 <= drop_index < len(cells) else []
        size = _fantasy_numbers(cells[size_index]) if 0 <= size_index < len(cells) else []
        if not size:
            size = next((_fantasy_numbers(cell) for cell in cells if len(_fantasy_numbers(cell)) == 5), [])
        if not drop:
            drop = size
        try:
            draws.append(_materialize_draw(period, draw_date, size, 5, drop))
        except ValueError:
            continue
    return _newest_unique(draws)


def parse_sc888_fantasy5_html(html: str) -> MatrixDraw:
    draws = parse_sc888_fantasy5_history(html)
    if not draws:
        raise ValueError("SC888_DRAW_INCOMPLETE")
    return draws[0]


def _normalize_sc888_fantasy5_history(
    draws: list[MatrixDraw],
) -> list[MatrixDraw]:
    normalized: list[MatrixDraw] = []
    for draw in draws:
        date_match = DATE_PATTERN.search(str(draw.get("drawDate", "")))
        if date_match is None:
            continue
        date_parts = [int(value) for value in re.findall(r"\d+", date_match.group(0))]
        if len(date_parts) != 3:
            continue
        try:
            taipei_draw_date = datetime(
                date_parts[0], date_parts[1], date_parts[2]
            ).date().isoformat()
        except ValueError:
            continue
        numbers = list(draw.get("sortedNumbers") or draw.get("numbers") or [])
        if len(numbers) != 5:
            continue
        normalized.append({
            "period": str(draw["period"]),
            "drawDate": taipei_draw_date,
            "numbers": numbers,
            "sortedNumbers": numbers,
            "drawOrderNumbers": None,
        })
    return _newest_unique(normalized)


def _exact_numbers(value: str, count: int, maximum: int) -> list[str]:
    values = re.findall(r"(?<!\d)(?:0[1-9]|[1-9]|[1-4]\d)(?!\d)", value)
    if len(values) != count:
        return []
    try:
        numbers = [_two_digit(value, maximum) for value in values]
    except ValueError:
        return []
    return numbers if len(set(numbers)) == count else []


def _labelled_numbers(
    value: str,
    start: str,
    stop: str,
    count: int,
    maximum: int,
) -> list[str]:
    match = re.search(rf"(?:{start})\s*(.*?)(?=(?:{stop})|$)", value)
    return _exact_numbers(match.group(1), count, maximum) if match else []


def parse_sc888_marksix_history(html: str) -> list[MatrixDraw]:
    rows = parse_table_rows(html)
    drop_index = -1
    size_index = -1
    for cells in rows:
        for index, cell in enumerate(cells):
            if re.search(r"落球(?:順序|序)?$", cell):
                drop_index = index
            if re.search(r"(?:大小|一般)(?:順序)?$", cell):
                size_index = index
        if drop_index >= 0 and size_index >= 0:
            break

    draws: list[MatrixDraw] = []
    for cells in rows:
        period = _period(cells)
        draw_date = _date(cells)
        if not period or not draw_date:
            continue
        drop = (
            _exact_numbers(cells[drop_index], 6, 49)
            if 0 <= drop_index < len(cells)
            else []
        )
        size = (
            _exact_numbers(cells[size_index], 7, 49)
            if 0 <= size_index < len(cells)
            else []
        )
        row_text = " ".join(cells)
        if not drop:
            drop = _labelled_numbers(
                row_text, r"落球(?:順序|序)?", r"大小(?:順序)?", 6, 49,
            )
        if not size:
            size = _labelled_numbers(
                row_text, r"大小(?:順序)?", r"台號|特三|奇偶", 7, 49,
            )
        if not drop or not size:
            continue
        try:
            draws.append(_materialize_draw(period, draw_date, size, 7, drop))
        except ValueError:
            continue
    return _newest_unique(draws)


def parse_nfd_marksix_draw_order_history(html: str) -> dict[str, list[str]]:
    by_period: dict[str, list[str]] = {}
    for cells in parse_table_rows(html):
        if not cells or not re.fullmatch(r"20\d{2}|19\d{2}", cells[0]):
            continue
        if len(cells) >= 10 and re.fullmatch(r"\d{1,2}/\d{1,2}", cells[1]):
            sequence_index = 2
            number_start = 3
        elif len(cells) >= 9:
            sequence_index = 1
            number_start = 2
        else:
            continue
        if not re.fullmatch(r"\d{1,3}", cells[sequence_index]):
            continue
        numbers = _exact_numbers(" ".join(cells[number_start:number_start + 7]), 7, 49)
        if not numbers:
            continue
        year = cells[0]
        period = "0" + year[-2:] + str(int(cells[sequence_index])).zfill(3)
        by_period[period] = numbers
    return by_period


def parse_nfd_marksix_history(
    html: str,
    draw_order_html: str | None = None,
    *,
    allow_missing_dates: bool = False,
) -> list[MatrixDraw]:
    draw_orders = (
        parse_nfd_marksix_draw_order_history(draw_order_html)
        if draw_order_html is not None
        else {}
    )
    draws: list[MatrixDraw] = []
    for cells in parse_table_rows(html):
        if not cells or not re.fullmatch(r"20\d{2}|19\d{2}", cells[0]):
            continue
        date_match = (
            re.fullmatch(r"(\d{1,2})/(\d{1,2})", cells[1])
            if len(cells) >= 10
            else None
        )
        if date_match and re.fullmatch(r"\d{1,3}", cells[2]):
            sequence_index = 2
            number_start = 3
            draw_date = (
                f"{cells[0]}/{int(date_match.group(1)):02d}/"
                f"{int(date_match.group(2)):02d}"
            )
        elif (
            allow_missing_dates
            and len(cells) >= 9
            and re.fullmatch(r"\d{1,3}", cells[1])
        ):
            sequence_index = 1
            number_start = 2
            draw_date = ""
        else:
            continue
        year = cells[0]
        period = "0" + year[-2:] + str(int(cells[sequence_index])).zfill(3)
        try:
            draws.append(
                _materialize_draw(
                    period,
                    draw_date,
                    cells[number_start:number_start + 7],
                    7,
                    draw_orders.get(period),
                    allow_missing_date=allow_missing_dates,
                )
            )
        except ValueError:
            continue
    return _newest_unique(draws)


def parse_nfd_marksix_html(html: str) -> MatrixDraw:
    draws = parse_nfd_marksix_history(html)
    if not draws:
        raise ValueError("NFD_DRAW_INCOMPLETE")
    return draws[0]


def parse_nfd_daily539_draw_order_history(html: str) -> list[MatrixDraw]:
    draws: list[MatrixDraw] = []
    for cells in parse_table_rows(html):
        if (
            len(cells) < 8
            or not re.fullmatch(r"20\d{2}", cells[0])
            or not re.fullmatch(r"\d{1,3}", cells[2])
        ):
            continue
        date_match = re.fullmatch(r"\s*(\d{1,2})\s*/\s*(\d{1,2})\s*", cells[1])
        if not date_match:
            continue
        year = int(cells[0])
        draw_order = _exact_numbers(" ".join(cells[3:8]), 5, 39)
        if not draw_order:
            continue
        period = f"{year - 1911:03d}{int(cells[2]):06d}"
        draw_date = f"{year}/{int(date_match.group(1)):02d}/{int(date_match.group(2)):02d}"
        try:
            draws.append(
                _materialize_draw(period, draw_date, draw_order, 5, draw_order)
            )
        except ValueError:
            continue
    return _newest_unique(draws)


def _biga_taiwan_period(value: str) -> str:
    match = re.fullmatch(r"(\d{3})(\d{3})", value.strip())
    return f"{match.group(1)}{int(match.group(2)):06d}" if match else ""


def parse_biga_lotto649_history(html: str) -> list[MatrixDraw]:
    draws: list[MatrixDraw] = []
    for cells in parse_table_rows(html):
        if len(cells) < 19:
            continue
        period = _biga_taiwan_period(cells[2])
        draw_date = _date([cells[0]])
        draw_order = _exact_numbers(" ".join(cells[6:12]), 6, 49)
        special = _exact_numbers(cells[12], 1, 49)
        sorted_numbers = _exact_numbers(" ".join(cells[13:19]), 6, 49)
        if (
            not period
            or not draw_date
            or not draw_order
            or not special
            or not sorted_numbers
        ):
            continue
        try:
            draws.append(
                _materialize_draw(
                    period,
                    draw_date,
                    [*sorted_numbers, *special],
                    7,
                    [*draw_order, *special],
                )
            )
        except ValueError:
            continue
    return _newest_unique(draws)


def _response_text(response: httpx.Response) -> str:
    content_type = response.headers.get("content-type", "")
    charset_match = re.search(r"charset\s*=\s*([^;\s]+)", content_type, re.IGNORECASE)
    charset = charset_match.group(1).strip('"\'') if charset_match else "utf-8"
    if re.search(r"big-?5|950", charset, re.IGNORECASE):
        charset = "big5"
    try:
        return response.content.decode(charset)
    except (LookupError, UnicodeDecodeError):
        return response.content.decode("utf-8", errors="replace")


def _month_label(now: datetime, offset: int) -> str:
    month_index = now.year * 12 + (now.month - 1) - offset
    year, month_zero = divmod(month_index, 12)
    return f"{year:04d}-{month_zero + 1:02d}"


class LatestDrawSource:
    def __init__(self, client: httpx.Client, now: Callable[[], datetime] | None = None) -> None:
        self.client = client
        self.now = now or (lambda: datetime.now(ZoneInfo("Asia/Taipei")))

    def fetch(self, lottery: str) -> MatrixDraw:
        if lottery in {"今彩539", "大樂透"}:
            return self._fetch_taiwan(lottery)
        if lottery == "天天樂":
            history = self.fetch_history(lottery, 1)
            if not history:
                raise ValueError("FANTASY5_DRAW_INCOMPLETE")
            return history[0]
        if lottery == "六合彩":
            try:
                response = self.client.get(
                    SC888_MARKSIX_URL,
                    headers={**HEADERS, "referer": "https://sc888.net/"},
                    timeout=20.0,
                    follow_redirects=True,
                )
                response.raise_for_status()
                draws = parse_sc888_marksix_history(_response_text(response))
                if draws:
                    return draws[0]
                raise ValueError("SC888_MARKSIX_DRAW_INCOMPLETE")
            except (httpx.HTTPError, ValueError):
                year = self.now().year
                normal_response = self.client.get(
                    NFD_MARKSIX_URL.format(year=year),
                    headers=HEADERS,
                    timeout=20.0,
                    follow_redirects=True,
                )
                normal_response.raise_for_status()
                order_response = self.client.get(
                    NFD_MARKSIX_DRAW_ORDER_URL.format(year=year),
                    headers=HEADERS,
                    timeout=20.0,
                    follow_redirects=True,
                )
                order_response.raise_for_status()
                draws = parse_nfd_marksix_history(
                    _response_text(normal_response),
                    _response_text(order_response),
                )
                if not draws:
                    raise ValueError("NFD_DRAW_INCOMPLETE")
                return draws[0]
        raise ValueError("UNKNOWN_LOTTERY")

    def _fetch_sc888_fantasy5_history(
        self,
        limit: int | None,
    ) -> list[MatrixDraw]:
        urls = (
            [SC888_FANTASY5_URL, SC888_FANTASY5_DOWNLOAD_URL]
            if limit is not None
            else [SC888_FANTASY5_DOWNLOAD_URL, SC888_FANTASY5_URL]
        )
        last_error: Exception | None = None
        for url in urls:
            try:
                response = self.client.get(
                    url,
                    headers={
                        **HEADERS,
                        "accept": (
                            "text/html,application/xhtml+xml,"
                            "application/vnd.ms-excel;q=0.9,*/*;q=0.8"
                        ),
                        "referer": "https://sc888.net/",
                    },
                    timeout=(
                        30.0
                        if url == SC888_FANTASY5_DOWNLOAD_URL
                        else 20.0
                    ),
                    follow_redirects=True,
                )
                response.raise_for_status()
                draws = _normalize_sc888_fantasy5_history(
                    parse_sc888_fantasy5_history(_response_text(response))
                )
                if draws:
                    return _newest_unique(draws, limit)
                last_error = ValueError("SC888_HISTORY_INCOMPLETE")
            except (httpx.HTTPError, ValueError) as error:
                last_error = error
        if last_error is not None:
            raise last_error
        raise ValueError("SC888_HISTORY_INCOMPLETE")

    def fetch_algorithm_history(self, lottery: str) -> list[MatrixDraw]:
        if lottery == "今彩539":
            # Taiwan Lottery supplies authoritative size and actual-order rows
            # continuously back to 2007.  Do not merge NFD aliases here: a few
            # legacy NFD rows conflict with the official order or even number.
            return self._fetch_taiwan_history(lottery, None)

        if lottery == "六合彩":
            draws: list[MatrixDraw] = []
            current_year = self.now().year
            for year in range(current_year, NFD_MARKSIX_FIRST_YEAR - 1, -1):
                normal_response = self.client.get(
                    NFD_MARKSIX_URL.format(year=year),
                    headers=HEADERS,
                    timeout=20.0,
                    follow_redirects=True,
                )
                normal_response.raise_for_status()
                order_response = self.client.get(
                    NFD_MARKSIX_DRAW_ORDER_URL.format(year=year),
                    headers=HEADERS,
                    timeout=20.0,
                    follow_redirects=True,
                )
                order_response.raise_for_status()
                draws.extend(
                    parse_nfd_marksix_history(
                        _response_text(normal_response),
                        _response_text(order_response),
                        allow_missing_dates=True,
                    )
                )
            try:
                response = self.client.get(
                    SC888_MARKSIX_URL,
                    headers={**HEADERS, "referer": "https://sc888.net/"},
                    timeout=20.0,
                    follow_redirects=True,
                )
                response.raise_for_status()
                draws.extend(parse_sc888_marksix_history(_response_text(response)))
            except (httpx.HTTPError, ValueError):
                pass
            return _newest_unique(draws)

        if lottery == "大樂透":
            official = self._fetch_taiwan_history(lottery, None)
            legacy_by_period: dict[str, MatrixDraw] = {}
            for page in range(1, BIGA_LOTTO649_MAX_PAGES + 1):
                response = self.client.get(
                    BIGA_LOTTO649_HISTORY_URL.format(page=page),
                    headers={**HEADERS, "referer": "https://rk.biga.com.tw/"},
                    timeout=30.0,
                    follow_redirects=True,
                )
                response.raise_for_status()
                for draw in parse_biga_lotto649_history(_response_text(response)):
                    if draw["period"] in BIGA_LOTTO649_LEGACY_PERIODS:
                        legacy_by_period[draw["period"]] = draw
                if legacy_by_period.keys() >= BIGA_LOTTO649_LEGACY_PERIODS:
                    break
            if legacy_by_period.keys() < BIGA_LOTTO649_LEGACY_PERIODS:
                raise ValueError("BIGA_LOTTO649_LEGACY_HISTORY_INCOMPLETE")
            return _newest_unique([*official, *legacy_by_period.values()])

        return self.fetch_history(lottery, None)

    def fetch_history(self, lottery: str, limit: int | None) -> list[MatrixDraw]:
        if limit is not None and limit <= 0:
            return []
        if lottery in {"今彩539", "大樂透"}:
            return self._fetch_taiwan_history(lottery, limit)
        if lottery == "天天樂":
            page_size = 50 if limit is None else min(50, limit)
            official_draws: list[MatrixDraw] = []
            previous_count = 0
            page = 1
            try:
                while True:
                    response = self.client.get(
                        CALIFORNIA_FANTASY5_HISTORY_URL.format(
                            page=page, size=page_size,
                        ),
                        headers=HEADERS,
                        timeout=20.0,
                        follow_redirects=True,
                    )
                    response.raise_for_status()
                    page_draws = parse_california_fantasy5_history(response.json())
                    if not page_draws:
                        break
                    official_draws.extend(page_draws)
                    draws = _newest_unique(official_draws)
                    if limit is not None and len(draws) >= limit:
                        return _newest_unique(draws, limit)
                    if len(draws) == previous_count or len(page_draws) < page_size:
                        break
                    previous_count = len(draws)
                    page += 1
            except httpx.HTTPStatusError as error:
                if error.response.status_code != 403:
                    raise
                return self._fetch_sc888_fantasy5_history(limit)

            draws = _newest_unique(official_draws)
            if not draws or (limit is not None and len(draws) < limit):
                raise ValueError("CALIFORNIA_FANTASY5_HISTORY_INCOMPLETE")
            return _newest_unique(draws, limit)
        if lottery == "六合彩":
            draws: list[MatrixDraw] = []
            current_year = self.now().year
            first_year = NFD_MARKSIX_FIRST_YEAR if limit is None else max(NFD_MARKSIX_FIRST_YEAR, current_year - 4)
            for year in range(current_year, first_year - 1, -1):
                response = self.client.get(
                    NFD_MARKSIX_URL.format(year=year),
                    headers=HEADERS,
                    timeout=20.0,
                    follow_redirects=True,
                )
                response.raise_for_status()
                draws.extend(parse_nfd_marksix_history(_response_text(response)))
                combined = _newest_unique(draws, limit)
                if limit is not None and len(combined) >= limit:
                    return combined
            return _newest_unique(draws, limit)
        raise ValueError("UNKNOWN_LOTTERY")

    def _fetch_taiwan(self, lottery: str) -> MatrixDraw:
        history = self._fetch_taiwan_history(lottery, 1, max_months=2)
        if not history:
            raise ValueError("TAIWAN_LOTTERY_DRAW_INCOMPLETE")
        return history[0]

    def _fetch_taiwan_history(
        self,
        lottery: str,
        limit: int | None,
        max_months: int | None = None,
    ) -> list[MatrixDraw]:
        is_539 = lottery == "今彩539"
        url = TAIWAN_539_URL if is_539 else TAIWAN_649_URL
        key = "daily539Res" if is_539 else "lotto649Res"
        count = 5 if is_539 else 7
        draws: list[MatrixDraw] = []
        month_ceiling = max_months if max_months is not None else MAX_TAIWAN_HISTORY_MONTHS

        for month_offset in range(month_ceiling):
            month = _month_label(self.now(), month_offset)
            if month < LOTTO649_OFFICIAL_API_FIRST_MONTH:
                return _newest_unique(draws, limit)
            response = self.client.get(
                f"{url}?period&month={month}&pageSize=31",
                headers={**HEADERS, "accept": "application/json,text/plain,*/*", "referer": FORMAL_PAGE_REFERERS[lottery]},
                timeout=20.0,
                follow_redirects=True,
            )
            response.raise_for_status()
            month_draws = parse_taiwan_lottery_history(response.json(), key, count)
            if limit is None and draws and not month_draws:
                return _newest_unique(draws)
            draws.extend(month_draws)
            combined = _newest_unique(draws, limit)
            if limit is not None and len(combined) >= limit:
                return combined

        if limit is None:
            raise ValueError("TAIWAN_HISTORY_BOUNDARY_NOT_FOUND")
        return _newest_unique(draws, limit)
