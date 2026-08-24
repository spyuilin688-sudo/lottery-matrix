// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import {
  isIdentifier,
  isJsxAttribute,
  isJsxOpeningElement,
  isJsxSelfClosingElement,
  isNoSubstitutionTemplateLiteral,
  isStringLiteral,
  isTemplateHead,
  isTemplateMiddle,
  isTemplateTail,
  type JsxAttribute,
  type Node,
} from "typescript/unstable/ast";
import { API } from "typescript/unstable/sync";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error Test helper is intentionally implemented as an untyped Node ESM module.
import { ruleBodies } from "../../tests/helpers/css-rules.mjs";
import { MobileDeviceProvider } from "../mobile/Device";
import { KeyboardProvider, KeyboardTextarea } from "../mobile/Keyboard";

declare const process: { cwd(): string };

const projectRoot = process.cwd();
const stylesCss = readFileSync(`${projectRoot}/src/styles.css`, "utf8");
const featureCss = readFileSync(`${projectRoot}/src/feature-pages.css`, "utf8");
const designTokensCss = readFileSync(`${projectRoot}/src/design-tokens.css`, "utf8");

function mountStyle(css: string) {
  const style = document.createElement("style");
  style.dataset.task9Style = "true";
  style.textContent = css;
  document.head.append(style);
  return style;
}

function literalClassTokens(initializer: Node | undefined) {
  const tokens: string[] = [];
  const visit = (node: Node) => {
    if (
      isStringLiteral(node)
      || isNoSubstitutionTemplateLiteral(node)
      || isTemplateHead(node)
      || isTemplateMiddle(node)
      || isTemplateTail(node)
    ) {
      tokens.push(...node.text.split(/\s+/).filter(Boolean));
    }
    node.forEachChild(visit);
  };

  if (initializer) visit(initializer);
  return tokens;
}

function productTextareas() {
  const api = new API({ cwd: projectRoot });

  try {
    const snapshot = api.updateSnapshot({ openProjects: [`${projectRoot}/tsconfig.json`] });
    const project = snapshot.getProjects().find(
      (candidate) => candidate.configFileName === `${projectRoot}/tsconfig.json`,
    );
    if (!project) throw new Error("Task 9 could not load the frontend TypeScript project");

    return project.program.getSourceFileNames()
      .filter(
        (file) =>
          file.startsWith(`${projectRoot}/src/`)
          && file.endsWith(".tsx")
          && !file.includes("/__tests__/")
          && !file.includes(".test."),
      )
      .flatMap((file) => {
        const syntax = project.program.getSourceFile(file);
        if (!syntax) throw new Error(`Task 9 could not parse ${file}`);
        const textareas: Array<{ file: string; line: number; classTokens: string[] }> = [];

        const visit = (node: Node) => {
          if (
            (isJsxSelfClosingElement(node) || isJsxOpeningElement(node))
            && isIdentifier(node.tagName)
            && node.tagName.text === "textarea"
          ) {
            const className = node.attributes.properties.find(
              (property): property is JsxAttribute =>
                isJsxAttribute(property)
                && isIdentifier(property.name)
                && property.name.text === "className",
            );
            textareas.push({
              file: file.slice(projectRoot.length + 1),
              line: syntax.getLineAndCharacterOfPosition(node.getStart(syntax)).line + 1,
              classTokens: literalClassTokens(className?.initializer),
            });
          }
          node.forEachChild(visit);
        };

        syntax.forEachChild(visit);
        return textareas;
      });
  } finally {
    api.close();
  }
}

function exactRule(source: string, selector: RegExp) {
  const bodies = ruleBodies(source, selector);
  expect(bodies).toHaveLength(1);
  return bodies[0] as string;
}

function cssRule(rules: CSSRuleList, selector: string) {
  const rule = Array.from(rules).find(
    (candidate): candidate is CSSStyleRule =>
      "selectorText" in candidate && candidate.selectorText === selector,
  );
  expect(rule, `missing CSS rule ${selector}`).toBeDefined();
  return rule!;
}

afterEach(() => {
  cleanup();
  document.querySelectorAll("[data-task9-style]").forEach((element) => element.remove());
  document.body.replaceChildren();
});

