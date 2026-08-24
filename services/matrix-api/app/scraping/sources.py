from collections.abc import Callable
from datetime import datetime
import re
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.domain.models import MatrixDraw
from app.scraping.html_tables import parse_table_rows


TAIWAN_539_URL = "https://api.taiwanlottery.com/TLCAPIWeB/Lottery/Daily539Result"
TAIWAN_649_URL = "https://api.taiwanlottery.com/TLCAPIWeB/Lottery/Lotto649Result"
SC888_FANTASY5_URL = "https://sc888.net/index.php?s=/LotteryFan/index"
SC888_FANTASY5_DOWNLOAD_URL = "https://sc888.net/index.php?s=/LotteryFan/getDownloadXls"
NFD_MARKSIX_URL = "https://www.nfd.com.tw/house/year/{year}.htm"
NFD_MARKSIX_FIRST_YEAR = 1976
MAX_TAIWAN_HISTORY_MONTHS = 360
FORMAL_PAGE_REFERERS = {
    "今彩539": "https://www.taiwanlottery.com/lotto/result/daily_cash",
    "大樂透": "https://www.taiwanlottery.com/lotto/result/lotto649",
}
HEADERS = {
    "user-agent": "Mozilla/5.0 (compatible; Matrix Lottery Data Fetcher)",
    "accept-language": "zh-TW,zh;q=0.9,en;q=0.5",
}
DATE_PATTERN = re.compile(r"(?:20\d{2}|1\d{2})[年/\-.](?:1[0-2]|0?[1-9])[月/\-.](?:3[01]|[12]\d|0?[1-9])日?")
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
    if not str(period).strip() or not str(draw_date).strip():
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
            parsed.append(_materialize_draw(str(item.get("period", "")), str(item.get("lotteryDate", "")), size, count, appear))
        except ValueError:
            continue
    return _newest_unique(parsed)


def parse_taiwan_lottery_payload(payload: Any, key: str, count: int) -> MatrixDraw:
    parsed = parse_taiwan_lottery_history(payload, key, count)
    if not parsed:
        raise ValueError("TAIWAN_LOTTERY_DRAW_INCOMPLETE")
    return parsed[0]


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


def parse_nfd_marksix_history(html: str) -> list[MatrixDraw]:
    draws: list[MatrixDraw] = []
    for cells in parse_table_rows(html):
        if len(cells) < 10 or not re.fullmatch(r"20\d{2}|19\d{2}", cells[0]) or not re.fullmatch(r"\d{1,3}", cells[2]):
            continue
        date_match = re.fullmatch(r"(\d{1,2})/(\d{1,2})", cells[1])
        if not date_match:
            continue
        year = cells[0]
        period = "0" + year[-2:] + str(int(cells[2])).zfill(3)
        draw_date = f"{year}/{int(date_match.group(1)):02d}/{int(date_match.group(2)):02d}"
        try:
            draws.append(_materialize_draw(period, draw_date, cells[3:10], 7))
        except ValueError:
            continue
    return _newest_unique(draws)


def parse_nfd_marksix_html(html: str) -> MatrixDraw:
    draws = parse_nfd_marksix_history(html)
    if not draws:
        raise ValueError("NFD_DRAW_INCOMPLETE")
    return draws[0]


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
            response = self.client.get(SC888_FANTASY5_URL, headers=HEADERS, timeout=20.0, follow_redirects=True)
            response.raise_for_status()
            return parse_sc888_fantasy5_html(_response_text(response))
        if lottery == "六合彩":
            url = NFD_MARKSIX_URL.format(year=self.now().year)
            response = self.client.get(url, headers=HEADERS, timeout=20.0, follow_redirects=True)
            response.raise_for_status()
            return parse_nfd_marksix_html(_response_text(response))
        raise ValueError("UNKNOWN_LOTTERY")

    def fetch_history(self, lottery: str, limit: int | None) -> list[MatrixDraw]:
        if limit is not None and limit <= 0:
            return []
        if lottery in {"今彩539", "大樂透"}:
            return self._fetch_taiwan_history(lottery, limit)
        if lottery == "天天樂":
            url = SC888_FANTASY5_DOWNLOAD_URL if limit is None else SC888_FANTASY5_URL
            response = self.client.get(url, headers=HEADERS, timeout=30.0 if limit is None else 20.0, follow_redirects=True)
            response.raise_for_status()
            draws = parse_sc888_fantasy5_history(_response_text(response))
            if limit is None and not draws:
                raise ValueError("SC888_HISTORY_DOWNLOAD_INCOMPLETE")
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
        history = self._fetch_taiwan_history(lottery, 1, max_months=1)
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
