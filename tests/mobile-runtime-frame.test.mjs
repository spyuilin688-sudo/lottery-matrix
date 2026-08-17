import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("手機 Runtime 不顯示虛擬手機外框", async () => {
  const source = await readFile(new URL("../src/mobile/PhoneFrame.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /DevicePicker/);
  assert.doesNotMatch(source, /phone-bezel/);
  assert.doesNotMatch(source, /phone-scale-box/);
  assert.doesNotMatch(source, /device-camera/);
  assert.doesNotMatch(source, /useMobileCursor/);
  assert.match(source, /className="device-screen"/);
  assert.match(source, /ScreenPortalContext\.Provider/);
});