describe("textarea and scrollbar ownership", () => {
  it("gives every product textarea a literal resize-none class owner", () => {
    const textareas = productTextareas();
    expect(textareas.length).toBeGreaterThan(0);

    expect(
      textareas
        .filter(({ classTokens }) => !classTokens.some((token) => token.includes("resize-none")))
        .map(({ file, line }) => `${file}:${line}`),
    ).toEqual([]);
  });

  it("merges the KeyboardTextarea caller class and preserves caller geometry", () => {
    mountStyle(stylesCss);
    render(
      createElement(
        MobileDeviceProvider,
        null,
        createElement(
          KeyboardProvider,
          null,
          createElement(KeyboardTextarea, {
            "aria-label": "測試筆記",
            className: "caller-textarea",
            style: { height: "91px", minHeight: "73px" },
          }),
        ),
      ),
    );

    const textarea = screen.getByLabelText("測試筆記");
    expect(textarea).toHaveClass("caller-textarea", "mobile-textarea-resize-none");
    expect(getComputedStyle(textarea).resize).toBe("none");
    expect(getComputedStyle(textarea).height).toBe("91px");
    expect(getComputedStyle(textarea).minHeight).toBe("73px");
  });

  it("keeps notebook and record textarea dimensions while disabling resize", () => {
    const notebookRule = exactRule(featureCss, /^\.matrix-notebook-editor > textarea$/);
    const recordRule = exactRule(featureCss, /^\.record-form-section > textarea$/);
    const resizeRules = ruleBodies(featureCss, /^\.resize-none$/) as string[];
    mountStyle(`
      .matrix-notebook-editor > textarea { ${notebookRule} }
      .record-form-section > textarea { ${recordRule} }
      ${resizeRules.map((body) => `.resize-none { ${body} }`).join("\n")}
    `);

    const notebook = document.createElement("section");
    notebook.className = "matrix-notebook-editor";
    const notebookTextarea = document.createElement("textarea");
    notebookTextarea.className = "resize-none";
    notebook.append(notebookTextarea);

    const record = document.createElement("section");
    record.className = "record-form-section";
    const recordTextarea = document.createElement("textarea");
    recordTextarea.className = "resize-none";
    record.append(recordTextarea);
    document.body.append(notebook, record);

    expect(getComputedStyle(notebookTextarea).minHeight).toBe("330px");
    expect(getComputedStyle(notebookTextarea).resize).toBe("none");
    expect(getComputedStyle(recordTextarea).minHeight).toBe("70px");
    expect(getComputedStyle(recordTextarea).resize).toBe("none");
    expect(exactRule(featureCss, /^\.resize-none$/)).toMatch(/\bresize:\s*none;/);
    expect(featureCss).not.toMatch(/\bresize:\s*vertical;/);
  });

  it("provides root and inherited standards values plus complete engine fallbacks", () => {
    const style = mountStyle(`${designTokensCss}\n${stylesCss}`);
    const overflow = document.createElement("div");
    overflow.style.cssText = "width: 10px; height: 10px; overflow: auto";
    overflow.append(Object.assign(document.createElement("div"), { textContent: "long content" }));
    document.body.append(overflow);

    const expectedColors = "var(--bottom-nav-gold) var(--bottom-nav-panel-950)";
    expect(getComputedStyle(document.documentElement).getPropertyValue("scrollbar-color")).toBe(
      expectedColors,
    );
    expect(getComputedStyle(document.documentElement).getPropertyValue("scrollbar-width")).toBe("thin");
    expect(getComputedStyle(overflow).getPropertyValue("scrollbar-color")).toBe(expectedColors);
    expect(getComputedStyle(overflow).getPropertyValue("scrollbar-width")).toBe("thin");

    const sheet = style.sheet!;
    const scrollbar = cssRule(sheet.cssRules, "*::-webkit-scrollbar");
    expect(scrollbar.style.width).toBe("8px");
    expect(scrollbar.style.height).toBe("8px");

    const track = cssRule(sheet.cssRules, "*::-webkit-scrollbar-track");
    expect(track.style.background).toBe("var(--bottom-nav-panel-950)");

    const thumb = cssRule(sheet.cssRules, "*::-webkit-scrollbar-thumb");
    expect(thumb.style.border).toBe("2px solid var(--bottom-nav-panel-950)");
    expect(thumb.style.borderRadius).toBe("999px");
    expect(thumb.style.background).toBe("var(--bottom-nav-gold)");
    expect(cssRule(sheet.cssRules, "*::-webkit-scrollbar-thumb:hover").style.background).toBe(
      "var(--bottom-nav-gold-bright)",
    );
    expect(cssRule(sheet.cssRules, "*::-webkit-scrollbar-thumb:active").style.background).toBe(
      "var(--lottery-gold-300)",
    );

    const forcedColors = Array.from(sheet.cssRules).find(
      (rule): rule is CSSMediaRule =>
        "conditionText" in rule && rule.conditionText === "(forced-colors: active)",
    );
    expect(forcedColors).toBeDefined();
    expect(
      cssRule(forcedColors!.cssRules, ":root").style.getPropertyValue("scrollbar-color"),
    ).toBe("auto");
    expect(cssRule(forcedColors!.cssRules, "*::-webkit-scrollbar-track").style.background).toBe(
      "canvas",
    );
    const forcedThumb = cssRule(forcedColors!.cssRules, "*::-webkit-scrollbar-thumb");
    expect(forcedThumb.style.borderColor).toBe("canvas");
    expect(forcedThumb.style.background).toBe("buttontext");
  });

  it("keeps reachable scrolling behavior without hidden native scrollbars", () => {
    const mobileCarousel = ruleBodies(stylesCss, /^\.mobile-carousel$/).join("\n");
    expect(mobileCarousel).toMatch(/\boverflow-x:\s*auto;/);
    expect(mobileCarousel).toMatch(/\boverscroll-behavior:\s*contain;/);
    expect(mobileCarousel).toMatch(/\btouch-action:\s*pan-y;/);
    expect(mobileCarousel).not.toMatch(/\bscrollbar-width:\s*none;/);
    expect(ruleBodies(stylesCss, /^\.mobile-carousel::-webkit-scrollbar$/)).toHaveLength(0);

    const mobileScroll = exactRule(stylesCss, /^\.mobile-scroll$/);
    expect(mobileScroll).toMatch(/\boverflow-y:\s*auto;/);
    expect(mobileScroll).toMatch(/(?:^|\s)-webkit-overflow-scrolling:\s*touch;/);
    expect(mobileScroll).toMatch(/\boverscroll-behavior:\s*contain;/);
    expect(mobileScroll).not.toMatch(/\bscrollbar-width:\s*none;/);
    expect(ruleBodies(stylesCss, /^\.mobile-scroll::-webkit-scrollbar$/)).toHaveLength(0);

    const planCarousel = exactRule(featureCss, /^\.plan-carousel$/);
    expect(planCarousel).toMatch(/\boverflow-x:\s*auto;/);
    expect(planCarousel).toMatch(/\bscroll-snap-type:\s*x mandatory;/);
    expect(planCarousel).not.toMatch(/\bscrollbar-width:\s*none;/);
    expect(ruleBodies(featureCss, /^\.plan-carousel::-webkit-scrollbar$/)).toHaveLength(0);
  });
});
