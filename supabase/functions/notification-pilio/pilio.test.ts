import { describe, expect, it } from "vitest";
import { duePilioSources, parsePilioResult, PILIO_SOURCES } from "./pilio.ts";

// Table structure and content verified against all three live page DOMs on 2026-09-06 (Taipei).
// Include a next-draw date and an older row so neither can masquerade as the result.
const page = (numbers: string, special = "", date = "09/05<br>26(六)") =>
  `<p>下期2026/09/07(一)</p><table><tr><td>日期</td><td>中獎號碼</td><td>特</td></tr>
  <tr><td class="date-cell">${date}</td><td class="number-cell">${numbers}</td>${special ? `<td class="bonus-cell">${special}</td>` : ""}</tr>
  <tr><td>09/04<br>26(五)</td><td>02,&nbsp;04, 15, 17, 24</td></tr></table>`;

describe("Pilio notification-only result parsing", () => {
  it("reads the draw date and five complete numbers without inventing a period", () => {
    expect(parsePilioResult(page("03,&nbsp;08, 10, 28, 38"), PILIO_SOURCES[0], "2026-09-05")).toEqual({
      lottery: "今彩539", lotteryCode: "539", drawDate: "2026-09-05", numbers: ["03", "08", "10", "28", "38"],
    });
  });
  it.each([
    [1, "09,18,26,30,33,45", "28", ["09", "18", "26", "30", "33", "45", "28"]],
    [2, "03,13,17,18,27,37", "19", ["03", "13", "17", "18", "27", "37", "19"]],
  ])("retains the separate special number for source %s", (index, main, special, numbers) => {
    expect(parsePilioResult(page(main as string, special as string), PILIO_SOURCES[index as number], "2026-09-05")?.numbers).toEqual(numbers);
  });
  it.each([
    page("03,08,10,28"), page("03,08,10,28,28"), page("03,08,10,28,40"),
    page("03,08,10,28,38", "", "09/04<br>26(五)"), page("03,08,10,28,38", "", "09/07<br>26(一)"),
    page("03,08,10,28,38", "", "02/30<br>26(一)"), "<h1>Access denied</h1>",
  ])("rejects incomplete, invalid, stale or future results", (html) => {
    expect(parsePilioResult(html, PILIO_SOURCES[0], "2026-09-05")).toBeNull();
  });
  it("requires the special number to be complete and different from the six main numbers", () => {
    expect(parsePilioResult(page("09,18,26,30,33,45"), PILIO_SOURCES[1], "2026-09-05")).toBeNull();
    expect(parsePilioResult(page("09,18,26,30,33,45", "45"), PILIO_SOURCES[1], "2026-09-05")).toBeNull();
  });
  it("does not fall back to an older complete row when the newest row is incomplete", () => {
    const html = page("03,08,10", "", "09/06<br>26(日)") + page("03,08,10,28,38");
    expect(parsePilioResult(html, PILIO_SOURCES[0], "2026-09-06")).toBeNull();
  });
});

describe("Pilio polling times use Asia/Taipei", () => {
  it.each([
    ["2026-09-05T12:34:59Z", []], ["2026-09-05T12:35:00Z", ["539"]],
    ["2026-09-05T12:40:59Z", ["539"]], ["2026-09-05T12:41:00Z", []],
    ["2026-09-05T12:55:00Z", ["lotto649"]], ["2026-09-05T13:00:59Z", ["lotto649"]],
    ["2026-09-05T13:35:00Z", ["marksix"]], ["2026-09-05T13:40:59Z", ["marksix"]],
    ["2026-09-05T13:41:00Z", []],
  ])("selects only the configured sources at %s", (timestamp, codes) => {
    expect(duePilioSources(new Date(timestamp as string)).map(source => source.lotteryCode)).toEqual(codes);
  });
});
