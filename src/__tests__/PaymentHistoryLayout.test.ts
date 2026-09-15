// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const readSource = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const paymentHistorySource = readSource("src/features/PaymentHistoryPage.tsx");

describe("payment history layout", () => {
  it("keeps the page title in the header but removes the duplicate visible title inside the ledger card", () => {
    expect(paymentHistorySource).toContain('<ProfileDetailShell title="付款紀錄"');
    expect(paymentHistorySource).not.toContain('<DetailCard title="付款紀錄">');
    expect(paymentHistorySource).toContain('aria-label="付款紀錄"');
  });
});
