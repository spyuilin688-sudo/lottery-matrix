type HistoryRecordWithDate = {
  drawDate?: string;
  date?: string;
};

type NearHistoryLottery = "今彩539" | "天天樂" | "六合彩" | "大樂透";

export function isNearHistoryWeekBoundary(
  _lottery: NearHistoryLottery,
  previousDate: string | undefined,
  currentDate: string | undefined,
) {
  const previousWeek = getMondayKey(previousDate);
  const currentWeek = getMondayKey(currentDate);
  return Boolean(previousWeek && currentWeek && previousWeek !== currentWeek);
}

function getMondayKey(value: string | undefined) {
  const match = value?.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (!match) return null;

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const daysFromMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysFromMonday);
  return date.toISOString().slice(0, 10);
}

export function groupHistoryByCalendarWeek<T extends HistoryRecordWithDate>(records: T[]) {
  const groups: T[][] = [];
  const groupIndexes = new Map<string, number>();

  records.forEach((record) => {
    const key = getMondayKey(record.drawDate ?? record.date);
    if (!key) {
      groups.push([record]);
      return;
    }

    const existingIndex = groupIndexes.get(key);
    if (existingIndex === undefined) {
      groupIndexes.set(key, groups.length);
      groups.push([record]);
      return;
    }

    groups[existingIndex].push(record);
  });

  return groups;
}
