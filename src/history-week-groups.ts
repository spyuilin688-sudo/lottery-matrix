type HistoryRecordWithDate = {
  drawDate?: string;
  date?: string;
};

type NearHistoryLottery = "今彩539" | "天天樂" | "六合彩" | "大樂透";

function getWeekday(value: string | undefined) {
  const explicit = value?.match(/[（(]([日一二三四五六])[）)]/);
  if (explicit) return explicit[1];

  const match = value?.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (!match) return null;
  return ["日", "一", "二", "三", "四", "五", "六"][
    new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay()
  ];
}

export function isNearHistoryWeekBoundary(
  lottery: NearHistoryLottery,
  previousDate: string | undefined,
  currentDate: string | undefined,
) {
  const expected: Record<NearHistoryLottery, [string, string]> = {
    "今彩539": ["一", "六"],
    "天天樂": ["一", "日"],
    "六合彩": ["二", "六"],
    "大樂透": ["二", "五"],
  };
  const [previousWeekday, currentWeekday] = expected[lottery];
  return getWeekday(previousDate) === previousWeekday && getWeekday(currentDate) === currentWeekday;
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
