export const MEMBER_NOTIFICATION_LOTTERIES = ['今彩539', '天天樂', '六合彩', '大樂透'] as const;
export type MemberNotificationLottery = (typeof MEMBER_NOTIFICATION_LOTTERIES)[number];

export type MemberNotificationSettings = {
  settings: {
    bet: boolean;
    result: boolean;
    win: boolean;
    status: boolean;
    card: boolean;
    collision: boolean;
    system: boolean;
    expiry: boolean;
  };
  selectedOptions: Record<string, string[]>;
  betTimes: Record<MemberNotificationLottery, [string, string]>;
  statusOptions: Record<MemberNotificationLottery, string[]>;
  collisionOptions: Record<MemberNotificationLottery, string[]>;
};

export function createDefaultMemberNotificationSettings(): MemberNotificationSettings {
  return {
    settings: {
      bet: true,
      result: true,
      win: true,
      status: true,
      card: true,
      collision: false,
      system: true,
      expiry: true,
    },
    selectedOptions: {
      result: ['今彩539', '天天樂', '六合彩', '大樂透'],
      win: ['彩種通知'],
      card: ['今彩539', '天天樂', '六合彩', '大樂透'],
      system: ['維護', '更新'],
      expiry: ['提前1日', '提前3日', '提前7日'],
    },
    betTimes: {
      今彩539: ['', ''],
      天天樂: ['', ''],
      六合彩: ['', ''],
      大樂透: ['', ''],
    },
    statusOptions: {
      今彩539: ['啟動', '聚合', '共振', '臨界'],
      天天樂: ['啟動', '聚合', '共振', '臨界'],
      六合彩: ['啟動', '聚合', '共振', '臨界'],
      大樂透: ['啟動', '聚合', '共振', '臨界'],
    },
    collisionOptions: {
      今彩539: ['獨碰二星', '獨碰三星'],
      天天樂: ['獨碰二星', '獨碰三星'],
      六合彩: ['獨碰二星', '獨碰三星'],
      大樂透: ['獨碰二星', '獨碰三星'],
    },
  };
}

function record(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringList(value: unknown, fallback: string[]) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [...fallback];
}

export function normalizeMemberNotificationSettings(value: unknown): MemberNotificationSettings {
  const defaults = createDefaultMemberNotificationSettings();
  const input = record(value);
  if (!input) throw new Error('INVALID_NOTIFICATION_SETTINGS');
  const enabled = record(input.settings) ?? {};
  const selected = record(input.selectedOptions) ?? {};
  const betTimes = record(input.betTimes) ?? {};
  const statusOptions = record(input.statusOptions) ?? {};
  const collisionOptions = record(input.collisionOptions) ?? {};

  for (const key of Object.keys(defaults.settings) as Array<keyof MemberNotificationSettings['settings']>) {
    if (typeof enabled[key] === 'boolean') defaults.settings[key] = enabled[key] as boolean;
  }
  for (const key of Object.keys(defaults.selectedOptions)) {
    defaults.selectedOptions[key] = stringList(selected[key], defaults.selectedOptions[key]);
  }
  for (const lottery of MEMBER_NOTIFICATION_LOTTERIES) {
    const times = Array.isArray(betTimes[lottery]) ? betTimes[lottery] as unknown[] : defaults.betTimes[lottery];
    defaults.betTimes[lottery] = [String(times[0] ?? ''), String(times[1] ?? '')];
    defaults.statusOptions[lottery] = stringList(statusOptions[lottery], defaults.statusOptions[lottery]);
    defaults.collisionOptions[lottery] = stringList(collisionOptions[lottery], defaults.collisionOptions[lottery]);
  }
  return defaults;
}
