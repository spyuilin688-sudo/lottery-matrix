function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ");
}

function splitSelectorGroup(group) {
  const selectors = [];
  let start = 0;
  let quote = "";
  let parentheses = 0;
  let brackets = 0;

  for (let index = 0; index < group.length; index += 1) {
    const character = group[index];

    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }

    if (character === '"' || character === "'") quote = character;
    else if (character === "(") parentheses += 1;
    else if (character === ")") parentheses = Math.max(0, parentheses - 1);
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets = Math.max(0, brackets - 1);
    else if (character === "," && parentheses === 0 && brackets === 0) {
      selectors.push(group.slice(start, index).trim());
      start = index + 1;
    }
  }

  selectors.push(group.slice(start).trim());
  return selectors.filter(Boolean);
}

function findBlockEnd(source, open, limit) {
  let depth = 1;
  let quote = "";
  let comment = false;

  for (let index = open + 1; index < limit; index += 1) {
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
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function matches(pattern, selector) {
  pattern.lastIndex = 0;
  const matched = pattern.test(selector);
  pattern.lastIndex = 0;
  return matched;
}

export function ruleBodies(source, selectorPattern) {
  if (!(selectorPattern instanceof RegExp)) {
    throw new TypeError("selectorPattern must be a RegExp");
  }

  const bodies = [];

  function visit(start, limit) {
    let preludeStart = start;
    let quote = "";
    let comment = false;
    let parentheses = 0;
    let brackets = 0;

    for (let index = start; index < limit; index += 1) {
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
        parentheses = Math.max(0, parentheses - 1);
      } else if (character === "[") {
        brackets += 1;
      } else if (character === "]") {
        brackets = Math.max(0, brackets - 1);
      } else if (parentheses === 0 && brackets === 0 && character === ";") {
        preludeStart = index + 1;
      } else if (parentheses === 0 && brackets === 0 && character === "{") {
        const close = findBlockEnd(source, index, limit);
        if (close < 0) return;

        const prelude = stripComments(source.slice(preludeStart, index)).trim();
        const body = source.slice(index + 1, close);

        if (prelude.startsWith("@")) {
          visit(index + 1, close);
        } else if (splitSelectorGroup(prelude).some((selector) => matches(selectorPattern, selector))) {
          bodies.push(body);
        }

        index = close;
        preludeStart = close + 1;
      }
    }
  }

  visit(0, source.length);
  return bodies;
}
