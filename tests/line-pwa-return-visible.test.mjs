import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postcss from 'postcss';

const tokens = postcss.parse(await readFile(new URL('../src/design-tokens.css', import.meta.url), 'utf8'));
const fallback = postcss.parse(await readFile(new URL('../src/line-pwa-return-fallback.css', import.meta.url), 'utf8'));

function resolveColor(value) {
  const token = value.match(/^var\((--[\w-]+)\)$/)?.[1];
  if (!token) return value;
  let declaration;
  tokens.walkDecls(token, candidate => { declaration = candidate; });
  assert.ok(declaration, `Missing color token: ${token}`);
  return resolveColor(declaration.value);
}

function luminance(hexColor) {
  assert.match(hexColor, /^#[0-9a-f]{6}$/i);
  const channels = hexColor.match(/[0-9a-f]{2}/gi).map(channel => parseInt(channel, 16) / 255);
  return channels.reduce((sum, channel, index) => {
    const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

test('LINE login return button has readable text against its background', () => {
  const action = fallback.nodes.find(node => node.selector === '.line-pwa-return__action');
  assert.ok(action, 'Missing LINE return action');
  const getColor = property => {
    let declaration;
    action.walkDecls(property, candidate => { declaration = candidate; });
    assert.ok(declaration, `Missing ${property} for LINE return action`);
    return resolveColor(declaration.value);
  };

  const foreground = luminance(getColor('color'));
  const background = luminance(getColor('background'));
  const contrast = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  assert.ok(contrast >= 4.5, `Return button contrast ${contrast.toFixed(2)}:1 is below 4.5:1`);
});
