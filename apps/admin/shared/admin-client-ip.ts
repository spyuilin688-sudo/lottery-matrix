// Cross-zone Workers replace CF-Connecting-IP with this platform placeholder.
// It must never be interpreted as a visitor's location.
const WORKER_IP = '2a06:98c0:3600::103';
const IP_HEADER = 'x-matrix-client-ip';
const TIME_HEADER = 'x-matrix-client-ip-time';
const SIGNATURE_HEADER = 'x-matrix-client-ip-signature';
const encoder = new TextEncoder();

export function normalizeClientIp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ip = value.trim();
  if (!ip || ip.length > 45 || !/^[0-9a-f:.]+$/i.test(ip)) return null;
  if (!ip.includes(':')) {
    const parts = ip.split('.');
    return parts.length === 4 && parts.every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)
      ? ip : null;
  }
  try {
    const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
    return canonical && canonical !== WORKER_IP ? canonical : null;
  } catch { return null; }
}

type RequestIdentity = { method: string; path: string; origin: string };
const proofPayload = (ip: string, issuedAt: string, identity: RequestIdentity) => encoder.encode(
  JSON.stringify(['matrix-admin-ip-v1', ip, issuedAt, identity.method, identity.path, identity.origin]),
);
const validSecret = (value: unknown): value is string => typeof value === 'string' && value.length >= 32;
const importKey = (secret: string, usage: KeyUsage) => crypto.subtle.importKey(
  'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage],
);

export async function signClientIp(
  headers: Headers, value: unknown, secret: unknown, identity: RequestIdentity,
): Promise<void> {
  // The proxy owns these headers; incoming browser assertions are never reused.
  for (const name of [IP_HEADER, TIME_HEADER, SIGNATURE_HEADER]) headers.delete(name);
  const ip = normalizeClientIp(value);
  if (!ip || !validSecret(secret)) return;
  const issuedAt = String(Math.floor(Date.now() / 1000));
  const signature = await crypto.subtle.sign('HMAC', await importKey(secret, 'sign'), proofPayload(ip, issuedAt, identity));
  headers.set(IP_HEADER, ip);
  headers.set(TIME_HEADER, issuedAt);
  headers.set(SIGNATURE_HEADER, Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join(''));
}

export async function verifyClientIp(request: Request, path: string, secret: unknown): Promise<string | null> {
  if (!validSecret(secret)) return null;
  const ip = normalizeClientIp(request.headers.get(IP_HEADER));
  const issuedAt = request.headers.get(TIME_HEADER) ?? '';
  const signature = request.headers.get(SIGNATURE_HEADER) ?? '';
  if (!ip || !/^\d{10}$/.test(issuedAt) || !/^[0-9a-f]{64}$/.test(signature)) return null;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(issuedAt)) > 60) return null;
  const bytes = Uint8Array.from(signature.match(/../g)!, part => parseInt(part, 16));
  const identity = { method: request.method, path, origin: request.headers.get('origin') ?? '' };
  const valid = await crypto.subtle.verify('HMAC', await importKey(secret, 'verify'), bytes, proofPayload(ip, issuedAt, identity));
  return valid ? ip : null;
}
