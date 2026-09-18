export type AdminGrowthPoint = {
  date: string;
  value: number;
};

export type AdminGrowthEntry = {
  date: string;
  delta: number;
};

export function cumulativeGrowthSeries(entries: AdminGrowthEntry[]): AdminGrowthPoint[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !Number.isFinite(entry.delta)) continue;
    totals.set(entry.date, (totals.get(entry.date) ?? 0) + entry.delta);
  }

  let cumulative = 0;
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, delta]) => ({
      date,
      value: cumulative += delta,
    }));
}
