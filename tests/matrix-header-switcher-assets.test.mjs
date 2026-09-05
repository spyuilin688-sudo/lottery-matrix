import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = readFeaturePagesSource();
const spacingCss = readFileSync("src/matrix-explore-spacing.css", "utf8");

const frameFreeAssets = [
  { original: "Matrix探索.png", cleaned: "Matrix探索-icon.png" },
  { original: "Matrix天衍.png", cleaned: "Matrix天衍-icon.png" },
  { original: "Matrix天工.png", cleaned: "Matrix天工-icon.png" },
];

function pngDimensions(path) {
  const png = readFileSync(path);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test("Matrix header switcher keeps frame-free artwork at its original scale without an outer frame", () => {
  for (const { original, cleaned } of frameFreeAssets) {
    const assetDir = "public/assets/lottery/functions";
    assert.equal(source.includes(`/assets/lottery/functions/${cleaned}`), true);
    assert.equal(existsSync(`${assetDir}/${original}`), true);
    assert.equal(existsSync(`${assetDir}/${cleaned}`), true);

    const originalDimensions = pngDimensions(`${assetDir}/${original}`);
    const cleanedDimensions = pngDimensions(`${assetDir}/${cleaned}`);
    assert.ok(cleanedDimensions.width < originalDimensions.width);
    assert.ok(cleanedDimensions.height < originalDimensions.height);
  }

  assert.match(
    spacingCss,
    /\.matrix-explore-main-screen \.matrix-title-banner-actions \.matrix-page-switcher button::before,[\s\S]*?button::after\s*\{[^}]*display:\s*none;/s,
  );
  assert.match(
    spacingCss,
    /\.matrix-explore-main-screen \.matrix-title-banner-actions \.matrix-page-switcher img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*max-width:\s*100%;[^}]*object-fit:\s*contain;[^}]*object-position:\s*center;[^}]*clip-path:\s*inset\(0 0 4% 0\);/s,
  );
  assert.doesNotMatch(spacingCss, /--matrix-switcher-artwork-size|160%|object-fit:\s*cover/);
});
