import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const NON_LOCAL_REQUEST = /^(?:[a-z][a-z\d+.-]*:|\/)/i;
const URL_IMPORT = /^@import\s+url\(\s*(["'])([^"']+)\1\s*\)\s*([\s\S]*);$/i;
const STRING_IMPORT = /^@import\s+(["'])([^"']+)\1\s*([\s\S]*);$/i;

function commentsAsWhitespace(source) {
  let result = "";
  let quote = "";

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (quote) {
      result += character;
      if (character === "\\" && next !== undefined) {
        result += next;
        index += 1;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      result += character;
    } else if (character === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      if (end < 0) return null;
      result += " ";
      index = end + 1;
    } else {
      result += character;
    }
  }

  return result;
}

function findStatementEnd(source, start) {
  let quote = "";
  let comment = false;
  let parentheses = 0;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (comment) {
      if (character === "*" && next === "/") {
        comment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }

    if (character === "/" && next === "*") {
      comment = true;
      index += 1;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "(") {
      parentheses += 1;
    } else if (character === ")") {
      if (parentheses === 0) return -1;
      parentheses -= 1;
    } else if (character === ";" && parentheses === 0) {
      return index;
    } else if (character === "{" && parentheses === 0) {
      return -1;
    }
  }

  return -1;
}

function consumeFunction(source, name) {
  const match = new RegExp(`^${name}\\(`, "i").exec(source);
  if (!match) return null;

  let quote = "";
  let comment = false;
  let depth = 0;
  const open = match[0].length - 1;

  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (comment) {
      if (character === "*" && next === "/") {
        comment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }

    if (character === "/" && next === "*") {
      comment = true;
      index += 1;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return {
          value: source.slice(open + 1, index).trim(),
          rest: source.slice(index + 1).trimStart(),
        };
      }
    }
  }

  return null;
}

function parseQualifiers(source) {
  let rest = source.trim();
  let layer;
  let supports;

  if (/^layer\(/i.test(rest)) {
    const parsed = consumeFunction(rest, "layer");
    if (!parsed || !/^[-_a-z][-_a-z\d]*(?:\.[-_a-z][-_a-z\d]*)*$/i.test(parsed.value)) {
      return null;
    }
    layer = parsed.value;
    rest = parsed.rest;
  } else if (/^layer(?=\s|$)/i.test(rest)) {
    layer = "";
    rest = rest.slice(5).trimStart();
  }

  if (/^supports\(/i.test(rest)) {
    const parsed = consumeFunction(rest, "supports");
    if (!parsed?.value) return null;
    supports = parsed.value;
    rest = parsed.rest;
  }

  if (/^(?:layer|supports)(?:\s|\()/i.test(rest)) return null;
  if (/^[a-z_-][-_a-z\d]*\(/i.test(rest)) return null;

  return { layer, supports, media: rest };
}

function supportsPrelude(condition) {
  if (/^(?:\(|not\b|[a-z-]+\s*\()/i.test(condition)) return condition;
  return `(${condition})`;
}

function wrapImportedCss(imported, qualifiers) {
  let result = imported;

  if (qualifiers.media) {
    result = `@media ${qualifiers.media} {\n${result}\n}`;
  }
  if (qualifiers.supports !== undefined) {
    result = `@supports ${supportsPrelude(qualifiers.supports)} {\n${result}\n}`;
  }
  if (qualifiers.layer !== undefined) {
    const name = qualifiers.layer ? ` ${qualifiers.layer}` : "";
    result = `@layer${name} {\n${result}\n}`;
  }

  return result;
}

function parseImport(statement) {
  const normalized = commentsAsWhitespace(statement);
  if (normalized === null) return null;
  const match = URL_IMPORT.exec(normalized) ?? STRING_IMPORT.exec(normalized);
  if (!match) return null;
  return { request: match[2], suffix: match[3] };
}

function replaceTopLevelImports(source, absolute, stack) {
  let blockDepth = 0;
  let canStartStatement = true;
  let comment = false;
  let quote = "";
  let cursor = 0;
  let result = "";

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (comment) {
      if (character === "*" && next === "/") {
        comment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }

    if (character === "/" && next === "*") {
      comment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      if (blockDepth === 0) canStartStatement = false;
      continue;
    }
    if (character === "{") {
      blockDepth += 1;
      canStartStatement = false;
      continue;
    }
    if (character === "}") {
      blockDepth = Math.max(0, blockDepth - 1);
      if (blockDepth === 0) canStartStatement = true;
      continue;
    }

    const isImport = blockDepth === 0
      && canStartStatement
      && source.slice(index, index + 7).toLowerCase() === "@import"
      && (/\s/.test(source[index + 7] ?? "")
        || source.slice(index + 7, index + 9) === "/*");

    if (isImport) {
      const end = findStatementEnd(source, index + 7);
      if (end >= 0) {
        const statement = source.slice(index, end + 1);
        const parsed = parseImport(statement);
        let replacement = statement;

        if (parsed && !NON_LOCAL_REQUEST.test(parsed.request)) {
          const qualifiers = parseQualifiers(parsed.suffix);
          if (qualifiers) {
            const imported = readLocalCss(
              resolve(dirname(absolute), parsed.request),
              stack,
            );
            replacement = wrapImportedCss(imported, qualifiers);
          }
        }

        result += source.slice(cursor, index) + replacement;
        cursor = end + 1;
        index = end;
        canStartStatement = true;
        continue;
      }
    }

    if (blockDepth === 0) {
      if (character === ";") canStartStatement = true;
      else if (!/\s/.test(character)) canStartStatement = false;
    }
  }

  return result + source.slice(cursor);
}

export function readLocalCss(entry, stack = []) {
  const absolute = entry instanceof URL ? fileURLToPath(entry) : resolve(entry);

  if (stack.includes(absolute)) {
    const error = new Error(`CSS_IMPORT_CYCLE:${absolute}`);
    error.code = "CSS_IMPORT_CYCLE";
    throw error;
  }

  const source = readFileSync(absolute, "utf8");
  return replaceTopLevelImports(source, absolute, [...stack, absolute]);
}
