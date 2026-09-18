import { describe, expect, it } from "vitest";
import { paginateHistory } from "./history-pagination";

describe("paginateHistory", () => {
  it("limits each page to 50 records", () => {
    const records = Array.from({ length: 51 }, (_, index) => index + 1);

    expect(paginateHistory(records, 1).items).toHaveLength(50);
    expect(paginateHistory(records, 2).items).toEqual([51]);
  });

  it("clamps an unavailable page to the final page", () => {
    const records = Array.from({ length: 51 }, (_, index) => index + 1);

    expect(paginateHistory(records, 9)).toMatchObject({ currentPage: 2, totalPages: 2 });
  });
});
