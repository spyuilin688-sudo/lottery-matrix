export const architectureProviders = [
  { id: 'railway', name: 'Railway', url: 'https://railway.com/workspace/billing' },
  { id: 'supabase', name: 'Supabase', url: 'https://supabase.com/dashboard/org/nuajfelyzboqzerutoxa/billing' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/settings/billing' },
  { id: 'cloudflare', name: 'Cloudflare Pages', url: 'https://dash.cloudflare.com/?to=/:account/billing' },
] as const;

export type ArchitectureSubscription = {
  provider: typeof architectureProviders[number]['id'];
  plan: string | null;
  fee: string | null;
  renewalDate: string | null;
  verifiedAt: string | null;
  billing: ArchitectureBilling | null;
};

export type ArchitectureBilling = {
  latestInvoiceAmount: string | null;
  latestInvoiceStatus: 'paid' | 'open' | 'void' | 'uncollectible' | null;
  latestPaymentDate: string | null;
  currentAmount: string | null;
  estimatedAmount: string | null;
  period: string | null;
  source: string;
  verifiedAt: string;
};

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

function readBilling(value: unknown): ArchitectureBilling | null {
  if (value === null || value === undefined) return null;
  const invalid = () => new Error('帳單資料格式不符，請重新載入。');
  if (typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const row = value as Record<string, unknown>;
  for (const field of ['latestInvoiceAmount', 'currentAmount', 'estimatedAmount', 'period'] as const) {
    if (row[field] != null && !isText(row[field])) throw invalid();
  }
  if (row.latestInvoiceStatus != null && !['paid', 'open', 'void', 'uncollectible'].includes(String(row.latestInvoiceStatus))) throw invalid();
  if (row.latestPaymentDate != null && !isDate(row.latestPaymentDate)) throw invalid();
  if (!isText(row.source) || !isText(row.verifiedAt) || !Number.isFinite(Date.parse(row.verifiedAt))) throw invalid();
  return {
    latestInvoiceAmount: row.latestInvoiceAmount ?? null,
    latestInvoiceStatus: row.latestInvoiceStatus ?? null,
    latestPaymentDate: row.latestPaymentDate ?? null,
    currentAmount: row.currentAmount ?? null,
    estimatedAmount: row.estimatedAmount ?? null,
    period: row.period ?? null,
    source: row.source,
    verifiedAt: row.verifiedAt,
  } as ArchitectureBilling;
}

export function readArchitectureSubscriptions(value: unknown): ArchitectureSubscription[] {
  const invalid = () => new Error('訂閱資料格式不符，請重新載入。');
  if (!Array.isArray(value) || value.length > architectureProviders.length) throw invalid();
  const seen = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw invalid();
    const row = item as Record<string, unknown>;
    if (!architectureProviders.some(provider => provider.id === row.provider) || seen.has(String(row.provider))) throw invalid();
    seen.add(String(row.provider));
    for (const field of ['plan', 'fee'] as const) {
      if (row[field] !== null && (typeof row[field] !== 'string' || !row[field].trim() || row[field].length > 200)) throw invalid();
    }
    if (row.renewalDate !== null && (
      typeof row.renewalDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.renewalDate)
      || !Number.isFinite(Date.parse(row.renewalDate))
      || new Date(row.renewalDate).toISOString().slice(0, 10) !== row.renewalDate
    )) throw invalid();
    if (row.verifiedAt !== null && (typeof row.verifiedAt !== 'string' || !Number.isFinite(Date.parse(row.verifiedAt)))) throw invalid();
    return { provider: row.provider, plan: row.plan, fee: row.fee, renewalDate: row.renewalDate, verifiedAt: row.verifiedAt, billing: readBilling(row.billing) } as ArchitectureSubscription;
  });
}
