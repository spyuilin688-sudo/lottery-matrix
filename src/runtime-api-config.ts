export const PRODUCTION_RAILWAY_API_BASE =
  'https://heartfelt-generosity-production-9f2b.up.railway.app';

export function resolveRailwayApiBase(configured: unknown): string {
  const normalized = String(configured ?? '')
    .trim()
    .replace(/\/+$/, '');
  return normalized || PRODUCTION_RAILWAY_API_BASE;
}

export const RAILWAY_API_BASE = resolveRailwayApiBase(
  import.meta.env.VITE_RAILWAY_API_BASE,
);
