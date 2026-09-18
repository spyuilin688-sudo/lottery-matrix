import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
// Permanent regression coverage for audit issues #8 and #11.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("推薦碼 UX contract 反映現行 member_referral_submit", () => {
  const contract = read("UX-CONTRACT.md");
  const referralRow = contract.split("\n").find((line) => line.includes("| Submit referral code |")) ?? "";
  assert.match(referralRow, /member_referral_submit/);
  assert.match(referralRow, /推薦碼已儲存/);
  assert.doesNotMatch(referralRow, /Disabled because no mutation API is specified/);
  assert.doesNotMatch(referralRow, /No success is claimed/);
});

test("matrix-core 保留相容路由但不保留不可達 MatrixCorePage", () => {
  const featurePages = readFeaturePagesSource();
  const prototype = read("src/Prototype.tsx");
  assert.doesNotMatch(featurePages, /(?:export\s+)?function\s+MatrixCorePage\s*\(/);
  assert.match(featurePages, /if \(screen === "matrix-core"\) return <MatrixExplorePage onNavigate=\{onNavigate\} \/>;/);
  assert.match(prototype, /<MatrixCoreBanner onOpen=\{\(\) => navigate\("explore"\)\} \/>/);
});
