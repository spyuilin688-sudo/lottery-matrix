import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("手機 Runtime 不顯示虛擬手機外框與模擬介面", async () => {
  const frameSource = await readFile(new URL("../src/mobile/PhoneFrame.tsx", import.meta.url), "utf8");
  const runtimeSource = await readFile(new URL("../src/mobile/MobileRuntime.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(frameSource, /DevicePicker/);
  assert.doesNotMatch(frameSource, /phone-bezel/);
  assert.doesNotMatch(frameSource, /phone-scale-box/);
  assert.doesNotMatch(frameSource, /device-camera/);
  assert.doesNotMatch(frameSource, /useMobileCursor/);
  assert.match(frameSource, /className="device-screen"/);
  assert.match(frameSource, /ScreenPortalContext\.Provider/);

  assert.doesNotMatch(runtimeSource, /StatusBar/);
  assert.doesNotMatch(runtimeSource, /HomeIndicator/);
  assert.doesNotMatch(runtimeSource, /KeyboardDock/);
  assert.doesNotMatch(runtimeSource, /KeyboardPreview/);
  assert.match(runtimeSource, /MobileDeviceProvider/);
  assert.match(runtimeSource, /KeyboardProvider/);
  assert.match(runtimeSource, /MobileAppViewport/);
});
