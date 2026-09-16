// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const root = process.cwd();
const adminData = readFileSync(`${root}/apps/admin/backend/admin-data.ts`, "utf8");
const adminApp = readFileSync(`${root}/apps/admin/src/AdminApp.tsx`, "utf8");
const userInfo = readFileSync(`${root}/apps/admin/src/UserInfoDialog.tsx`, "utf8");

describe("admin member ID contract", () => {
  it("maps and searches members by the stable members.id", () => {
    expect((adminData.match(/memberId: String\(row\.id\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(adminData).toContain("memberId: 'id'");
    expect((adminData.match(/identifiers: \['id', 'auth_user_id'\]/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("uses member ID as the primary member identifier in admin UI", () => {
    expect(adminApp).toContain('const fields = ["memberId", "registeredAt"');
    expect(adminApp).toContain('<th>會員ID</th><th>訂閱方案</th>');
    expect(adminApp).toContain('<td>{text(row.memberId)}</td><td>{text(row.planName)}</td>');
    expect(adminApp).toContain('<div><b>{text(row.memberId)}</b><span>');
    expect(adminApp).toContain('redeemedByMemberId: "兌換會員ID"');
  });

  it("shows member ID, not provider-specific IDs, in the user info dialog", () => {
    expect(userInfo).toContain("['會員ID', value(row.memberId ?? row.id)]");
    expect(userInfo).not.toContain("['驗證用戶ID'");
    expect(userInfo).not.toContain("['LINE ID'");
  });
});
