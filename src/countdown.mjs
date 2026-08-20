export function parseCountdown(value) {
  const [hours = "0", minutes = "0", seconds = "0"] = value.split(":");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

export function formatCountdown(value) {
  const totalSeconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function nextCountdownSeconds(currentSeconds) {
  return Math.max(0, Math.floor(currentSeconds) - 1);
}

export function secondsUntil(nextDrawAt, now = Date.now()) {
  const target = Date.parse(nextDrawAt);
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.floor((target - now) / 1000));
}

export function formatNextDrawAt(nextDrawAt) {
  const date = new Date(nextDrawAt);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = value("weekday").replace("週", "").replace("星期", "");
  return `${value("month")}/${value("day")}(${weekday}) ${value("hour")}:${value("minute")}`;
}
