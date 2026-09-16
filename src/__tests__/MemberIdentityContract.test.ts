// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const root = process.cwd();
const memberApiPath = `${root}/src/member-api.ts`;
const memberPagesPath = `${root}/src/features/MemberPages.tsx`;
const migrationPath = `${root}/supabase/migrations/20260916103000_member_profile_member_id.sql`;

describe("member identity contract", () => {
  it("returns the stable Matrix member ID from the member profile RPC contract", () => {
    const memberApi = readFileSync(memberApiPath, "utf8");
    expect(memberApi).toMatch(/export type MemberProfileResponse = \{\s*memberId: string;/);
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("'memberId', member.id");
  });

  it("shows member ID on the existing profile identity line instead of LINE identity or nickname", () => {
    const memberPages = readFileSync(memberPagesPath, "utf8");
    expect(memberPages).toContain('>會員ID：{memberProfile?.memberId ?? ""}</p>');
    expect(memberPages).not.toContain('>會員名稱：{lineNickname ?? ""}</p>');
    expect(memberPages).not.toMatch(/>LINE ID：/);
  });
});
