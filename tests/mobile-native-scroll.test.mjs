import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mobileScroll = readFileSync('src/mobile/MobileScroll.tsx', 'utf8');
const styles = readFileSync('src/styles.css', 'utf8');

test('mobile vertical scrolling uses browser-native momentum', () => {
  assert.doesNotMatch(mobileScroll, /scrollPhysics|requestAnimationFrame|setPointerCapture|preventDefault\(\)|overscrollY|springBack|startMomentum/);
  assert.doesNotMatch(mobileScroll, /onPointerDown|onPointerMove|onPointerUp|onPointerCancel/);
  assert.match(styles, /\.mobile-scroll\s*\{[^}]*overflow-y:\s*auto;[^}]*-webkit-overflow-scrolling:\s*touch;[^}]*touch-action:\s*pan-y;/s);
  assert.doesNotMatch(styles, /\.mobile-scroll\s*\{[^}]*touch-action:\s*none;/s);
});
