type Row = Record<string, unknown>;
type Requester = { request<T = unknown>(path: string, init?: RequestInit): Promise<T> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ipText = (value: unknown) => typeof value === 'string' && /^[0-9a-f:.]+$/i.test(value) ? value : null;
const taiwanCities: Record<string, string> = { Taipei: '台北市', 'New Taipei': '新北市', 'New Taipei City': '新北市', Taoyuan: '桃園市', Taichung: '台中市', Tainan: '台南市', Kaohsiung: '高雄市', Keelung: '基隆市', Hsinchu: '新竹市', Chiayi: '嘉義市' };
export function locationLabel(row: Row | undefined): string | null {
  if (!row?.country_code) return null;
  const code = String(row.country_code);
  let country = code;
  try { country = new Intl.DisplayNames(['zh-Hant'], { type: 'region' }).of(code) || code; } catch { /* keep code */ }
  const city = String(row.city || '');
  return [country, code === 'TW' ? taiwanCities[city] || city : city].filter(Boolean).join('・');
}

export async function lookupLocations(ips: Array<string | null>, api: Requester, fetcher = fetch) {
  const unique = [...new Set(ips.filter((ip): ip is string => !!ip))];
  const result = new Map<string, string | null>();
  // Enrichment is bounded and non-blocking for authentication. No member ID,
  // name, token or login time is sent to the geolocation service.
  for (let start = 0; start < unique.length; start += 100) {
    const group = unique.slice(start, start + 100);
    const cached = await api.request<Row[]>(`/rest/v1/member_ip_locations?select=ip,country_code,city,checked_at&ip=in.(${group.map(encodeURIComponent).join(',')})`);
    for (const row of cached) {
      if (Date.now() - Date.parse(String(row.checked_at)) < (row.country_code ? 7 * 86400000 : 3600000)) result.set(String(row.ip), locationLabel(row));
    }
  }
  const missing = unique.filter(ip => !result.has(ip)).slice(0, 10);
  await Promise.all(missing.map(async ip => {
    let row: Row = { ip, country_code: null, city: null, checked_at: new Date().toISOString() };
    try {
      const response = await fetcher(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code,city`, { signal: AbortSignal.timeout(2500) });
      if (response.ok) {
        const data = await response.json() as Row;
        if (data.success === true && typeof data.country_code === 'string' && /^[A-Z]{2}$/.test(data.country_code)) row = { ...row, country_code: data.country_code, city: typeof data.city === 'string' ? data.city.slice(0, 100) : null };
      }
      await api.request('/rest/v1/member_ip_locations?on_conflict=ip', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
    } catch { /* Missing location must not hide member records. */ }
    result.set(ip, locationLabel(row));
  }));
  return result;
}

export async function memberConnectionSummaries(authIds: string[], api: Requester) {
  const result = new Map<string, { recentIp: string | null; estimatedRegion: string | null }>();
  const ids = [...new Set(authIds.filter(id => uuid.test(id)))];
  const rows: Row[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    rows.push(...await api.request<Row[]>(`/rest/v1/member_latest_connections?select=auth_user_id,last_connection_ip&auth_user_id=in.(${ids.slice(offset, offset + 100).join(',')})`));
  }
  const locations = await lookupLocations(rows.map(row => ipText(row.last_connection_ip)), api).catch(() => new Map<string, string | null>());
  for (const row of rows) { const ip = ipText(row.last_connection_ip); result.set(String(row.auth_user_id), { recentIp: ip, estimatedRegion: ip ? locations.get(ip) || null : null }); }
  return result;
}

export async function listMemberLoginHistory(memberId: string, rawPage: unknown, api: Requester) {
  const page = Number(rawPage ?? 1);
  if (!uuid.test(memberId) || !Number.isSafeInteger(page) || page < 1 || page > 100000) throw Object.assign(new Error('查詢條件不正確'), { statusCode: 400 });
  const members = await api.request<Row[]>(`/rest/v1/members?select=auth_user_id&id=eq.${memberId}&limit=1`);
  if (!members[0]) throw Object.assign(new Error('找不到會員'), { statusCode: 404 });
  const authId = String(members[0].auth_user_id);
  if (!uuid.test(authId)) return { items: [], hasMore: false };
  const rows = await api.request<Row[]>(`/rest/v1/member_login_records?select=id,login_at,login_ip&auth_user_id=eq.${authId}&order=login_at.desc,id.desc&limit=6&offset=${(page - 1) * 5}`);
  const items = rows.slice(0, 5);
  const locations = await lookupLocations(items.map(row => ipText(row.login_ip)), api).catch(() => new Map<string, string | null>());
  return { items: items.map(row => { const ip = ipText(row.login_ip); return { id: String(row.id), loginAt: row.login_at, ip, region: ip ? locations.get(ip) || null : null }; }), hasMore: rows.length > 5 };
}
