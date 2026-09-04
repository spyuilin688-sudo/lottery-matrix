import { test } from "vitest";

Object.assign(globalThis, {
  Deno: {
    test,
  },
});
