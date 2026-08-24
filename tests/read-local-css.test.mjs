import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { readLocalCss } from "./helpers/read-local-css.mjs";

function fixtureDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), "read-local-css-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("recursively resolves local CSS imports in cascade order from a file URL", (t) => {
  const directory = fixtureDirectory(t);
  const nestedDirectory = join(directory, "nested");
  mkdirSync(nestedDirectory);

  writeFileSync(join(directory, "colors.css"), ".colors { color: rebeccapurple; }\n");
  writeFileSync(
    join(nestedDirectory, "base.css"),
    "@import '../colors.css';\n.base { color: var(--base); }\n",
  );
  writeFileSync(
    join(directory, "entry.css"),
    '@import url("nested/base.css") screen and (min-width: 1px);\n.entry { color: var(--entry); }\n',
  );

  const css = readLocalCss(pathToFileURL(join(directory, "entry.css")));

  const colors = css.indexOf(".colors");
  const base = css.indexOf(".base");
  const entry = css.indexOf(".entry");
  assert.ok(colors >= 0 && colors < base && base < entry);
  assert.match(css, /screen and \(min-width: 1px\)/);
});

test("preserves remote, data, and root imports without fetching them", (t) => {
  const directory = fixtureDirectory(t);
  const source = [
    '@import "https://cdn.example.com/theme.css";',
    "@import url('data:text/css,.remote%7Bcolor%3Ared%7D');",
    '@import "data:text/css,/* literal string content */";',
    '@import "/assets/root.css" print;',
    ".entry { display: block; }",
  ].join("\n");
  const entry = join(directory, "entry.css");
  writeFileSync(entry, source);

  assert.equal(readLocalCss(entry), source);
});

test("ignores import-like text in comments, strings, and declaration blocks", (t) => {
  const directory = fixtureDirectory(t);
  writeFileSync(join(directory, "real.css"), ".real { color: green; }\n");
  const source = [
    '/* @import "missing-comment.css"; */',
    '@import "real.css";',
    ".example {",
    "  content: \"@import 'missing-string.css';\";",
    '  --snippet: @import "missing-custom-property.css";',
    "}",
  ].join("\n");
  const entry = join(directory, "entry.css");
  writeFileSync(entry, source);

  const css = readLocalCss(entry);

  assert.match(css, /\/\* @import "missing-comment\.css"; \*\//);
  assert.match(css, /content: "@import 'missing-string\.css';";/);
  assert.match(css, /--snippet: @import "missing-custom-property\.css";/);
  assert.match(css, /\.real \{ color: green; \}/);
});

test("preserves layer, supports, and media qualifier semantics", (t) => {
  const directory = fixtureDirectory(t);
  writeFileSync(join(directory, "theme.css"), ".theme { display: grid; }\n");
  writeFileSync(join(directory, "anonymous.css"), ".anonymous { display: grid; }\n");
  const entry = join(directory, "entry.css");
  writeFileSync(entry, [
    '@import "theme.css" layer(theme.base) supports(selector(:has(.grid:is(.wide, .dense)))) screen and (min-width: 40rem);',
    "@import url('anonymous.css') layer supports(display: grid);",
  ].join("\n"));

  const css = readLocalCss(entry);

  assert.equal(
    css.replace(/\s+/g, " ").trim(),
    "@layer theme.base { @supports selector(:has(.grid:is(.wide, .dense))) { @media screen and (min-width: 40rem) { .theme { display: grid; } } } } @layer { @supports (display: grid) { .anonymous { display: grid; } } }",
  );
});

test("treats comments as whitespace throughout active imports", (t) => {
  const directory = fixtureDirectory(t);
  for (const name of ["leading", "adjacent", "suffix", "qualified"]) {
    writeFileSync(join(directory, `${name}.css`), `.${name} { display: grid; }\n`);
  }
  const entry = join(directory, "entry.css");
  writeFileSync(entry, [
    '@import /* rationale */ "leading.css";',
    '@import/**/"adjacent.css";',
    '@import "suffix.css" /* rationale */;',
    '@import "qualified.css" layer(theme) /* rationale */ supports(display: grid);',
  ].join("\n"));

  const css = readLocalCss(entry);

  assert.equal(
    css.replace(/\s+/g, " ").trim(),
    ".leading { display: grid; } .adjacent { display: grid; } .suffix { display: grid; } @layer theme { @supports (display: grid) { .qualified { display: grid; } } }",
  );
});

test("resolves a not-condition media import", (t) => {
  const directory = fixtureDirectory(t);
  writeFileSync(join(directory, "theme.css"), ".theme { color: CanvasText; }\n");
  const entry = join(directory, "entry.css");
  writeFileSync(entry, '@import "theme.css" not (color);\n');

  assert.equal(
    readLocalCss(entry).replace(/\s+/g, " ").trim(),
    "@media not (color) { .theme { color: CanvasText; } }",
  );
});

test("preserves a local import with an unsupported qualifier", (t) => {
  const directory = fixtureDirectory(t);
  writeFileSync(join(directory, "theme.css"), ".theme { display: grid; }\n");
  const source = '@import "theme.css" layer(theme) scope(.card);\n';
  const entry = join(directory, "entry.css");
  writeFileSync(entry, source);

  assert.equal(readLocalCss(entry), source);
});

test("reports local import cycles with CSS_IMPORT_CYCLE", (t) => {
  const directory = fixtureDirectory(t);
  writeFileSync(join(directory, "a.css"), '@import "b.css";\n.a {}\n');
  writeFileSync(join(directory, "b.css"), '@import "a.css";\n.b {}\n');

  assert.throws(
    () => readLocalCss(join(directory, "a.css")),
    (error) => error instanceof Error
      && error.message.includes("CSS_IMPORT_CYCLE")
      && error.code === "CSS_IMPORT_CYCLE",
  );
});
