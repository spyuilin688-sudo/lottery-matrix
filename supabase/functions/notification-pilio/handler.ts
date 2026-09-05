import { duePilioSources, parsePilioResult, taipeiDate, type PilioResult } from "./pilio.ts";
type Dependencies = {
  dispatchToken: string; now?: () => Date;
  isRecorded(lottery: string, date: string): Promise<boolean>;
  fetchPage(url: string): Promise<string>;
  publish(result: PilioResult): Promise<{ created: boolean }>;
  dispatch(): Promise<void>;
};
function tokenEquals(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

export function createPilioNotificationHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
    const token = request.headers.get("x-matrix-dispatch-token")?.trim() ?? "";
    if (!token) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    if (!dependencies.dispatchToken || !tokenEquals(token, dependencies.dispatchToken)) return Response.json({ error: "INVALID_TOKEN" }, { status: 403 });
    const now = (dependencies.now ?? (() => new Date()))();
    const date = taipeiDate(now);
    const results: { lottery: string; status: string }[] = [];
    let published = false;
    for (const source of duePilioSources(now)) {
      try {
        if (await dependencies.isRecorded(source.lottery, date)) {
          results.push({ lottery: source.lottery, status: "already-recorded" });
          continue;
        }
        const result = parsePilioResult(await dependencies.fetchPage(source.url), source, date);
        if (!result) {
          results.push({ lottery: source.lottery, status: "waiting-source" });
          continue;
        }
        const event = await dependencies.publish(result);
        published = true;
        results.push({ lottery: source.lottery, status: event.created ? "published" : "already-recorded" });
      } catch {
        results.push({ lottery: source.lottery, status: "failed" });
      }
    }
    let dispatch = "not-needed";
    if (published) {
      try { await dependencies.dispatch(); dispatch = "requested"; }
      catch { dispatch = "retry-by-scheduled-dispatch"; }
    }
    return Response.json({ date, results, dispatch }, { status: results.some(result => result.status === "failed") ? 502 : 200 });
  };
}
