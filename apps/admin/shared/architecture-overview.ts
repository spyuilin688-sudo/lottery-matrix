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
};

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
    return { provider: row.provider, plan: row.plan, fee: row.fee, renewalDate: row.renewalDate, verifiedAt: row.verifiedAt } as ArchitectureSubscription;
  });
}
