import { describe, expect, it } from "vitest";
import { createPilioNotificationHandler } from "./handler.ts";

const html = '<table><tr><td>09/05<br>26(六)</td><td>03,08,10,28,38</td></tr></table>';
function setup({ recorded = false, failFetch = false, page = html } = {}) {
  const calls: string[] = [];
  const results: unknown[] = [];
  const handler = createPilioNotificationHandler({
    dispatchToken: "test-secret", now: () => new Date("2026-09-05T12:35:00Z"),
    async isRecorded(lottery, date) { calls.push(`lookup:${lottery}:${date}`); return recorded; },
    async fetchPage(url) { calls.push(url); if (failFetch) throw new Error("upstream unavailable"); return page; },
    async publish(result) { calls.push("publish"); results.push(result); return { created: true }; },
    async dispatch() { calls.push("dispatch"); },
  });
  return { handler, calls, results };
}
const request = (token = "test-secret") => new Request("https://example.test/notification-pilio", { method: "POST", headers: { "x-matrix-dispatch-token": token } });

describe("notification-only polling boundary", () => {
  it("publishes only complete results then immediately requests notification dispatch", async () => {
    const test = setup();
    expect((await test.handler(request())).status).toBe(200);
    expect(test.calls).toEqual(["lookup:今彩539:2026-09-05", "https://www.pilio.idv.tw/lto539/list.asp", "publish", "dispatch"]);
    expect(test.results).toEqual([{ lottery: "今彩539", lotteryCode: "539", drawDate: "2026-09-05", numbers: ["03", "08", "10", "28", "38"] }]);
  });
  it("stops fetching a draw already recorded by either source", async () => {
    const test = setup({ recorded: true });
    await test.handler(request());
    expect(test.calls).toEqual(["lookup:今彩539:2026-09-05"]);
  });
  it.each([{ failFetch: true }, { page: "<h1>not updated</h1>" }])("does not publish an unavailable result", async (options) => {
    const test = setup(options);
    await test.handler(request());
    expect(test.results).toEqual([]);
    expect(test.calls).not.toContain("dispatch");
  });
  it("rejects unauthorized calls before fetching or publishing", async () => {
    const test = setup();
    expect((await test.handler(request("wrong"))).status).toBe(403);
    expect(test.calls).toEqual([]);
  });
});

it('answers the admin OPTIONS probe without reading or sending anything', async () => {
  const test = setup();
  const response = await test.handler(new Request('https://example.test/notification-pilio', { method: 'OPTIONS' }));
  expect(response.status).toBe(204);
  expect(response.headers.get('Allow')).toBe('POST, OPTIONS');
  expect(await response.text()).toBe('');
  expect(test.calls).toEqual([]);
});
it('still rejects a POST without the dispatch token', async () => {
  const test = setup();
  expect((await test.handler(new Request('https://example.test/notification-pilio', { method: 'POST' }))).status).toBe(401);
  expect(test.calls).toEqual([]);
});

it('requests processing after result dispatch and leaves a failed wake-up to the scheduled worker', async () => {
  const calls: string[] = [];
  const handler = createPilioNotificationHandler({
    dispatchToken: 'test-secret', now: () => new Date('2026-09-05T12:35:00Z'),
    async isRecorded() { return false; }, async fetchPage() { return html; },
    async publish() { calls.push('persist-result-and-event'); return { created: true }; },
    async dispatch() { calls.push('dispatch'); },
    async requestProcessing(result) {
      calls.push(`process:${result.lottery}:${result.drawDate}`);
      throw new Error('worker temporarily unavailable');
    },
  });
  const response = await handler(request());
  expect(calls).toEqual(['persist-result-and-event', 'dispatch', 'process:今彩539:2026-09-05']);
  expect(response.status).toBe(200);
  expect((await response.json()).processing).toEqual([{ lottery: '今彩539', status: 'retry-by-scheduled-worker' }]);
});
