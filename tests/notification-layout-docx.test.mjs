import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

const featureCss = fs.readFileSync('src/feature-pages.css', 'utf8');
const responsiveCss = fs.readFileSync('src/responsive-feature-pages.css', 'utf8');
const runtimeCss = fs.readFileSync('src/styles.css', 'utf8');
const prototypeCss = fs.readFileSync('src/prototype.css', 'utf8');
const featureTsx = fs.readFileSync('src/FeaturePages.tsx', 'utf8');
const notificationsTsx = fs.readFileSync('src/NotificationsPagePatched.tsx', 'utf8');
const brandCss = fs.readFileSync('src/brand-header-unify.css', 'utf8');
const adjustmentsCss = fs.readFileSync('src/feature-page-adjustments.css', 'utf8');
const mainTsx = fs.readFileSync('src/main.tsx', 'utf8');
const patchedNotificationsTsx = fs.readFileSync('src/NotificationsPagePatched.tsx', 'utf8');

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

test('notification page follows the current compact responsive layout specification', () => {
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.feature-body\s*\{[^}]*padding:\s*0 20px calc\(var\(--layout-bottom-nav-clearance\) \+ 12px\);/s);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.notification-list\s*\{[^}]*gap:\s*8px;/s);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.notification-heading\s*\{[^}]*padding:\s*4px 8px 4px 4px;/s);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.notification-heading\s*\{[^}]*column-gap:\s*6px;/s);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.notification-icon,[\s\S]*?width:\s*36px;[^}]*height:\s*36px;/s);
  assert.doesNotMatch(featureCss, /\.notification-icon \{[^}]*border:/);
  assert.doesNotMatch(featureCss, /\.notification-icon \{[^}]*box-shadow:/);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.notification-actions\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*64px 38px;[^}]*gap:\s*12px;/s);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.notification-settings-toggle\s*\{[^}]*width:\s*64px;[^}]*height:\s*20px;/s);
  assert.match(featureCss, /\.notification-row h2 \{[^}]*color: #F2F2F2;[^}]*font-size: 17px;[^}]*font-weight: 700;[^}]*line-height: 23px;[^}]*letter-spacing: 0;/);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.notification-title h2 em\s*\{[^}]*height:\s*12px;[^}]*padding:\s*0 3\.5px;[^}]*border-radius:\s*4px;[^}]*font-size:\s*7px;/s);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.notification-group,[\s\S]*?border:\s*1px solid rgba\(170, 119, 46, \.82\);[^}]*border-radius:\s*12px;[^}]*background:\s*#020c12;/s);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.notification-row\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s);
  assert.match(responsiveCss, /\.notifications-screen \.feature-body \{[^}]*gap:\s*4px;/);
  assert.doesNotMatch(responsiveCss, /\.notifications-screen \.feature-body \{[^}]*padding-inline:/);
  assert.doesNotMatch(responsiveCss, /\.bottom-nav-brand-screen\.notifications-screen > \.feature-brand-header:not\(\.integrated-title-header\)/);
  assert.match(brandCss, /\.feature-brand-header,[\s\S]*?\{[^}]*margin:\s*0 auto var\(--layout-section-gap\)/s);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.notification-actions > \.toggle\s*\{[^}]*width:\s*38px;[^}]*height:\s*18px;/s);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.toggle::before\s*\{[^}]*top:\s*0;[^}]*width:\s*38px;[^}]*height:\s*18px;/s);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.toggle span\s*\{[^}]*top:\s*2px;[^}]*width:\s*14px;[^}]*height:\s*14px;/s);
  assert.match(featureCss, /\.toggle\[data-checked="true"\]::before \{[^}]*background: #D99B00;/);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.toggle\[data-checked="true"\] span\s*\{[^}]*translateX\(20px\)/);
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
  assert.match(notificationsTsx, /<article className="notification-row" data-notification-key=\{key\} key=\{key\}>/);
  assert.match(notificationsTsx, /<div className="notification-icon"><img src=\{icon\} alt="" \/><\/div>/);
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
    /\.bottom-nav-brand-screen:not\(\.notifications-screen\) > \.feature-body \{\s*padding-bottom: calc\(var\(--layout-bottom-nav-clearance\) \+ 8px\);\s*\}/,
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


test('notification v2 has one stylesheet owner and legacy selectors cannot target it', () => {
  const currentClassPattern = /\.(?:notification-list|notification-row|notification-heading|notification-icon|notification-title|notification-actions|notification-choice)(?![\w-])/;
  const selectorGroups = (css) => [...css.matchAll(/(?:^|\})\s*([^@{}][^{}]*)\{/gm)].map((match) => match[1].trim());
  const legacySelectors = [...selectorGroups(featureCss), ...selectorGroups(responsiveCss)]
    .flatMap((group) => group.split(',').map((selector) => selector.trim()))
    .filter((selector) => currentClassPattern.test(selector) && !selector.includes('.notification-modal'));

  for (const selector of legacySelectors) {
    assert.match(
      selector,
      /\.notifications-screen:not\(\.notifications-screen-v2\)/,
      `legacy notification selector must exclude v2: ${selector}`,
    );
  }

  assert.equal(
    (mainTsx.match(/import "\.\/feature-page-adjustments\.css";/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(patchedNotificationsTsx, /import "\.\/feature-page-adjustments\.css";/);
  assert.match(adjustmentsCss, /\.notifications-screen-v2 \.notification-heading\s*\{/);
});


test('bet reminder keeps two time rows without visible reminder labels and uses compact panel spacing', () => {
  assert.doesNotMatch(notificationsTsx, /className="notification-time-row-label"/);
  assert.doesNotMatch(notificationsTsx, />提醒 \{index \+ 1\}</);
  assert.match(
    notificationsTsx,
    /className="notification-grid-row notification-grid-time-row" aria-label=\{`第\$\{index \+ 1\}組提醒時間`\}/,
  );
  assert.match(
    adjustmentsCss,
    /\.notifications-screen-v2 \.notification-inline-settings-content\s*\{[^}]*padding:\s*6px 4px 8px;/s,
  );
  assert.doesNotMatch(adjustmentsCss, /\.notifications-screen-v2 \.notification-time-row-label\s*\{/);
});
