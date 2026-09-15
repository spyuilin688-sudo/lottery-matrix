// @vitest-environment node
// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

function source(path: string) {
  return readFileSync(`${process.cwd()}/${path}`, "utf8");
}

describe("Profile Google login ownership", () => {
  it("keeps Google login inside the React profile instead of DOM mutation injection", () => {
    const memberPages = source("src/features/MemberPages.tsx");
    const main = source("src/main.tsx");

    expect(memberPages).toContain('from "../auth/google-auth"');
    expect(memberPages).toContain("Google 登入");
    expect(memberPages).toContain("profile-auth-actions");
    expect(main).not.toContain("installGoogleLoginEntry");
    expect(existsSync(`${process.cwd()}/src/auth/google-auth-entry.ts`)).toBe(false);
  });
});
