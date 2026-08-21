export type DrawRecord = {
  period: string;
  drawDate: string;
  numbers: string[];
  sortedNumbers?: string[];
  drawOrderNumbers?: string[];
};

export function normalizeNumberList(values: string[]) {
  return values.map((value) => String(Number(value)).padStart(2, '0'));
}

export function sortDrawNumbers(values: string[]) {
  const normalized = normalizeNumberList(values);
  if (normalized.length === 7) {
    return [...normalized.slice(0, 6).sort((a, b) => Number(a) - Number(b)), normalized[6]];
  }
  return [...normalized].sort((a, b) => Number(a) - Number(b));
}

export function materializeOrderFields(draw: DrawRecord): DrawRecord {
  const sortedNumbers = sortDrawNumbers(draw.sortedNumbers?.length ? draw.sortedNumbers : draw.numbers);
  const drawOrderNumbers = draw.drawOrderNumbers?.length === sortedNumbers.length
    ? normalizeNumberList(draw.drawOrderNumbers)
    : undefined;
  return {
    ...draw,
    numbers: sortedNumbers,
    sortedNumbers,
    ...(drawOrderNumbers ? { drawOrderNumbers } : {}),
  };
}

function drawQuality(draw: DrawRecord) {
  return (Number.isFinite(Date.parse(draw.drawDate)) ? 2 : draw.drawDate ? 1 : 0)
    + (draw.drawOrderNumbers ? 1 : 0);
}

function stableDrawKey(draw: DrawRecord) {
  return JSON.stringify({
    drawDate: draw.drawDate,
    sortedNumbers: draw.sortedNumbers,
    drawOrderNumbers: draw.drawOrderNumbers ?? [],
  });
}

function mergeDrawGroup(rows: DrawRecord[]) {
  const ranked = rows.map(materializeOrderFields).sort((left, right) => (
    drawQuality(right) - drawQuality(left) || stableDrawKey(left).localeCompare(stableDrawKey(right))
  ));
  const preferred = ranked[0];
  const preferredNumbers = preferred.sortedNumbers?.join(',');
  const compatible = ranked.filter((draw) => draw.sortedNumbers?.join(',') === preferredNumbers);
  const compatibleDrawOrder = compatible
    .map((draw) => draw.drawOrderNumbers)
    .find((values) => values && sortDrawNumbers(values).join(',') === preferredNumbers);
  return {
    period: preferred.period,
    drawDate: preferred.drawDate || compatible.find((draw) => draw.drawDate)?.drawDate || '',
    numbers: preferred.sortedNumbers ?? preferred.numbers,
    sortedNumbers: preferred.sortedNumbers,
    ...(compatibleDrawOrder ? { drawOrderNumbers: compatibleDrawOrder } : {}),
  };
}

export function mergeDrawRecord(existing: DrawRecord, incoming: DrawRecord): DrawRecord {
  return mergeDrawGroup([existing, incoming]);
}

export function deduplicateDrawRecords<T extends DrawRecord>(rows: T[]) {
  const grouped = new Map<string, DrawRecord[]>();
  for (const row of rows) {
    grouped.set(row.period, [...grouped.get(row.period) ?? [], row]);
  }
  return [...grouped.values()].map(mergeDrawGroup);
}
