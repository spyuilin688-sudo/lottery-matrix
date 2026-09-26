import { api } from './admin-platform-client';
import type { AppRevenueReport, AppMemberStatus } from '../../../backend/app-service-contracts';
export type AppAdminMember = { id: string; displayName: string | null; status: AppMemberStatus; entitlementRevision: number; entitlementSource: string; registeredAt?: string; subscription?: { status: string; expiresAt: string | null } | null };
export type AppAdminPage = { items: AppAdminMember[]; total: number; page: number; pageSize: number };
export type AppAdminClient = Pick<typeof api, 'get' | 'put'>;
export function parseAppPage(value: unknown): AppAdminPage {
  const data = value as AppAdminPage | null;
  if (!data || !Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total<0 || !Number.isSafeInteger(data.page) || data.page<1 || !Number.isSafeInteger(data.pageSize) || data.pageSize<1
    || data.items.some(item => !item || typeof item.id !== 'string' || !['active','disabled'].includes(item.status) || !Number.isSafeInteger(item.entitlementRevision))) throw new Error('App 資料格式無法確認');
  return data;
}
export function parseAppRevenue(value: unknown): AppRevenueReport {
  const data = value as AppRevenueReport | null;
  if (!data || !Number.isSafeInteger(data.transactionCount) || data.transactionCount<0 || !Array.isArray(data.totalsByCurrency)
    || data.totalsByCurrency.some(item => !/^[A-Z]{3}$/.test(item.currency) || !Number.isSafeInteger(item.grossMinor))) throw new Error('App 收入資料格式無法確認');
  return data;
}
