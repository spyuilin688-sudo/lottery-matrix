from html.parser import HTMLParser
import re


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


class _TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[str]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        del attrs
        if tag.lower() == "tr":
            self._row = []
        elif tag.lower() in {"td", "th"} and self._row is not None:
            self._cell = []

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        lowered = tag.lower()
        if lowered in {"td", "th"} and self._cell is not None and self._row is not None:
            self._row.append(clean_text(" ".join(self._cell)))
            self._cell = None
        elif lowered == "tr" and self._row is not None:
            # Empty cells retain their header position while results arrive in
            # stages (for example sorted numbers before the actual draw order).
            if any(self._row):
                self.rows.append(self._row)
            self._row = None
            self._cell = None


def parse_table_rows(html: str) -> list[list[str]]:
    parser = _TableParser()
    parser.feed(html)
    parser.close()
    return parser.rows
