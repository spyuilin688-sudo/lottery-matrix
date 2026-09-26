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

export type ArchitectureAccount = {
  paymentDate: string | null;
  paymentDateNote: string;
  paymentAmount: string | null;
  paymentKind: 'due' | 'estimate' | 'pending' | 'unknown';
  paymentNote: string;
  costs: Array<{ label: string; value: string; note?: string }>;
  quotas: Array<{ label: string; included: string; used: string; remaining: string; reset: string; note?: string }>;
  verifiedAt: string;
  source: string;
};

export type ArchitectureBilling = {
  nextInvoiceAt?: string | null;
  billingCycle?: { start: string; end: string; precision: 'date' | 'timestamp'; source: string; verifiedAt: string };
  pendingAmount?: string | null;
  usageBreakdown?: Array<{label:string;quantity:string|null;grossAmount:string|null;discountAmount:string|null;netAmount:string|null}>;
  manualPayment?: {paymentDate:string;amount:string;verifiedAt:string;source:string} | null;
  manualInvoiceVerifiedAt?: string | null;
  limits?: Array<{ label: string; value: string }>;
  account?: ArchitectureAccount | null;
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
const isTimestamp = (value: unknown): value is string => isText(value)
  && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
  && isDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));

function readAccount(value: unknown): ArchitectureAccount | null {
  if (value === null) return null;
  const invalid = () => new Error('帳戶核對資料格式不符，請重新載入。');
  const isNote = (entry: unknown): entry is string => typeof entry === 'string' && entry.length <= 200;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const row = value as Record<string, unknown>;
  if (row.paymentDate !== null && !isDate(row.paymentDate)) throw invalid();
  if (row.paymentAmount !== null && !isText(row.paymentAmount)) throw invalid();
  if (typeof row.paymentKind !== 'string' || !['due', 'estimate', 'pending', 'unknown'].includes(row.paymentKind)) throw invalid();
  if (!isNote(row.paymentDateNote) || !isNote(row.paymentNote)) throw invalid();
  if (!isText(row.source) || !isText(row.verifiedAt) || !Number.isFinite(Date.parse(row.verifiedAt))) throw invalid();
  function readRows(value: unknown, fields: readonly string[]) {
    if (!Array.isArray(value) || value.length > 30) throw invalid();
    return value.map(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw invalid();
      const input = entry as Record<string, unknown>;
      const output: Record<string, string> = {};
      for (const field of fields) {
        if (!isText(input[field])) throw invalid();
        output[field] = input[field];
      }
      if (Object.prototype.hasOwnProperty.call(input, 'note')) {
        if (!isNote(input.note)) throw invalid();
        output.note = input.note;
      }
      return output;
    });
  }
  return {
    paymentDate: row.paymentDate,
    paymentDateNote: row.paymentDateNote,
    paymentAmount: row.paymentAmount,
    paymentKind: row.paymentKind,
    paymentNote: row.paymentNote,
    costs: readRows(row.costs, ['label', 'value']),
    quotas: readRows(row.quotas, ['label', 'included', 'used', 'remaining', 'reset']),
    verifiedAt: row.verifiedAt,
    source: row.source,
  } as ArchitectureAccount;
}

