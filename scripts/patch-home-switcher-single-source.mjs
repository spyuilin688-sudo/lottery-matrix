import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const sourcePath = 'src/Prototype.tsx';
let source = readFileSync(sourcePath, 'utf8');
const replacements = [
  ['  independentCards?: boolean;\n', ''],
  ['export function LotterySwitcher({ selected, onChange, className = "", independentCards = false }: LotterySwitcherProps) {', 'export function LotterySwitcher({ selected, onChange, className = "" }: LotterySwitcherProps) {'],
  ['      data-independent-cards={independentCards}\n', ''],
  ['              {independentCards ? <img src={lottery.logo} alt="" draggable={false} /> : null}\n', ''],
  ['<LotterySwitcher selected={selected} onChange={setSelected} className="home-switcher-box" independentCards />', '<LotterySwitcher selected={selected} onChange={setSelected} className="home-switcher-box" />'],
];
for (const [from, to] of replacements) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`Expected Prototype fragment once, found ${count}: ${from.slice(0, 80)}`);
  source = source.replace(from, to);
}
writeFileSync(sourcePath, source);

const cssPath = 'src/homepage-repair.css';
let css = readFileSync(cssPath, 'utf8');
const oldCss = `.home-screen .lottery-switcher > .lottery-switcher-hit-grid > .lottery-card > img {
  display: block;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  object-position: center;
  pointer-events: none;
}

`;
const cssCount = css.split(oldCss).length - 1;
if (cssCount !== 1) throw new Error(`Expected independent-logo CSS once, found ${cssCount}`);
writeFileSync(cssPath, css.replace(oldCss, ''));

unlinkSync('scripts/patch-home-switcher-single-source.mjs');
unlinkSync('.github/workflows/fix-home-switcher-single-source.yml');
