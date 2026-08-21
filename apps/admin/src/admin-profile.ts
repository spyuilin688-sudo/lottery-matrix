type ApiClient = {
  put(url: string, data?: unknown): Promise<{ data: { admin: Record<string, unknown> } }>;
};

export async function saveOwnAdminName(api: ApiClient, name: string) {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error('管理員名稱必填');
  const response = await api.put('/api/me/name', { name: normalizedName });
  return response.data.admin;
}
