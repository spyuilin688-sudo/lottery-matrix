type HistoryRecord = {
  issue?: string;
  period?: string;
  drawDate?: string;
  date?: string;
  numbers?: Array<string | number>;
  sortedNumbers?: Array<string | number>;
  specialNumber?: string | number | null;
};

export function normalizeLookupNumber(rawValue: string) {
  const digits = rawValue.replace(/\D/g, "").slice(0, 2);
  if (!digits) return "";
  const number = Number(digits);
  if (!Number.isInteger(number) || number < 1 || number > 49) return "";
  return String(number).padStart(2, "0");
}

export function isDuplicateLookupNumber(values: string[], editingIndex: number, candidate: string) {
  return Boolean(candidate) && values.some((value, index) => index !== editingIndex && value === candidate);
}

export function filterHistoryRecords<T extends HistoryRecord>(
  records: T[],
  filters: { issue: string; date: string },
) {
  const issueQuery = filters.issue.trim();
  const dateQuery = filters.date.replace(/-/g, "/").slice(0, 10);

  return records.filter((record) => {
    const issue = String(record.period ?? record.issue ?? "");
    const date = String(record.drawDate ?? record.date ?? "").replace(/-/g, "/").slice(0, 10);
    return (!issueQuery || issue.includes(issueQuery)) && (!dateQuery || date === dateQuery);
  });
}
