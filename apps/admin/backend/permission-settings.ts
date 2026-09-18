export type PermissionSettingKey =
  | 'subscriptionPurchaseVisible'
  | 'registeredMemberFreeAccess';

export type MatrixPermissionSettings = {
  subscriptionPurchaseVisible: boolean;
  registeredMemberFreeAccess: boolean;
  revision: number;
  updatedAt: string;
};

type Transport = {
  supabaseRequest<T = unknown>(path: string, init?: RequestInit): Promise<T>;
};

class PermissionSettingsResponseError extends Error {
  statusCode = 503;

  constructor() {
    super('PERMISSION_SETTINGS_UNAVAILABLE');
    this.name = 'PermissionSettingsResponseError';
  }
}

export function isPermissionSettingKey(value: unknown): value is PermissionSettingKey {
  return value === 'subscriptionPurchaseVisible'
    || value === 'registeredMemberFreeAccess';
}

export function parseSettings(value: unknown): MatrixPermissionSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PermissionSettingsResponseError();
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.subscriptionPurchaseVisible !== 'boolean'
    || typeof record.registeredMemberFreeAccess !== 'boolean'
    || !Number.isInteger(record.revision)
    || Number(record.revision) < 0
    || typeof record.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(record.updatedAt))
  ) {
    throw new PermissionSettingsResponseError();
  }
  return {
    subscriptionPurchaseVisible: record.subscriptionPurchaseVisible,
    registeredMemberFreeAccess: record.registeredMemberFreeAccess,
    revision: Number(record.revision),
    updatedAt: record.updatedAt,
  };
}

export function createPermissionSettings(transport: Transport) {
  return {
    async get(): Promise<MatrixPermissionSettings> {
      return parseSettings(await transport.supabaseRequest(
        'rpc/matrix_permission_settings',
        { method: 'POST', body: '{}' },
      ));
    },

    async update(
      actorId: string,
      key: PermissionSettingKey,
      value: boolean,
      expectedRevision: number,
    ): Promise<MatrixPermissionSettings> {
      return parseSettings(await transport.supabaseRequest(
        'rpc/admin_matrix_permission_settings_update',
        {
          method: 'POST',
          body: JSON.stringify({
            p_admin_id: actorId,
            p_change: { key, value, expectedRevision },
          }),
        },
      ));
    },
  };
}
