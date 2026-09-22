export type EcpayValue = string | number;
export type EcpayParams = Record<string, EcpayValue>;

function asciiCompare(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function ecpayUrlEncode(value: string) {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/~/g, "%7E")
    .replace(/'/g, "%27");
}

function normalizedEntries(params: EcpayParams) {
  return Object.entries(params)
    .filter(([key, value]) => key !== "CheckMacValue" && value !== undefined && value !== null)
    .sort(([left], [right]) => asciiCompare(left, right))
    .map(([key, value]) => [key, String(value)] as const);
}

export async function createEcpayCheckMacValue(
  params: EcpayParams,
  hashKey: string,
  hashIv: string,
) {
  if (!hashKey || !hashIv) throw new Error("ECPAY_HASH_CONFIG_MISSING");
  const joined = normalizedEntries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const source = `HashKey=${hashKey}&${joined}&HashIV=${hashIv}`;
  const encoded = ecpayUrlEncode(source).toLowerCase();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(encoded),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

export async function verifyEcpayCheckMacValue(
  params: EcpayParams,
  suppliedCheckMacValue: string,
  hashKey: string,
  hashIv: string,
) {
  if (!/^[A-Fa-f0-9]{64}$/.test(suppliedCheckMacValue)) return false;
  const expected = await createEcpayCheckMacValue(params, hashKey, hashIv);
  return constantTimeEqual(expected, suppliedCheckMacValue.toUpperCase());
}

export function createMerchantTradeNo(
  now: Date = new Date(),
  randomBytes: Uint8Array = crypto.getRandomValues(new Uint8Array(4)),
) {
  if (!Number.isFinite(now.getTime()) || randomBytes.length < 4) {
    throw new Error("ECPAY_ORDER_ID_INPUT_INVALID");
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const stamp = `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
  const suffix = Array.from(randomBytes.slice(0, 4))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()
    .slice(0, 7);
  const value = `M${stamp}${suffix}`;
  if (!/^[A-Za-z0-9]{1,20}$/.test(value)) throw new Error("ECPAY_ORDER_ID_INVALID");
  return value;
}
