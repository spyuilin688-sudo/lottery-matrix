from pathlib import Path

path = Path('src/feature-pages.css')
text = path.read_text(encoding='utf-8')

start = text.find('.tongxing-query {')
end_marker = '.tongxing-results-end { height: 1px; }'
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('Matrix Tongxing formal CSS block not found')
end += len(end_marker)

new_block = r'''.tongxing-screen {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
}

.tongxing-query {
  box-sizing: border-box;
  width: 366px;
  max-width: 100%;
  min-width: 0;
  height: auto;
  margin-top: 8px;
  padding: 10px;
  border: 1px solid #6c4a20;
  border-radius: 12px;
  box-shadow: none;
}
.tongxing-query .query-selects {
  display: grid;
  width: 344px;
  max-width: 100%;
  grid-template-columns: 116px minmax(0, 220px);
  gap: 8px;
}
.number-reference-screen .query-selects.three-cols { grid-template-columns: 88px 84px minmax(0, 1fr); margin-bottom: 12px; }
.number-reference-screen .reference-select { height: 36px; }
.number-reference-screen .reference-select select { padding-right: 28px; font-size: 14px; font-weight: 600; text-align: center; text-align-last: center; }
.number-reference-screen .reference-select svg { right: 8px; width: 15px; }
.number-reference-screen .reference-order-select select { padding-left: 5px; padding-right: 22px; font-size: 11.5px; }
.tongxing-query .reference-select { height: 44px; min-height: 44px; }
.tongxing-query .reference-select select {
  height: 44px;
  padding: 0 36px 0 12px;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  text-align-last: center;
}
.tongxing-query .reference-select svg { right: 12px; width: 16px; height: 16px; }
.tongxing-query .lottery-tabs { display: none; }
.tongxing-query .tongxing-order-select select { font-size: 16px; font-weight: 600; }
.same-star-fields {
  display: grid;
  width: 344px;
  max-width: 100%;
  margin: 8px 0 0;
  grid-template-columns: repeat(3, 44px) auto 64px auto;
  gap: 8px;
  align-items: center;
}
.same-star-fields input {
  box-sizing: border-box;
  width: 44px;
  min-width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid #6e4a1e;
  border-radius: 9px;
  outline: none;
  background: #030a10;
  color: #efe8dc;
  font-size: 18px;
  font-weight: 600;
  line-height: 44px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
}
.reference-search input, .note-form input { min-width: 0; height: 42px; padding: 0 8px; border: 1px solid #6e4a1e; border-radius: 7px; outline: none; background: #030a10; color: #efe8dc; text-align: center; }
.same-star-fields > span { color: #d5cec2; font-size: 16px; font-weight: 600; white-space: nowrap; }
.same-star-period-select { width: 64px; height: 44px; min-height: 44px; }
.same-star-period-select select {
  height: 44px;
  padding: 0 24px 0 7px;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  text-align-last: center;
}
.same-star-period-select svg { right: 6px; width: 16px; height: 16px; }
.ornament-title {
  display: flex;
  margin: 16px 0 10px;
  align-items: center;
  justify-content: center;
  gap: 13px;
  color: #ddd6ca;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
}
.ornament-title span { height: 1px; flex: 1; background: #6f5121; }
.ornament-title span:last-child { background: #6f5121; }
.tongxing-results {
  box-sizing: border-box;
  width: 356px;
  max-width: 100%;
  margin-inline: auto;
  overflow: hidden;
  border: 1px solid #6c4a20;
  border-radius: 12px;
  box-shadow: none;
}
.tongxing-table { width: 100%; font-variant-numeric: tabular-nums; }
.tongxing-table-row {
  display: grid;
  grid-template-columns: 62px repeat(5, minmax(0, 1fr));
  align-items: stretch;
  text-align: center;
}
.tongxing-table[data-columns="7"] .tongxing-table-row { grid-template-columns: 62px repeat(7, minmax(0, 1fr)); }
.tongxing-table-row > span {
  display: flex;
  min-width: 0;
  min-height: 52px;
  align-items: center;
  justify-content: center;
  border-left: 1px solid rgba(111, 78, 31, .28);
  color: #f2eee7;
  font-size: 17px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.tongxing-table-row > span:first-child { border-left: 0; }
.tongxing-table-head { min-height: 38px; border-bottom: 1px solid rgba(118, 80, 31, .65); background: rgba(104, 73, 23, .08); }
.tongxing-table-head > span { min-height: 38px; color: #d8aa39; font-size: 15px; font-weight: 700; }
.tongxing-result-group { display: block; border-top: 2px solid rgba(141, 99, 40, .70); box-shadow: none; }
.tongxing-result-group:first-of-type { border-top: 0; }
.tongxing-table-row[data-row-type="locked"] { background: rgba(126, 83, 15, .16); }
.tongxing-table-row[data-row-type="predicted"] { background: rgba(10, 61, 88, .20); }
.tongxing-table-row[data-row-type="predicted"] > span { border-top: 1px solid rgba(105, 129, 140, .34); }
.tongxing-period-cell { display: grid !important; min-height: 52px !important; padding: 2px 3px; align-content: center; gap: 2px; }
.tongxing-period-cell strong { color: #e4c44e; font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.tongxing-period-cell time { color: #aaa49a; font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums; }
.tongxing-table-row[data-row-type="predicted"] .tongxing-period-cell strong { color: #78bfe3; }
.tongxing-table-row .locked-input-number { color: #ef5b58; font-size: 17px; font-weight: 700; }
.tongxing-table[data-columns="7"] .tongxing-table-row > span { font-size: 17px; }
.tongxing-table[data-columns="7"] .tongxing-period-cell { padding-inline: 2px; }
.tongxing-table[data-columns="7"] .tongxing-period-cell strong { font-size: 16px; }
.tongxing-results-end { height: 12px; }'''

text = text[:start] + new_block + text[end:]

for item in [
    'grid-template-columns: repeat(3, 46px) 1fr 66px auto',
    'border-top: 3px solid #02080d',
    'background: linear-gradient(90deg, rgba(126, 83, 15, .32)',
    'background: linear-gradient(90deg, rgba(10, 61, 88, .42)',
]:
    if item in text:
        raise SystemExit('Old Matrix Tongxing rule remains: ' + item)

for item in [
    'grid-template-columns: 116px minmax(0, 220px);',
    'grid-template-columns: repeat(3, 44px) auto 64px auto;',
    'width: 356px;',
    'border-top: 2px solid rgba(141, 99, 40, .70);',
    '.tongxing-results-end { height: 12px; }',
]:
    if item not in text:
        raise SystemExit('Required Matrix Tongxing rule missing: ' + item)

path.write_text(text, encoding='utf-8')
