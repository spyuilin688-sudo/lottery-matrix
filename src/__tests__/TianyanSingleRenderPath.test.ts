import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("Tianyan single render path", () => {
  it("does not mount the legacy DOM/portal patch beside the canonical feature router", () => {
    const router = source("../FeaturePagesPatched.tsx");
    expect(router).not.toContain("TianyanExpandedLayoutPatch");
  });

  it("renders expanded Tianyan validation from the canonical validation component", () => {
    const validation = source("../features/MatrixValidation.tsx");
    expect(validation).toContain("TianyanExpandedValidationGroups");
    expect(validation).toContain("numberOrder={item.numberOrder}");
  });

  it("keeps the canonical expanded renderer free of DOM observers, portals and duplicate Tianyan API reads", () => {
    const layout = source("../TianyanExpandedValidation.tsx");
    expect(layout).not.toContain("MutationObserver");
    expect(layout).not.toContain("createPortal");
    expect(layout).not.toContain("fetchTianyanList");
    expect(layout).not.toContain("fetchTianyanValidation");
  });
});
