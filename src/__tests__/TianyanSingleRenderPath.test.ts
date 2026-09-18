import { describe, expect, it } from "vitest";
import routerSource from "../FeaturePagesPatched.tsx?raw";
import validationSource from "../features/MatrixValidation.tsx?raw";
import layoutSource from "../TianyanExpandedValidation.tsx?raw";

describe("Tianyan single render path", () => {
  it("does not mount the legacy DOM/portal patch beside the canonical feature router", () => {
    expect(routerSource).not.toContain("TianyanExpandedLayoutPatch");
  });

  it("renders expanded Tianyan validation from the canonical validation component", () => {
    expect(validationSource).toContain("TianyanExpandedValidationGroups");
  });

  it("keeps the canonical expanded renderer free of DOM observers, portals and duplicate Tianyan API reads", () => {
    expect(layoutSource).not.toContain("MutationObserver");
    expect(layoutSource).not.toContain("createPortal");
    expect(layoutSource).not.toContain("fetchTianyanList");
    expect(layoutSource).not.toContain("fetchTianyanValidation");
  });
});
