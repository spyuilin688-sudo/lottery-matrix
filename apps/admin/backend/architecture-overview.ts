import { readArchitectureSubscriptions } from '../shared/architecture-overview';

type Transport = { selectRows(table: string, query: string): Promise<unknown[]> };

export function createArchitectureOverview(transport: Transport) {
  return {
    async get() {
      const rows = await transport.selectRows('admin_architecture_subscriptions',
        'select=provider,plan,fee,renewal_date,verified_at&order=provider&limit=4');
      const items = readArchitectureSubscriptions(rows.map(value => {
        const row = value as Record<string, unknown>;
        return { provider: row.provider, plan: row.plan, fee: row.fee, renewalDate: row.renewal_date, verifiedAt: row.verified_at };
      }));
      return { items };
    },
  };
}
