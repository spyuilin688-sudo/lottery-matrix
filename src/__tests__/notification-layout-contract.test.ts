// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routerSource = readFileSync(new URL("../FeaturePagesPatched.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../feature-page-adjustments.css", import.meta.url), "utf8");

describe("notification production layout contract", () => {
  it("uses the existing Bottom Sheet notification flow instead of the inline patched page", () => {
    expect(routerSource).not.toContain("NotificationsPagePatched");
    expect(routerSource).toContain('import "./feature-page-adjustments.css"');
  });

  it("keeps the requested main-list proportions", () => {
    expect(css).toMatch(/\.notifications-screen \.feature-body\s*\{[^}]*padding:\s*0 16px calc\(var\(--layout-bottom-nav-clearance\) \+ 12px\);/s);
    expect(css).toMatch(/\.notifications-screen \.notification-heading\s*\{[^}]*grid-template-columns:\s*56px minmax\(0, 1fr\) auto 46px;[^}]*column-gap:\s*8px;/s);
    expect(css).toMatch(/\.notifications-screen \.notification-row\s*\{[^}]*min-height:\s*68px;/s);
    expect(css).toMatch(/\.notifications-screen \.notification-row:has\(h2 em\)\s*\{[^}]*min-height:\s*76px;/s);
  });

  it("keeps the current switch dimensions unchanged", () => {
    expect(css).toMatch(/\.notifications-screen \.toggle\s*\{[^}]*width:\s*46px;[^}]*height:\s*44px;/s);
    expect(css).toMatch(/\.notifications-screen \.toggle::before\s*\{[^}]*width:\s*46px;[^}]*height:\s*28px;/s);
    expect(css).toMatch(/\.notifications-screen \.toggle span\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/s);
  });

  it("applies the requested Bottom Sheet dimensions", () => {
    expect(css).toMatch(/\.notification-modal\s*\{[^}]*max-height:\s*min\(76vh, 600px\);/s);
    expect(css).toMatch(/\.notification-modal-content\s*\{[^}]*padding:\s*12px 14px 6px;/s);
    expect(css).toMatch(/\.notification-modal \.notification-options\s*\{[^}]*gap:\s*8px;/s);
    expect(css).toMatch(/\.notification-modal \.notification-time-settings\s*\{[^}]*gap:\s*10px;/s);
    expect(css).toMatch(/\.notification-status-settings \.notification-lottery-row\s*\{[^}]*grid-template-columns:\s*56px minmax\(0, 1fr\);/s);
  });
});
