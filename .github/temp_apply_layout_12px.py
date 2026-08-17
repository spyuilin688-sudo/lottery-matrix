from pathlib import Path
import subprocess

TEST = '''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tokens = readFileSync('src/design-tokens.css', 'utf8');
const features = readFileSync('src/feature-pages.css', 'utf8');
const tongxing = readFileSync('src/tongxing-compact.css', 'utf8');
const home = readFileSync('src/homepage-repair.css', 'utf8');

test('mobile page content uses the formal 12px inline spacing token', () => {
  assert.match(tokens, /--layout-page-inline:\\s*12px;/);
  assert.doesNotMatch(features, /\\.feature-body\\s*\\{[^}]*padding-inline:\\s*(?:4|10|14)px;/s);
  assert.doesNotMatch(features, /(?:matrix-notebook|matrix-status|notes|note-detail|profile|profile-detail|activation-code|number-reference|draw-history|matrix-explore-main|matrix-tianyan|matrix-tiangong)-screen[^\\{]*\\.feature-body[^\\{]*\\{[^}]*padding-inline:\\s*(?:4|10|14)px;/s);
  assert.doesNotMatch(tongxing, /\\.tongxing-screen\\s*>\\s*\\.feature-body\\s*\\{[^}]*padding-(?:left|right):\\s*4px;/s);
});

test('homepage uses one 12px page-edge source without compensatory child stretching', () => {
  assert.match(home, /\\.home-screen \\.lottery-screen\\s*\\{[^}]*padding:\\s*0 var\\(--layout-page-inline\\);/s);
  assert.doesNotMatch(home, /--home-main-inline:\\s*16px;/);
  assert.doesNotMatch(home, /--home-wide-inline:\\s*6px;/);
  assert.match(home, /\\.home-screen \\.lottery-switcher\\s*\\{[^}]*width:\\s*100%;[^}]*margin-inline:\\s*0;/s);
  assert.match(home, /\\.home-screen \\.matrix-status-section\\s*\\{[^}]*width:\\s*100%;/s);
  assert.match(home, /\\.home-screen \\.matrix-status-section > \\.home-asset-image\\s*\\{[^}]*width:\\s*100%;[^}]*max-width:\\s*100%;/s);
  assert.match(home, /\\.home-screen \\.home-shortcut-row\\s*\\{[^}]*width:\\s*100%;/s);
});
'''

Path('tests/layout-inline-12px.test.mjs').write_text(TEST)
red = subprocess.run(['node', '--test', 'tests/layout-inline-12px.test.mjs'], text=True)
if red.returncode == 0:
    raise SystemExit('Expected regression test to fail before production change')
print('RED confirmed')

def exact(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f'{path}: expected {count}, got {actual}: {old!r}')
    p.write_text(text.replace(old, new, count))

exact('src/design-tokens.css', '  --layout-page-inline: 16px;', '  --layout-page-inline: 12px;')

p = Path('src/feature-pages.css')
text = p.read_text()
old = '.matrix-explore-main-screen > .feature-body,\n.matrix-tianyan-screen > .feature-body,\n.matrix-tiangong-screen > .feature-body,\n.draw-history-screen > .feature-body,\n.number-reference-screen > .feature-body { padding-inline: 4px; }\n'
if text.count(old) != 1: raise SystemExit('feature initial override mismatch')
text = text.replace(old, '', 1)
old = '.calculator-screen > .feature-body { box-sizing: border-box; min-width: 0; padding-inline: 12px; overflow-x: hidden; }'
new = '.calculator-screen > .feature-body { box-sizing: border-box; min-width: 0; overflow-x: hidden; }'
if text.count(old) != 1: raise SystemExit('calculator override mismatch')
text = text.replace(old, new, 1)
for old in [
    '.matrix-notebook-screen .feature-body { padding-inline: 14px; }\n',
    '.matrix-status-screen .feature-body { padding-inline: 12px; }\n',
    '.notes-screen .feature-body { padding-inline: 10px; }\n',
    '.note-detail-screen .feature-body { padding-inline: 12px; }\n',
    '  .feature-body { padding-inline: 10px; }\n',
]:
    if text.count(old) != 1: raise SystemExit(f'feature override mismatch: {old!r}')
    text = text.replace(old, '', 1)
for old, new in [
    ('  padding-inline: 4px;\n  padding-bottom: 106px;', '  padding-bottom: 106px;'),
    ('  padding-inline: 4px;\n  padding-bottom: var(--layout-bottom-nav-clearance);', '  padding-bottom: var(--layout-bottom-nav-clearance);'),
]:
    if text.count(old) != 1: raise SystemExit(f'scoped feature body mismatch: {old!r}')
    text = text.replace(old, new, 1)
p.write_text(text)

p = Path('src/tongxing-compact.css')
text = p.read_text()
for old in [
    '.tongxing-screen > .feature-body { padding-left: 4px; padding-right: 4px; }\n',
    '  .tongxing-screen > .feature-body { padding-left: 4px; padding-right: 4px; }\n',
]:
    if text.count(old) != 1: raise SystemExit(f'tongxing body mismatch: {old!r}')
    text = text.replace(old, '', 1)
p.write_text(text)

p = Path('src/homepage-repair.css')
text = p.read_text()
for old, new in [
    ('  --home-main-inline: 16px;\n  --home-wide-inline: 6px;\n', '  --home-content-width: calc(min(100vw, 390px) - (var(--layout-page-inline) * 2));\n'),
    ('  padding: 0;\n  flex-direction: column;', '  padding: 0 var(--layout-page-inline);\n  flex-direction: column;'),
    ('  --home-core-height: calc(min(100vw, 390px) * 568 / 1774);', '  --home-core-height: calc(var(--home-content-width) * 568 / 1774);'),
    ('  --home-features-height: calc((min(100vw, 390px) - 6px) * 76.8 / 376.1);', '  --home-features-height: calc(var(--home-content-width) * 76.8 / 376.1);'),
    ('  width: calc(100% - 24px);\n  height: auto;\n  min-height: 0;\n  margin-inline: 12px;', '  width: 100%;\n  height: auto;\n  min-height: 0;\n  margin-inline: 0;'),
    ('  --draw-card-height: calc((min(100vw, 390px) * 732 / 1672) - 4px);', '  --draw-card-height: calc((var(--home-content-width) * 732 / 1672) - 4px);'),
    ('  width: 90.461538462%;\n  justify-content: center;', '  width: 100%;\n  justify-content: center;'),
    ('  width: 108%;\n  height: 100%;\n  max-height: 100%;\n  max-width: none;', '  width: 100%;\n  height: 100%;\n  max-height: 100%;\n  max-width: 100%;'),
    ('  width: calc(100% - 6px);\n  height: var(--home-features-height);', '  width: 100%;\n  height: var(--home-features-height);'),
]:
    if text.count(old) != 1: raise SystemExit(f'homepage mismatch {text.count(old)}: {old!r}')
    text = text.replace(old, new, 1)
p.write_text(text)

subprocess.run(['node', '--test', 'tests/layout-inline-12px.test.mjs'], check=True)
print('GREEN confirmed')