function readBilling(value: unknown): ArchitectureBilling | null {
  if (value === null || value === undefined) return null;
  const invalid = () => new Error('帳單資料格式不符，請重新載入。');
  if (typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const row = value as Record<string, unknown>;
  for (const field of ['latestInvoiceAmount', 'currentAmount', 'estimatedAmount', 'period', 'pendingAmount'] as const) {
    if (row[field] != null && !isText(row[field])) throw invalid();
  }
  if (row.latestInvoiceStatus != null && !['paid', 'open', 'void', 'uncollectible'].includes(String(row.latestInvoiceStatus))) throw invalid();
  if (row.latestPaymentDate != null && !isDate(row.latestPaymentDate)) throw invalid();
  if (!isText(row.source) || !isText(row.verifiedAt) || !Number.isFinite(Date.parse(row.verifiedAt))) throw invalid();
  if (row.nextInvoiceAt != null && !isTimestamp(row.nextInvoiceAt)) throw invalid();
  let billingCycle: ArchitectureBilling['billingCycle'];
  if (Object.prototype.hasOwnProperty.call(row, 'billingCycle')) {
    const cycle = row.billingCycle;
    if (!cycle || typeof cycle !== 'object' || Array.isArray(cycle)) throw invalid();
    const input = cycle as Record<string, unknown>;
    const validDate = input.precision === 'date' ? isDate : input.precision === 'timestamp' ? isTimestamp : null;
    if (!validDate || !validDate(input.start) || !validDate(input.end)
      || Date.parse(input.start) >= Date.parse(input.end) || !isText(input.source) || !isTimestamp(input.verifiedAt)) throw invalid();
    billingCycle = { start: input.start, end: input.end, precision: input.precision as 'date' | 'timestamp', source: input.source, verifiedAt: input.verifiedAt };
  }
  let limits: ArchitectureBilling['limits'];
  if (Object.prototype.hasOwnProperty.call(row, 'limits')) {
    if (!Array.isArray(row.limits) || row.limits.length > 30) throw invalid();
    limits = row.limits.map(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !isText(entry.label) || !isText(entry.value)) throw invalid();
      return { label: entry.label, value: entry.value };
    });
  }
  let usageBreakdown: ArchitectureBilling['usageBreakdown'];
  if (Object.prototype.hasOwnProperty.call(row, 'usageBreakdown')) {
    if (!Array.isArray(row.usageBreakdown) || row.usageBreakdown.length > 30) throw invalid();
    usageBreakdown=row.usageBreakdown.map(entry=>{
      if(!entry || typeof entry!=='object' || Array.isArray(entry) || !isText(entry.label)) throw invalid();
      const detail: Record<string,string|null>={label:entry.label};
      for(const field of ['quantity','grossAmount','discountAmount','netAmount']) {
        if(entry[field]!==null&&!isText(entry[field])) throw invalid();
        detail[field]=entry[field];
      }
      return detail as NonNullable<ArchitectureBilling['usageBreakdown']>[number];
    });
  }
  let manualPayment:ArchitectureBilling['manualPayment'];
  if(row.manualPayment!=null) {
    const payment=row.manualPayment as Record<string,unknown>;
    if(typeof payment!=='object'||Array.isArray(payment)||!isDate(payment.paymentDate)||!isText(payment.amount)||!isText(payment.source)||!isText(payment.verifiedAt)||!Number.isFinite(Date.parse(payment.verifiedAt))) throw invalid();
    manualPayment={paymentDate:payment.paymentDate,amount:payment.amount,source:payment.source,verifiedAt:payment.verifiedAt};
  }
  if(row.manualInvoiceVerifiedAt!=null&&(!isText(row.manualInvoiceVerifiedAt)||!Number.isFinite(Date.parse(row.manualInvoiceVerifiedAt)))) throw invalid();
  return {
    ...(Object.prototype.hasOwnProperty.call(row, 'nextInvoiceAt') ? {nextInvoiceAt:row.nextInvoiceAt??null} : {}),
    ...(billingCycle ? { billingCycle } : {}),
    ...(limits === undefined ? {} : { limits }),
    ...(usageBreakdown === undefined ? {} : { usageBreakdown }),
    ...(Object.prototype.hasOwnProperty.call(row,'pendingAmount') ? {pendingAmount:row.pendingAmount??null} : {}),
    ...(manualPayment ? {manualPayment} : {}),
    ...(row.manualInvoiceVerifiedAt ? {manualInvoiceVerifiedAt:row.manualInvoiceVerifiedAt} : {}),
    latestInvoiceAmount: row.latestInvoiceAmount ?? null,
    latestInvoiceStatus: row.latestInvoiceStatus ?? null,
    latestPaymentDate: row.latestPaymentDate ?? null,
    currentAmount: row.currentAmount ?? null,
    estimatedAmount: row.estimatedAmount ?? null,
    period: row.period ?? null,
    source: row.source,
    verifiedAt: row.verifiedAt,
    ...(Object.prototype.hasOwnProperty.call(row, 'account') ? { account: readAccount(row.account) } : {}),
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
