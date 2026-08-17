import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

const featureCss = fs.readFileSync('src/feature-pages.css', 'utf8');
const runtimeCss = fs.readFileSync('src/styles.css', 'utf8');
const prototypeCss = fs.readFileSync('src/prototype.css', 'utf8');
const featureTsx = fs.readFileSync('src/FeaturePages.tsx', 'utf8');

const iconPaths = [
  'public/resources/notify-bet.png',
  'public/resources/notify-result.png',
  'public/resources/notify-win.png',
  'public/resources/notify-status.png',
  'public/resources/notify-card.png',
  'public/resources/notify-collision.png',
  'public/resources/notify-expiry.png',
  'public/resources/notify-system.png',
];

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function readPngAlphaBounds(path) {
  const png = fs.readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${path} must be a PNG`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (type === 'IHDR') {
      width = png.readUInt32BE(dataStart);
      height = png.readUInt32BE(dataStart + 4);
      bitDepth = png[dataStart + 8];
      colorType = png[dataStart + 9];
    } else if (type === 'IDAT') {
      idat.push(png.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }
  assert.equal(bitDepth, 8, `${path} must use 8-bit PNG channels`);
  assert.ok(colorType === 6 || colorType === 4, `${path} must retain alpha transparency`);
  const bpp = colorType === 6 ? 4 : 2;
  const alphaOffset = colorType === 6 ? 3 : 1;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  let rawOffset = 0;
  let previous = Buffer.alloc(stride);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset];
    rawOffset += 1;
    const scan = Buffer.from(raw.subarray(rawOffset, rawOffset + stride));
    rawOffset += stride;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= bpp ? scan[i - bpp] : 0;
      const up = previous[i];
      const upLeft = i >= bpp ? previous[i - bpp] : 0;
      if (filter === 1) scan[i] = (scan[i] + left) & 255;
      else if (filter === 2) scan[i] = (scan[i] + up) & 255;
      else if (filter === 3) scan[i] = (scan[i] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) scan[i] = (scan[i] + paeth(left, up, upLeft)) & 255;
      else assert.equal(filter, 0, `${path} uses an unsupported PNG filter`);
    }
    for (let x = 0; x < width; x += 1) {
      if (scan[(x * bpp) + alphaOffset] > 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    previous = scan;
  }
  assert.ok(maxX >= minX && maxY >= minY, `${path} must contain visible pixels`);
  return {
    path,
    width,
    height,
    minX,
    minY,
    maxX,
    maxY,
    visibleWidth: maxX - minX + 1,
    visibleHeight: maxY - minY + 1,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

test('notification page follows the uploaded 390px layout specification', () => {
  assert.match(featureCss, /\.notifications-screen \.feature-body \{ padding: 0 12px calc\(var\(--bottom-navigation-height\) \+ var\(--mobile-safe-area-height, 34px\) \+ 12px\); \}/);
  assert.match(featureCss, /\.notification-list \{ display: grid; gap: 8px; \}/);
  assert.match(featureCss, /\.notification-row \{[^}]*width: 100%;[^}]*height: 80px;[^}]*padding: 8px;/);
  assert.match(featureCss, /\.notification-heading \{[^}]*grid-template-columns: 58px minmax\(0, 1fr\) 88px 46px;[^}]*column-gap: 8px;/);
  assert.match(featureCss, /\.notification-icon \{[^}]*width: 58px;[^}]*height: 58px;/);
  assert.match(featureCss, /\.notification-icon img \{[^}]*width: 58px;[^}]*height: 58px;[^}]*object-fit: contain;/);
  assert.doesNotMatch(featureCss, /\.notification-icon \{[^}]*border:/);
  assert.doesNotMatch(featureCss, /\.notification-icon \{[^}]*box-shadow:/);
  assert.match(featureCss, /\.notification-actions \{ display: contents; \}/);
  assert.match(featureCss, /\.notification-actions > button:first-child \{[^}]*width: 88px;[^}]*height: 38px;[^}]*border-radius: 19px;[^}]*font-size: 14px;[^}]*font-weight: 600;/);
  assert.match(featureCss, /\.notification-row h2 \{[^}]*color: #F2F2F2;[^}]*font-size: 17px;[^}]*font-weight: 700;[^}]*line-height: 23px;[^}]*letter-spacing: 0;/);
  assert.match(featureCss, /\.notification-row h2 em \{[^}]*height: 22px;[^}]*padding: 0 8px;[^}]*border-radius: 7px;[^}]*font-size: 12px;[^}]*font-weight: 600;/);
  assert.match(featureCss, /\.notifications-screen \.notification-row \{[^}]*border-radius: 14px;[^}]*background: #020C12;/);
  assert.match(featureCss, /\.toggle \{[^}]*width: 46px;[^}]*height: 44px;/);
  assert.match(featureCss, /\.toggle::before \{[^}]*width: 46px;[^}]*height: 28px;[^}]*border: 1px solid #46505C;[^}]*border-radius: 14px;[^}]*background: #151B22;/);
  assert.match(featureCss, /\.toggle span \{[^}]*width: 24px;[^}]*height: 24px;/);
  assert.match(featureCss, /\.toggle\[data-checked="true"\]::before \{[^}]*background: #D99B00;/);
  assert.match(featureCss, /\.toggle\[data-checked="true"\] span \{[^}]*translateX\(18px\)/);
  assert.doesNotMatch(featureCss, /@media \(max-width: 370px\) \{\s*\.notification-heading/);
  assert.doesNotMatch(featureCss, /\.notifications-screen \.feature-body,\s*\.profile-screen \.feature-body/);
  assert.match(runtimeCss, /\.mobile-page:not\(:has\(\.notifications-screen\)\) \.mobile-scrollbar\[data-visible="true"\] \{\s*opacity: 1;\s*\}/);
});

test('notification page has no stale notification-only layout sources', () => {
  assert.doesNotMatch(featureCss, /\.notification-note\s*\{/);
  assert.doesNotMatch(featureTsx, /className="panel notification-row"/);
  assert.doesNotMatch(featureTsx, /notification-icon--expanded/);
  assert.doesNotMatch(featureTsx, /className="notification-note"/);
  assert.doesNotMatch(featureTsx, /所有通知設定將立即生效/);
  assert.match(featureTsx, /<article className="notification-row" key=\{key\}>/);
  assert.match(featureTsx, /<div className="notification-icon"><img src=\{icon\} alt="" \/><\/div>/);
});

test('notification layout has one authoritative sizing and spacing source', () => {
  assert.doesNotMatch(featureCss, /\.notifications-screen\s*\{[^}]*padding-top:/s);
  const notificationBlocks = [...featureCss.matchAll(/([^{}]*\.notification-row[^{}]*)\{([^{}]*)\}/g)];
  const sharedSizingOverrides = notificationBlocks.filter(([, selector, body]) =>
    selector.includes(',') && /(?:^|;)\s*(?:height|max-height)\s*:/.test(body),
  );
  assert.equal(
    sharedSizingOverrides.length,
    0,
    `notification-row must not be included in shared height/max-height rules: ${sharedSizingOverrides.map(([, selector]) => selector.trim()).join(' | ')}`,
  );
  assert.match(
    prototypeCss,
    /\.bottom-nav-brand-screen:not\(\.notifications-screen\) > \.feature-body \{\s*padding-bottom: var\(--layout-bottom-nav-clearance\);\s*\}/,
  );
  assert.doesNotMatch(
    prototypeCss,
    /\.bottom-nav-brand-screen > \.feature-body \{\s*padding-bottom: var\(--layout-bottom-nav-clearance\);\s*\}/,
  );
});

test('notification icon source files use one square canvas and centered visible artwork scale', () => {
  const metrics = iconPaths.map(readPngAlphaBounds);
  const first = metrics[0];
  for (const metric of metrics) {
    assert.equal(metric.width, metric.height, `${metric.path} canvas must be square`);
    assert.equal(metric.width, first.width, `${metric.path} canvas width must match all notification icons`);
    assert.equal(metric.height, first.height, `${metric.path} canvas height must match all notification icons`);
    assert.ok(Math.abs(metric.centerX - ((metric.width - 1) / 2)) <= 1.5, `${metric.path} visible artwork must be horizontally centered`);
    assert.ok(Math.abs(metric.centerY - ((metric.height - 1) / 2)) <= 1.5, `${metric.path} visible artwork must be vertically centered`);
  }
  const dominantSizes = metrics.map((metric) => Math.max(metric.visibleWidth, metric.visibleHeight));
  assert.ok(Math.max(...dominantSizes) - Math.min(...dominantSizes) <= 2, `notification icons must use the same visible artwork scale: ${JSON.stringify(metrics)}`);
});
