export const MEMBER_NOTIFICATION_LOTTERIES = ['今彩539', '天天樂', '六合彩', '大樂透'] as const;
export type MemberNotificationLottery = (typeof MEMBER_NOTIFICATION_LOTTERIES)[number];

const SETTING_KEYS = ['bet', 'result', 'status', 'card', 'collision', 'system', 'expiry'] as const;
const SELECTED_OPTION_KEYS = ['result', 'status', 'card', 'system', 'expiry'] as const;
const MATRIX_STATUSES = ['啟動', '聚合', '共振', '臨界'] as const;
const COLLISION_OPTIONS = ['獨碰二星', '獨碰三星'] as const;
const BET_TIME_OPTIONS: Record<MemberNotificationLottery, readonly string[]> = {
  今彩539: ['', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '19:45', '20:00', '20:10', '20:20', '20:25'],
  天天樂: ['', '05:00', '05:30', '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '08:45', '09:00', '09:10', '09:20', '09:25'],
  六合彩: ['', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '20:45', '21:00', '21:10', '21:20', '21:25'],
  大樂透: ['', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '19:45', '20:00', '20:10', '20:20', '20:25'],
};
const SELECTED_OPTION_ALLOWLIST: Record<(typeof SELECTED_OPTION_KEYS)[number], readonly string[]> = {
  result: MEMBER_NOTIFICATION_LOTTERIES,
  status: MEMBER_NOTIFICATION_LOTTERIES,
  card: MEMBER_NOTIFICATION_LOTTERIES,
  system: ['維護', '更新'],
  expiry: ['提前1日', '提前3日', '提前7日'],
};

export type MemberNotificationSettings = {
  settings: {
    bet: boolean;
    result: boolean;
    status: boolean;
    card: boolean;
    collision: boolean;
    system: boolean;
    expiry: boolean;
  };
  selectedOptions: Record<string, string[]> & {
    result: string[];
    status: string[];
    card: string[];
    system: string[];
    expiry: string[];
  };
  betTimes: Record<MemberNotificationLottery, [string, string]>;
  statusOptions: Record<MemberNotificationLottery, string[]>;
  collisionOptions: Record<MemberNotificationLottery, string[]>;
};

export function createDefaultMemberNotificationSettings(): MemberNotificationSettings {
  return {
    settings: {
      bet: true,
      result: true,
      status: true,
      card: true,
      collision: false,
      system: true,
      expiry: true,
    },
    selectedOptions: {
      result: ['今彩539', '天天樂', '六合彩', '大樂透'],
      status: ['今彩539', '天天樂', '六合彩', '大樂透'],
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

// Older installed clients may still submit the retired field; never persist or return it.
function activeSettings(value: unknown) {
  const input = record(value);
  return input ? Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'win')) : null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function normalizedList(value: unknown, fallback: string[], allowed: readonly string[]) {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((item): item is string => typeof item === 'string' && allowed.includes(item))
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, allowed.length);
}

function requiredList(value: unknown, allowed: readonly string[]) {
  if (!Array.isArray(value) || value.length > allowed.length) throw new Error('INVALID_NOTIFICATION_SETTINGS');
  if (!value.every((item): item is string => typeof item === 'string' && allowed.includes(item))) {
    throw new Error('INVALID_NOTIFICATION_SETTINGS');
  }
  if (new Set(value).size !== value.length) throw new Error('INVALID_NOTIFICATION_SETTINGS');
  return [...value];
}

export function normalizeMemberNotificationSettings(value: unknown): MemberNotificationSettings {
  const defaults = createDefaultMemberNotificationSettings();
  const input = record(value) ?? {};
  const enabled = record(input.settings) ?? {};
  const selected = record(input.selectedOptions) ?? {};
  const betTimes = record(input.betTimes) ?? {};
  const statusOptions = record(input.statusOptions) ?? {};
  const collisionOptions = record(input.collisionOptions) ?? {};

  for (const key of SETTING_KEYS) {
    if (typeof enabled[key] === 'boolean') defaults.settings[key] = enabled[key] as boolean;
  }
  for (const key of SELECTED_OPTION_KEYS) {
    const normalized = normalizedList(selected[key], defaults.selectedOptions[key], SELECTED_OPTION_ALLOWLIST[key]);
    defaults.selectedOptions[key] = normalized;
  }
  for (const lottery of MEMBER_NOTIFICATION_LOTTERIES) {
    const times = Array.isArray(betTimes[lottery]) ? betTimes[lottery] : defaults.betTimes[lottery];
    defaults.betTimes[lottery] = [
      typeof times[0] === 'string' && BET_TIME_OPTIONS[lottery].includes(times[0]) ? times[0] : '',
      typeof times[1] === 'string' && BET_TIME_OPTIONS[lottery].includes(times[1]) ? times[1] : '',
    ];
    defaults.statusOptions[lottery] = normalizedList(statusOptions[lottery], defaults.statusOptions[lottery], MATRIX_STATUSES);
    defaults.collisionOptions[lottery] = normalizedList(collisionOptions[lottery], defaults.collisionOptions[lottery], COLLISION_OPTIONS);
  }
  return defaults;
}

export function validateMemberNotificationSettings(value: unknown): MemberNotificationSettings {
  const input = record(value);
  if (!input || !hasExactKeys(input, ['settings', 'selectedOptions', 'betTimes', 'statusOptions', 'collisionOptions'])) {
    throw new Error('INVALID_NOTIFICATION_SETTINGS');
  }
  const enabled = activeSettings(input.settings);
  const selected = activeSettings(input.selectedOptions);
  const betTimes = record(input.betTimes);
  const statusOptions = record(input.statusOptions);
  const collisionOptions = record(input.collisionOptions);
  if (!enabled || !selected || !betTimes || !statusOptions || !collisionOptions
    || !hasExactKeys(enabled, SETTING_KEYS)
    || !hasExactKeys(selected, SELECTED_OPTION_KEYS)
    || !hasExactKeys(betTimes, MEMBER_NOTIFICATION_LOTTERIES)
    || !hasExactKeys(statusOptions, MEMBER_NOTIFICATION_LOTTERIES)
    || !hasExactKeys(collisionOptions, MEMBER_NOTIFICATION_LOTTERIES)) {
    throw new Error('INVALID_NOTIFICATION_SETTINGS');
  }
  if (!SETTING_KEYS.every((key) => typeof enabled[key] === 'boolean')) throw new Error('INVALID_NOTIFICATION_SETTINGS');
  for (const key of SELECTED_OPTION_KEYS) {
    requiredList(selected[key], SELECTED_OPTION_ALLOWLIST[key]);
  }
  for (const lottery of MEMBER_NOTIFICATION_LOTTERIES) {
    const times = betTimes[lottery];
    if (!Array.isArray(times) || times.length !== 2
      || !times.every((time): time is string => typeof time === 'string' && BET_TIME_OPTIONS[lottery].includes(time))) {
      throw new Error('INVALID_NOTIFICATION_SETTINGS');
    }
    requiredList(statusOptions[lottery], MATRIX_STATUSES);
    requiredList(collisionOptions[lottery], COLLISION_OPTIONS);
  }
  return normalizeMemberNotificationSettings(input);
}
