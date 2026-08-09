import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';

const resourceDir = path.resolve('public/resources');
const resourcePath = path.join(resourceDir, 'lottery-matrix');
if (!fs.existsSync(resourcePath)) throw new Error('Required lottery-matrix ZIP resource is missing');
const preservedResources = new Map();
if (fs.existsSync(resourceDir)) {
  for (const name of fs.readdirSync(resourceDir)) {
    const fullPath = path.join(resourceDir, name);
    if (fs.statSync(fullPath).isFile()) preservedResources.set(name, fs.readFileSync(fullPath));
  }
}
const tempZip = path.join(os.tmpdir(), 'lottery-matrix-v33-source.zip');
fs.copyFileSync(resourcePath, tempZip);
const zip = new AdmZip(tempZip);
const rootPrefix = 'lottery-matrix-v33-latest-complete/';
fs.rmSync('src', { recursive: true, force: true });
fs.mkdirSync('src', { recursive: true });
fs.rmSync('public', { recursive: true, force: true });
fs.mkdirSync(resourceDir, { recursive: true });
for (const [name, data] of preservedResources) fs.writeFileSync(path.join(resourceDir, name), data);
for (const entry of zip.getEntries()) {
  if (entry.isDirectory) continue;
  const name = entry.entryName;
  let target = null;
  if (name.startsWith(rootPrefix + 'src/')) target = name.slice(rootPrefix.length);
  if (name.startsWith(rootPrefix + 'public/')) target = name.slice(rootPrefix.length);
  if (!target) continue;
  const normalized = path.normalize(target);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) throw new Error('Unsafe archive path: ' + name);
  const out = path.resolve(normalized);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, entry.getData());
}
const lotteryPrototypePath = path.resolve('src/Prototype.tsx');
let lotteryUiSource = fs.readFileSync(lotteryPrototypePath, 'utf8');
const lotteryMarkers = [lotteryUiSource.indexOf('function LotterySwitcher'), lotteryUiSource.indexOf('const LotterySwitcher')].filter((index) => index >= 0);
if (!lotteryMarkers.length) throw new Error('LotterySwitcher component was not found');
const lotteryMarker = Math.min(...lotteryMarkers);
const lotteryWindowEnd = Math.min(lotteryUiSource.length, lotteryMarker + 9000);
const lotteryWindow = lotteryUiSource.slice(lotteryMarker, lotteryWindowEnd);
const returnOffset = lotteryWindow.indexOf('return');
const rootOffset = lotteryWindow.indexOf('<div', returnOffset >= 0 ? returnOffset : 0);
const buttonOffset = lotteryWindow.indexOf('<button', rootOffset >= 0 ? rootOffset : 0);
if (rootOffset < 0 || buttonOffset < 0) throw new Error('LotterySwitcher markup could not be instrumented');
const rootAbsolute = lotteryMarker + rootOffset;
lotteryUiSource = lotteryUiSource.slice(0, rootAbsolute) + lotteryUiSource.slice(rootAbsolute).replace('<div', '<div data-lottery-switcher=""', 1);
const refreshedWindow = lotteryUiSource.slice(lotteryMarker, Math.min(lotteryUiSource.length, lotteryMarker + 9200));
const refreshedButtonOffset = refreshedWindow.indexOf('<button', refreshedWindow.indexOf('data-lottery-switcher'));
const buttonAbsolute = lotteryMarker + refreshedButtonOffset;
const buttonEnd = lotteryUiSource.indexOf('>', buttonAbsolute);
if (refreshedButtonOffset < 0 || buttonEnd < 0) throw new Error('LotterySwitcher button tag could not be instrumented');
let lotteryButtonTag = lotteryUiSource.slice(buttonAbsolute, buttonEnd + 1);
const selectedForward = lotteryButtonTag.match(/((?:selectedLottery|selected|activeLottery|currentLottery|active|current)\s*===\s*(?:[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*|'[^']+'|"[^"]+"))/);
const selectedReverse = lotteryButtonTag.match(/((?:[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*===\s*(?:selectedLottery|selected|activeLottery|currentLottery|active|current))/);
const selectedExpression = selectedForward?.[1] || selectedReverse?.[1] || null;
lotteryButtonTag = lotteryButtonTag.replace('<button', `<button data-lottery-card=""${selectedExpression ? ` data-lottery-selected={${selectedExpression}}` : ''}`);
lotteryUiSource = lotteryUiSource.slice(0, buttonAbsolute) + lotteryButtonTag + lotteryUiSource.slice(buttonEnd + 1);
fs.writeFileSync(lotteryPrototypePath, lotteryUiSource);
const lotteryCssPath = path.resolve('src/prototype.css');
const lotterySwitcherCss = `
/* Homepage four-lottery switcher: equal mobile cards based on the approved reference. */
[data-lottery-switcher] {
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 6px !important;
  width: 100% !important;
  min-width: 0 !important;
  align-items: stretch !important;
}
[data-lottery-switcher] [data-lottery-card] {
  --lottery-glow-rgb: 70, 145, 255;
  position: relative !important;
  isolation: isolate !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  min-width: 0 !important;
  height: 88px !important;
  padding: 0 !important;
  overflow: hidden !important;
  border: 1px solid rgba(222, 229, 239, 0.5) !important;
  border-radius: 14px !important;
  background: linear-gradient(180deg, rgba(4, 10, 23, 0.99) 0%, rgba(2, 7, 17, 0.98) 100%) !important;
  box-shadow: inset 0 0 18px rgba(61, 117, 204, 0.08), 0 1px 0 rgba(255, 255, 255, 0.03) !important;
  color: transparent !important;
  font-size: 0 !important;
  line-height: 0 !important;
  transform: none !important;
}
[data-lottery-switcher] [data-lottery-card]::before {
  content: '';
  position: absolute;
  z-index: 0;
  left: -18%;
  bottom: -40%;
  width: 136%;
  height: 72%;
  border: 1.15px solid rgba(var(--lottery-glow-rgb), 0.72);
  border-radius: 50%;
  transform: rotate(-9deg);
  box-shadow: 0 -1px 7px rgba(var(--lottery-glow-rgb), 0.32), inset 0 1px 5px rgba(var(--lottery-glow-rgb), 0.16);
  opacity: 0.72;
  pointer-events: none;
}
[data-lottery-switcher] [data-lottery-card]::after {
  content: '';
  position: absolute;
  z-index: 0;
  inset: 0;
  background: radial-gradient(80% 56% at 52% 88%, rgba(var(--lottery-glow-rgb), 0.14), transparent 66%);
  pointer-events: none;
}
[data-lottery-switcher] [data-lottery-card]:first-child { --lottery-glow-rgb: 255, 103, 65; }
[data-lottery-switcher] [data-lottery-card]:last-child { --lottery-glow-rgb: 220, 165, 63; }
[data-lottery-switcher] [data-lottery-card] img,
[data-lottery-switcher] [data-lottery-card] svg {
  position: relative !important;
  z-index: 2 !important;
  display: block !important;
  width: auto !important;
  max-width: 82% !important;
  height: auto !important;
  max-height: 44px !important;
  object-fit: contain !important;
  object-position: center !important;
  margin: 0 auto !important;
  transform: none !important;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.42)) !important;
}
[data-lottery-switcher] [data-lottery-card] span {
  font-size: 0 !important;
  line-height: 0 !important;
}
[data-lottery-switcher] [data-lottery-card][data-lottery-selected='true'],
[data-lottery-switcher] [data-lottery-card][aria-pressed='true'],
[data-lottery-switcher] [data-lottery-card][data-active='true'],
[data-lottery-switcher] [data-lottery-card].active,
[data-lottery-switcher] [data-lottery-card].selected {
  border-color: rgba(var(--lottery-glow-rgb), 0.96) !important;
  box-shadow: 0 0 0 1px rgba(var(--lottery-glow-rgb), 0.18), 0 0 12px rgba(var(--lottery-glow-rgb), 0.31), inset 0 0 18px rgba(var(--lottery-glow-rgb), 0.12) !important;
}
[data-lottery-switcher] [data-lottery-card][data-lottery-selected='true']::before,
[data-lottery-switcher] [data-lottery-card][aria-pressed='true']::before,
[data-lottery-switcher] [data-lottery-card][data-active='true']::before,
[data-lottery-switcher] [data-lottery-card].active::before,
[data-lottery-switcher] [data-lottery-card].selected::before {
  opacity: 1;
  box-shadow: 0 -1px 9px rgba(var(--lottery-glow-rgb), 0.48), inset 0 1px 6px rgba(var(--lottery-glow-rgb), 0.23);
}
`;
fs.appendFileSync(lotteryCssPath, lotterySwitcherCss);
const lotterySwitcherRepairCss = `
/* Final optical refinement: keep geometry fixed, balance logo mass and selected-state hierarchy. */
.lottery-switcher {
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 6px !important;
  width: 100% !important;
  height: 82px !important;
  padding: 4px 16px !important;
  align-items: stretch !important;
}
.lottery-switcher > .lottery-card {
  --lottery-glow-rgb: 70, 145, 255;
  position: relative !important;
  isolation: isolate !important;
  display: flex !important;
  width: 100% !important;
  min-width: 0 !important;
  height: 74px !important;
  padding: 0 !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 0 !important;
  overflow: hidden !important;
  border: 1px solid rgba(222, 229, 239, 0.36) !important;
  border-radius: 12px !important;
  background: linear-gradient(180deg, rgba(4, 10, 23, 0.99) 0%, rgba(2, 7, 17, 0.98) 100%) !important;
  box-shadow: inset 0 0 16px rgba(61, 117, 204, 0.05), 0 1px 0 rgba(255, 255, 255, 0.025) !important;
}
.lottery-switcher > .lottery-card::before {
  content: '' !important;
  position: absolute !important;
  z-index: 0 !important;
  left: -18% !important;
  bottom: -42% !important;
  width: 136% !important;
  height: 72% !important;
  border: 1px solid rgba(var(--lottery-glow-rgb), 0.46) !important;
  border-radius: 50% !important;
  transform: rotate(-9deg) !important;
  box-shadow: 0 -1px 6px rgba(var(--lottery-glow-rgb), 0.16) !important;
  opacity: 0.48 !important;
  pointer-events: none !important;
}
.lottery-switcher > .lottery-card::after {
  content: '' !important;
  position: absolute !important;
  z-index: 0 !important;
  inset: 0 !important;
  background: radial-gradient(80% 56% at 52% 88%, rgba(var(--lottery-glow-rgb), 0.08), transparent 66%) !important;
  pointer-events: none !important;
}
.lottery-switcher > .lottery-card[data-lottery='今彩539'] { --lottery-glow-rgb: 255, 103, 65; }
.lottery-switcher > .lottery-card[data-lottery='大樂透'] { --lottery-glow-rgb: 220, 165, 63; }
.lottery-switcher > .lottery-card[data-selected='true'] {
  border-color: rgba(var(--lottery-glow-rgb), 0.86) !important;
  box-shadow: 0 0 0 1px rgba(var(--lottery-glow-rgb), 0.1), 0 0 8px rgba(var(--lottery-glow-rgb), 0.22), inset 0 0 12px rgba(var(--lottery-glow-rgb), 0.08) !important;
}
.lottery-switcher > .lottery-card[data-selected='true']::before {
  opacity: 0.78 !important;
  box-shadow: 0 -1px 7px rgba(var(--lottery-glow-rgb), 0.28) !important;
}
.lottery-switcher > .lottery-card .lottery-label {
  display: none !important;
}
.lottery-switcher > .lottery-card .lottery-logo {
  position: relative !important;
  z-index: 2 !important;
  display: block !important;
  width: 100% !important;
  max-width: 100% !important;
  height: 48px !important;
  flex: 0 0 48px !important;
  overflow: visible !important;
  margin: 0 !important;
}
.lottery-switcher > .lottery-card .lottery-logo img {
  position: absolute !important;
  z-index: 2 !important;
  top: 50.5% !important;
  left: 50% !important;
  display: block !important;
  width: calc(100% - 8px) !important;
  height: 50px !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  object-fit: contain !important;
  object-position: center !important;
  transform: translate(-50%, -50%) scale(2.28) !important;
  transform-origin: center !important;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.42)) !important;
}
.lottery-switcher > .lottery-card[data-lottery='天天樂'] .lottery-logo img {
  top: 52.5% !important;
  transform: translate(-50%, -50%) scale(2.46) !important;
}
.lottery-switcher > .lottery-card[data-lottery='六合彩'] .lottery-logo img {
  top: 52% !important;
  transform: translate(-50%, -50%) scale(2.50) !important;
}
.lottery-switcher > .lottery-card[data-lottery='大樂透'] .lottery-logo img {
  top: 50.5% !important;
  transform: translate(-50%, -50%) scale(2.39) !important;
}
.lottery-switcher > .lottery-card:not([data-selected='true']) .lottery-logo img {
  opacity: 0.88 !important;
  filter: brightness(0.88) saturate(0.92) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.38)) !important;
}
.lottery-switcher > .lottery-card[data-selected='true'] .lottery-logo img {
  opacity: 1 !important;
  filter: brightness(1.04) saturate(1.02) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.42)) !important;
}
`;
fs.appendFileSync(lotteryCssPath, lotterySwitcherRepairCss);
const lotterySwitcherReferenceCss = `
/* Latest approved reference treatment: compact mobile recreation using native CSS layers only. */
.lottery-switcher > .lottery-card[data-lottery='今彩539'] {
  --lottery-glow-rgb: 255, 92, 48;
  background: radial-gradient(100% 82% at 15% 78%, rgba(126, 24, 10, 0.2), transparent 68%), linear-gradient(180deg, rgba(15, 6, 6, 0.99) 0%, rgba(4, 7, 15, 0.99) 100%) !important;
}
.lottery-switcher > .lottery-card[data-lottery='今彩539']::before {
  left: -27% !important;
  bottom: -34% !important;
  width: 154% !important;
  height: 85% !important;
  border: 1.2px solid rgba(255, 105, 48, 0.78) !important;
  transform: rotate(-11deg) !important;
  box-shadow: 0 -1px 8px rgba(255, 78, 35, 0.35), inset 0 1px 6px rgba(255, 158, 62, 0.14) !important;
  opacity: 0.88 !important;
}
.lottery-switcher > .lottery-card[data-lottery='今彩539']::after {
  background: radial-gradient(90% 58% at 42% 90%, rgba(255, 92, 32, 0.16), transparent 66%) !important;
}
.lottery-switcher > .lottery-card[data-lottery='天天樂'] {
  --lottery-glow-rgb: 53, 135, 255;
  background: radial-gradient(100% 82% at 18% 78%, rgba(17, 58, 132, 0.2), transparent 68%), linear-gradient(180deg, rgba(4, 11, 25, 0.99) 0%, rgba(3, 8, 18, 0.99) 100%) !important;
}
.lottery-switcher > .lottery-card[data-lottery='天天樂']::before {
  left: -28% !important;
  bottom: -34% !important;
  width: 156% !important;
  height: 86% !important;
  border: 1.2px solid rgba(53, 139, 255, 0.74) !important;
  transform: rotate(-10deg) !important;
  box-shadow: 0 -1px 8px rgba(41, 126, 255, 0.32), inset 0 1px 6px rgba(65, 177, 255, 0.13) !important;
  opacity: 0.82 !important;
}
.lottery-switcher > .lottery-card[data-lottery='天天樂']::after {
  background: radial-gradient(90% 58% at 45% 90%, rgba(32, 119, 255, 0.14), transparent 66%) !important;
}
.lottery-switcher > .lottery-card[data-lottery='六合彩'] {
  --lottery-glow-rgb: 88, 144, 255;
  background: radial-gradient(62% 54% at 22% 54%, rgba(190, 29, 26, 0.1), transparent 70%), radial-gradient(62% 54% at 78% 26%, rgba(30, 151, 72, 0.1), transparent 70%), radial-gradient(80% 70% at 50% 94%, rgba(40, 99, 216, 0.12), transparent 66%), linear-gradient(180deg, rgba(4, 10, 20, 0.99) 0%, rgba(3, 7, 16, 0.99) 100%) !important;
}
.lottery-switcher > .lottery-card[data-lottery='六合彩']::before {
  left: -31% !important;
  bottom: -35% !important;
  width: 164% !important;
  height: 91% !important;
  border: 0 !important;
  background: conic-gradient(from 205deg at 50% 52%, transparent 0 7%, rgba(255, 55, 42, 0.92) 10% 26%, transparent 30% 38%, rgba(44, 211, 91, 0.88) 41% 56%, transparent 60% 68%, rgba(53, 122, 255, 0.94) 71% 88%, transparent 91% 100%) !important;
  -webkit-mask: radial-gradient(ellipse at center, transparent 0 60%, #000 62% 64%, transparent 66%) !important;
  mask: radial-gradient(ellipse at center, transparent 0 60%, #000 62% 64%, transparent 66%) !important;
  transform: rotate(-8deg) !important;
  box-shadow: none !important;
  opacity: 0.84 !important;
}
.lottery-switcher > .lottery-card[data-lottery='六合彩']::after {
  inset: 0 !important;
  background: radial-gradient(circle, rgba(125, 166, 255, 0.72) 0 0.65px, transparent 0.8px) 0 0 / 4px 4px !important;
  -webkit-mask-image: radial-gradient(ellipse 48% 52% at 88% 30%, #000 0 20%, rgba(0, 0, 0, 0.72) 40%, transparent 74%) !important;
  mask-image: radial-gradient(ellipse 48% 52% at 88% 30%, #000 0 20%, rgba(0, 0, 0, 0.72) 40%, transparent 74%) !important;
  opacity: 0.24 !important;
}
.lottery-switcher > .lottery-card[data-lottery='大樂透'] {
  --lottery-glow-rgb: 220, 165, 63;
  background: radial-gradient(96% 78% at 18% 80%, rgba(123, 87, 16, 0.2), transparent 68%), linear-gradient(180deg, rgba(13, 11, 6, 0.99) 0%, rgba(5, 7, 13, 0.99) 100%) !important;
}
.lottery-switcher > .lottery-card[data-lottery='大樂透']::before {
  left: -27% !important;
  bottom: -34% !important;
  width: 154% !important;
  height: 85% !important;
  border: 1.2px solid rgba(224, 173, 61, 0.75) !important;
  transform: rotate(-10deg) !important;
  box-shadow: 0 -1px 8px rgba(224, 164, 49, 0.32), inset 0 1px 6px rgba(255, 207, 89, 0.12) !important;
  opacity: 0.84 !important;
}
.lottery-switcher > .lottery-card[data-lottery='大樂透']::after {
  inset: 0 !important;
  background: radial-gradient(ellipse 9px 27px at 82% 28%, transparent 92%, rgba(222, 176, 76, 0.34) 94% 97%, transparent 99%), radial-gradient(ellipse 19px 27px at 82% 28%, transparent 92%, rgba(222, 176, 76, 0.3) 94% 97%, transparent 99%), radial-gradient(ellipse 29px 10px at 82% 28%, transparent 92%, rgba(222, 176, 76, 0.31) 94% 97%, transparent 99%), radial-gradient(ellipse 29px 19px at 82% 28%, transparent 92%, rgba(222, 176, 76, 0.27) 94% 97%, transparent 99%), radial-gradient(circle 29px at 82% 28%, transparent 94%, rgba(222, 176, 76, 0.36) 96% 98%, transparent 100%) !important;
  opacity: 0.58 !important;
}
.lottery-switcher > .lottery-card[data-lottery='今彩539'][data-selected='true'] {
  border-color: rgba(255, 111, 78, 0.96) !important;
  box-shadow: 0 0 0 1px rgba(255, 78, 52, 0.13), 0 0 10px rgba(255, 72, 46, 0.28), inset 0 0 13px rgba(255, 76, 40, 0.08) !important;
}
.lottery-switcher > .lottery-card[data-lottery='今彩539'] .lottery-logo img {
  top: 48.5% !important;
  transform: translate(-50%, -50%) scale(2.30) !important;
}
.lottery-switcher > .lottery-card[data-lottery='天天樂'] .lottery-logo img {
  top: 47.5% !important;
  transform: translate(-50%, -50%) scale(2.44) !important;
}
.lottery-switcher > .lottery-card[data-lottery='六合彩'] .lottery-logo img {
  top: 48% !important;
  transform: translate(-50%, -50%) scale(2.46) !important;
}
.lottery-switcher > .lottery-card[data-lottery='大樂透'] .lottery-logo img {
  top: 49% !important;
  transform: translate(-50%, -50%) scale(2.27) !important;
}
`;
fs.appendFileSync(lotteryCssPath, lotterySwitcherReferenceCss);
const isPng = (filePath) => {
  if (!fs.existsSync(filePath)) return false;
  const fd = fs.openSync(filePath, 'r');
  const sig = Buffer.alloc(8);
  fs.readSync(fd, sig, 0, 8, 0);
  fs.closeSync(fd);
  return sig.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
};
const numberReferencePath = path.join(resourceDir, 'number-reference.png');
const numberReferenceFallback = path.join(resourceDir, 'public');
if (!fs.existsSync(numberReferencePath) && isPng(numberReferenceFallback)) {
  fs.copyFileSync(numberReferenceFallback, numberReferencePath);
}
const replacementResources = ['matrix-tongxing.png', 'number-reference.png', 'collision-column-calculator.png', 'matrix-card.png', 'matrix-guide.png'];
const allReplacementResourcesReady = replacementResources.every((name) => fs.existsSync(path.join(resourceDir, name)));
if (allReplacementResourcesReady) {
  const prototypePath = path.resolve('src/Prototype.tsx');
  const prototypeSource = fs.readFileSync(prototypePath, 'utf8');
  const homeShortcuts = `const HOME_SHORTCUTS = [
  { label: 'Matrix 同星', image: '/resources/matrix-tongxing.png' },
  { label: '號碼對照單', image: '/resources/number-reference.png' },
  { label: '連碰立柱計算機', image: '/resources/collision-column-calculator.png' },
  { label: 'Matrix 牌單', image: '/resources/matrix-card.png' },
  { label: 'Matrix 指南', image: '/resources/matrix-guide.png' },
] as const;`;
  const patchedPrototype = prototypeSource.replace(/const HOME_SHORTCUTS = \[[\s\S]*?\] as const;/, homeShortcuts);
  if (patchedPrototype === prototypeSource) throw new Error('HOME_SHORTCUTS block was not found');
  fs.writeFileSync(prototypePath, patchedPrototype);
  const prototypeCssPath = path.resolve('src/prototype.css');
  const normalizedShortcutCss = `
/* Normalize only the five homepage replacement icons. */
.home-shortcut {
  display: flex;
  align-items: center;
  justify-content: center;
}
.home-shortcut img {
  display: block;
  width: auto;
  max-width: none;
  height: calc(100% + 4px);
  object-fit: contain;
  object-position: center;
  border-radius: 9px;
  clip-path: inset(2px round 9px);
  transform: none;
}
.home-shortcut:nth-child(2) img,
.home-shortcut:nth-child(4) img,
.home-shortcut:nth-child(5) img {
  transform: none;
}
`;
  fs.appendFileSync(prototypeCssPath, normalizedShortcutCss);
  console.log('Applied five homepage replacement icons with normalized visible height and cropped outer borders');
} else {
  console.log('Five replacement icons are not complete; keeping original homepage icons');
}
await import('./apply-document-update.mjs');
if (!fs.existsSync('src/main.tsx') || !fs.existsSync('src/App.tsx')) throw new Error('Archive did not contain expected React source files');
console.log('Imported 樂彩 Matrix v33 and applied 通知：_1.docx update layer');

