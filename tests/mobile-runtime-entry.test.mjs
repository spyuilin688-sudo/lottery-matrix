import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("正式網站入口不套用手機模擬外框", async () => {
  const source = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /MobileRuntime/);
  assert.match(source, /import \{ MobileDeviceProvider \} from "\.\/mobile\/Device";/);
  assert.match(source, /import \{ KeyboardProvider \} from "\.\/mobile\/Keyboard";/);
  assert.match(
    source,
    /<MobileDeviceProvider>[\s\S]*<KeyboardProvider>[\s\S]*<Prototype \/>[\s\S]*<\/KeyboardProvider>[\s\S]*<\/MobileDeviceProvider>/,
  );
});
