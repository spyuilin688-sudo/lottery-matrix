import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import postcss from 'postcss';

const read = path => readFileSync(path, 'utf8');
const cssFiles = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? cssFiles(join(directory, entry.name)) : entry.name.endsWith('.css') ? [join(directory, entry.name)] : []);
const files = cssFiles('src');
const roots = files.map(file => ({ file, root: postcss.parse(read(file), { from: file }) }));
const rule = (file, selector) => {
  const matches = [];
  roots.find(item => item.file === file).root.walkRules(node => {
    if (node.selector === selector && node.parent.type === 'root') matches.push(node);
  });
  assert.equal(matches.length, 1, `${selector} must have one unconditional owner in ${file}`);
  return Object.fromEntries(matches[0].nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
};

test('notification consolidation keeps the accepted geometry, typography and selected state', () => {
  const file = 'src/feature-page-adjustments.css';
  assert.equal(rule(file, '.notifications-screen-v2 .notification-content')['row-gap'], '8px');
  const bulk = rule(file, '.notifications-screen-v2 .notification-bulk-actions button');
  assert.equal(bulk.height, '29px');
  assert.equal(bulk['min-height'], '29px');
  assert.equal(rule(file, '.notifications-screen-v2 .notification-title h2')['font-weight'], '600');
  const time = rule(file, '.notifications-screen-v2 .notification-time-select');
  assert.equal(time.height, '21px');
  assert.equal(time['min-height'], '21px');
  assert.equal(time['border-radius'], '12px');
  assert.equal(rule(file, '.notifications-screen-v2 .notification-time-select::before').background, '#344A66');
  assert.equal(rule(file, '.notifications-screen-v2 .notification-time-select::after').background, '#101C2C');
  assert.equal(rule(file, '.notifications-screen-v2 .notification-time-select select').color, '#D8C38D');
  assert.equal(rule(file, '.notifications-screen-v2 .notification-time-select select:has(option:checked[value=""])').color, 'var(--lottery-neutral-400)');
});

test('current result inset and responsive stylesheet each have one authoring source', () => {
  const owners = [];
  for (const { file, root } of roots) root.walkDecls('--matrix-explore-result-panel-extra-width', declaration => owners.push([file, declaration.value]));
  assert.deepEqual(owners, [['src/matrix-explore-spacing.css', 'calc(var(--layout-page-inline) + var(--layout-page-inline) - 26px)']]);
  assert.equal(rule('src/matrix-explore-spacing.css', '.matrix-explore-main-screen .feature-body > .result-panel')['--matrix-explore-result-panel-width'], '100%');
  const sources = [read('src/main.tsx'), ...files.map(read)].join('\n');
  assert.equal([...sources.matchAll(/(?:import\s+|@import\s+)["']\.\/responsive-feature-pages\.css["']/g)].length, 1);
  for (const retired of ['matrix-explore-result-13px', 'notification-visual-refinement', 'mobile-layout-polish', 'profile-card-visible-width']) {
    assert.equal(existsSync(`src/${retired}.css`), false, `${retired} is retired`);
    assert.equal(sources.includes(`${retired}.css`), false, `${retired} has no production import`);
  }
});

test('semantic field variants no longer require important priority', () => {
  const important = [];
  for (const { file, root } of roots) root.walkDecls(declaration => { if (declaration.important) important.push([file, declaration.prop, declaration.parent.selector]); });
  assert.equal(important.length, 2);
  assert.ok(important.every(([file, property, selector]) => file === 'src/styles.css' && property === 'cursor' && selector.includes('.device-screen')));
  const file = 'src/feature-pages.css';
  assert.equal(rule(file, '.manual-transfer-bank-row')['grid-template-columns'], 'minmax(84px, auto) minmax(0, 1fr) auto');
  assert.equal(rule(file, '.manual-transfer-screen .detail-card dl > div:not(.manual-transfer-bank-row)')['grid-template-columns'], 'minmax(84px, auto) minmax(0, 1fr)');
  assert.equal(rule(file, '.manual-transfer-copy').height, '28px');
  assert.equal(rule(file, '.manual-transfer-last-five').height, '36px');
  assert.equal(rule(file, '.manual-transfer-submit.confirm-payment')['min-height'], '34px');
});

test('upstream record retirement leaves only the live Matrix notebook owner', () => {
  const retiredClasses = /\.(?:note-form|note-card|notes-list|weekly-summary|note-number-group|note-detail-card)(?=[^\w-]|$)/;
  for (const { file, root } of roots) {
    root.walkRules(node => assert.doesNotMatch(node.selector, retiredClasses, `${file} must not restore retired record styles`));
  }
  const notebook = read('src/features/NotebookPages.tsx');
  assert.match(notebook, /export function MatrixNotebookPage\(/);
  assert.doesNotMatch(notebook, /export function (?:NotesPage|NoteDetailPage)\(/);
  assert.doesNotMatch(read('src/features/router.tsx'), /screen === ["'](?:notes|note-detail)["']/);
  assert.equal(rule('src/feature-pages.css', '.reference-search input')['text-align'], 'center');
});

test('virtualized reference rows and Tiangong spacers have static CSS owners', () => {
  assert.equal(rule('src/feature-pages.css', '.reference-window').position, 'relative');
  assert.equal(rule('src/feature-pages.css', '.reference-window > .reference-row').position, 'absolute');
  assert.equal(rule('src/matrix-tiangong-results.css', '.tiangong-summary-spacer').visibility, 'hidden');
});


test('runtime fixtures resolve canonical CSS imports once and follow the main entry order', () => {
  const require = createRequire(import.meta.url);
  const cssImports = source => [...source.matchAll(/^import\s+["']([^"']+\.css)["'];?$/gm)].map(match => match[1]);
  const owner = (file, specifier) => specifier.startsWith('.') ? normalize(join(dirname(file), specifier)) : specifier;
  const mainOrder = cssImports(read('src/main.tsx')).map(specifier => owner('src/main.tsx', specifier));
  const fixtures = [
    'tests/custom-status-layout-fixture.tsx',
    'tests/notebook-responsive-fixture.tsx',
    'tests/validation-format-fixture.tsx',
  ];
  const retired = /(?:^|\/)(?:brand-header-unify|matrix-explore-result-13px|profile-card-visible-width|notification-visual-refinement|mobile-layout-polish)\.css$/;
  for (const file of fixtures) {
    const imports = cssImports(read(file)).map(specifier => owner(file, specifier));
    assert.equal(new Set(imports).size, imports.length, `${file} must not repeat CSS entry imports`);
    const sharedOrder = imports.filter(specifier => mainOrder.includes(specifier));
    assert.deepEqual(sharedOrder, mainOrder.filter(specifier => imports.includes(specifier)), `${file} must preserve main CSS order`);
    assert.equal(imports.includes('src/responsive-feature-pages.css'), false, `${file} must load responsive rules through matrix-explore-spacing.css`);
    assert.ok(imports.includes('src/matrix-explore-spacing.css'), `${file} must retain the canonical result owner`);

    let responsiveImports = 0;
    const visited = new Set();
    const visit = specifier => {
      assert.doesNotMatch(specifier, retired, `${file} must not restore a retired stylesheet`);
      if (specifier === 'src/responsive-feature-pages.css') responsiveImports += 1;
      const path = specifier.startsWith('src/') ? specifier : require.resolve(specifier);
      assert.equal(existsSync(path), true, `${file}: missing CSS ${specifier}`);
      if (visited.has(path)) return;
      visited.add(path);
      postcss.parse(read(path), { from: path }).walkAtRules('import', node => {
        const imported = /^\s*["']([^"']+)["']/.exec(node.params);
        assert.ok(imported, `${path}: expected a local quoted CSS import`);
        visit(owner(path, imported[1]));
      });
    };
    imports.forEach(visit);
    assert.equal(responsiveImports, 1, `${file} must load the responsive owner exactly once`);
  }
});
