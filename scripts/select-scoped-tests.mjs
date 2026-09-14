#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GROUPS = ['node', 'vitest', 'edge', 'admin', 'python', 'playwright', 'membership'];
const EXTENSIONS = ['', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json', '.py', '/index.ts', '/index.tsx', '/index.js', '/__init__.py'];
const PYTHON_ROOT = 'services/matrix-api';
const SOURCE = /\.(?:[cm]?[jt]sx?|css|html|py|json|ya?ml)$/;
const TEST = /(?:\.test\.(?:[cm]?[jt]sx?)|\.spec\.tsx?|(?:^|\/)test_[^/]+\.py)$/;

// Navigation to / has no static module import. These are the actual screen owners
// exercised by each focused browser spec, not a directory-wide browser fallback.
const BROWSER_OWNERS = {
  'tests/bottom-navigation.spec.ts': ['src/BottomNavigation.tsx', 'src/features/navigation.tsx'],
  'tests/home-logo-core-responsive.spec.ts': ['src/Prototype.tsx', 'src/homepage/base.css', 'src/homepage/lottery-switcher.css'],
  'tests/home-pro-plans-layout-runtime.spec.ts': ['src/Prototype.tsx', 'src/features/MemberPages.tsx', 'src/pro-plans-layout.css', 'src/pro-plans-carousel-peek.css'],
  'tests/tongxing-reference-responsive.spec.ts': ['src/features/LegacyTongXingPage.tsx', 'src/features/NumberReferencePage.tsx', 'src/tongxing-compact.css', 'src/number-reference-visual-refinement.css'],
  'tests/notebook-reliability.spec.ts': ['src/features/NotebookPages.tsx', 'src/features/notebook-owner.ts', 'src/features/notebook-storage.ts'],
  'tests/mobile-runtime.spec.ts': ['src/mobile/MobileRuntime.tsx', 'src/mobile/MobileScroll.tsx', 'src/mobile/Keyboard.tsx', 'src/input-behavior.ts'],
  'tests/membership-preview/responsive.spec.ts': ['tests/membership-preview/main.tsx', 'tests/membership-preview/preview.css', 'tests/membership-preview/state.ts', 'src/features/MemberPages.tsx'],
};

// Configuration changes exercise the tests for the configuration itself. Package
// changes do not manufacture an all-tests selection; build/check gates still run.
const CONFIG_OWNERS = {
  '.github/workflows/ci.yml': ['tests/scoped-ci.test.mjs', 'tests/ci-workflow-coverage.test.mjs'],
  'scripts/select-scoped-tests.mjs': ['tests/scoped-ci.test.mjs', 'tests/ci-workflow-coverage.test.mjs'],
  'vitest.edge-functions.config.ts': ['tests/edge-functions-config.test.mjs'],
  'mobile-runtime.lock.json': ['tests/runtime-integrity-atomic-commit.test.mjs', 'tests/runtime-integrity-scope.test.mjs'],
  'playwright.config.ts': ['tests/mobile-runtime.spec.ts'],
  'vite.runtime-tests.config.ts': ['tests/mobile-runtime.spec.ts'],
  'playwright.membership-preview.config.ts': ['tests/membership-preview/responsive.spec.ts'],
};

function groupFor(file, source = '') {
  if (!TEST.test(file)) return null;
  if (file.endsWith('.py')) return file.startsWith(`${PYTHON_ROOT}/tests/`) ? 'python' : null;
  if (/\.spec\.tsx?$/.test(file)) return file.startsWith('tests/membership-preview/') ? 'membership' : 'playwright';
  if (file.endsWith('.mjs') || /['"]node:test['"]/.test(source)) return 'node';
  if (file.startsWith('supabase/functions/')) return 'edge';
  if (file.startsWith('apps/admin/src/')) return 'admin';
  return 'vitest';
}

function dependencies(file, source, known) {
  const imports = new Set();
  const reads = new Set();
  function resolve(request, destination, relativeOnly = false) {
    if (!request || /[\n\r${}*]/.test(request) || /^(?:https?:|node:|data:)/.test(request)) return;
    const clean = request.split(/[?#]/)[0];
    const candidates = clean.startsWith('/') ? [clean.slice(1)]
      : clean.startsWith('.') || relativeOnly ? [path.posix.join(path.posix.dirname(file), clean)]
        : [clean, path.posix.join(path.posix.dirname(file), clean)];
    for (const candidate of candidates) {
      for (const extension of EXTENSIONS) {
        const resolved = path.posix.normalize(candidate + extension);
        if (known.has(resolved)) { destination.add(resolved); return; }
      }
    }
  }
  if (file.endsWith('.py')) {
    function pythonModule(module) {
      const dots = module.match(/^\.+/)?.[0].length ?? 0;
      const base = dots ? path.posix.join(path.posix.dirname(file), ...Array(dots - 1).fill('..')) : PYTHON_ROOT;
      return path.posix.join(base, module.slice(dots).replaceAll('.', '/'));
    }
    for (const match of source.matchAll(/^\s*from\s+([.\w]+)\s+import\s+(\([\s\S]*?\)|[^\n]+)/gm)) {
      const base = pythonModule(match[1]);
      resolve(base, imports);
      for (const member of match[2].replace(/[()]/g, '').split(',')) {
        const name = member.trim().split(/\s+/)[0];
        if (/^\w+$/.test(name)) resolve(`${base}/${name}`, imports);
      }
    }
    for (const match of source.matchAll(/^\s*import\s+([\w.]+)/gm)) resolve(pythonModule(match[1]), imports);
  } else {
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/g)) {
      if (match[2].startsWith('.')) resolve(match[2], imports, true);
    }
    // Literal import.meta.url fixtures, including conditional URL arguments.
    for (const match of source.matchAll(/new URL\(\s*((?:(?!new URL|;)[\s\S])*?),\s*import\.meta\.url\s*,?\s*\)/g)) {
      for (const literal of match[1].matchAll(/(['"])([^'"\n]+)\1/g)) resolve(literal[2], reads, true);
    }
    for (const match of source.matchAll(/\b(?:readFileSync|readFile|readLocalCss)\s*\(\s*(['"])([^'"\n]+)\1/g)) resolve(match[2], reads);
    // Repository tests use a local read(path) helper around new URL(`../${path}`).
    if (/\b(?:const|let)\s+read\s*=/.test(source) && /\breadFile(?:Sync)?\b/.test(source)) {
      const helper = source.match(/\b(?:const|let)\s+read\s*=([^;]+);/)?.[1] ?? '';
      const prefix = helper.match(/new URL\(\s*['"]([^'"]+)['"]\s*\+/)?.[1]
        ?? helper.match(/new URL\(\s*`([^`$]*)\$\{/)?.[1];
      for (const match of source.matchAll(/\bread\(\s*(['"])([^'"\n]+)\1/g)) {
        resolve(prefix === undefined ? match[2] : prefix + match[2], reads, prefix !== undefined);
      }
    }
    if (file.endsWith('.css')) {
      for (const match of source.matchAll(/@import\s+(?:url\(\s*)?(['"])([^'"]+)\1/g)) resolve(match[2], imports, true);
    }
    if (file.endsWith('.html')) {
      for (const match of source.matchAll(/(?:src|href)\s*=\s*(['"])([^'"]+)\1/g)) resolve(match[2], imports, true);
    }
    if (/\.spec\.tsx?$/.test(file)) {
      for (const match of source.matchAll(/\.goto\(\s*(['"`])(\/tests\/[^'"`?$]+)(?:[^'"`]*)\1/g)) resolve(match[2], imports);
    }
  }
  if (file === 'tests/helpers/read-feature-pages-source.mjs') {
    // This helper joins source text from an explicit list of feature module names.
    for (const match of source.matchAll(/['"]([A-Za-z][A-Za-z0-9]*)['"]/g)) resolve(`src/features/${match[1]}.tsx`, reads);
  }
  for (const owner of BROWSER_OWNERS[file] ?? []) reads.add(owner);
  return { imports, reads };
}

export function selectTests(files, changed) {
  const paths = [...new Set(changed)].sort();
  const known = new Set([...files.keys(), ...paths]); // Keep deleted dependencies resolvable.
  const graph = new Map();
  for (const [file, source] of files) if (SOURCE.test(file)) graph.set(file, dependencies(file, source, known));
  const groups = Object.fromEntries(GROUPS.map(group => [group, []]));
  const reasons = {};
  for (const [file, source] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    const group = groupFor(file, source);
    if (!group) continue;
    const reached = new Set();
    const visited = new Set();
    function visit(current) {
      if (visited.has(current)) return;
      visited.add(current); reached.add(current);
      const deps = graph.get(current);
      if (!deps) return;
      for (const dependency of deps.imports) visit(dependency);
      for (const dependency of deps.reads) {
        reached.add(dependency);
        // A CSS fixture can import another stylesheet; source-text JS reads do
        // not execute the source's imports and must not expand to the whole app.
        if (dependency.endsWith('.css')) visit(dependency);
      }
    }
    visit(file);
    const related = paths.filter(changedFile => reached.has(changedFile) || CONFIG_OWNERS[changedFile]?.includes(file));
    if (related.length) { groups[group].push(file); reasons[file] = related; }
  }
  for (const group of GROUPS) groups[group].sort();
  const covered = new Set(Object.values(reasons).flat());
  return { version: 1, changed: paths, groups, reasons, unmatched: paths.filter(file => !covered.has(file)) };
}

export function changedPaths(root, base, head, event) {
  if (!/^[a-f\d]{40}$/i.test(base ?? '') || !/^[a-f\d]{40}$/i.test(head ?? '') || /^0+$/.test(base)) {
    throw new Error('Scoping requires nonzero base and head commit SHAs; no full-suite fallback is permitted.');
  }
  if (!['pull_request', 'push'].includes(event)) throw new Error('Expected --event pull_request or push');
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git(['cat-file', '-e', `${base}^{commit}`]); git(['cat-file', '-e', `${head}^{commit}`]);
    const start = event === 'pull_request' ? git(['merge-base', base, head]).trim() : base;
    return git(['diff', '--name-only', '--no-renames', '-z', start, head, '--']).split('\0').filter(Boolean).sort();
  } catch (error) {
    throw new Error(`The requested Git comparison is unavailable; fetch base/head history before selecting tests. ${error.message}`);
  }
}

export function commandFor(group, files, root) {
  if (!GROUPS.includes(group)) throw new Error(`Unknown test group: ${group}`);
  if (!Array.isArray(files)) throw new Error('Expected an explicit test file list');
  if (files.length === 0) return null;
  for (const file of files) {
    if (typeof file !== 'string' || !/^[\w./-]+$/.test(file) || file.startsWith('-') || file.startsWith('/') || file.split('/').includes('..') || !TEST.test(file)) {
      throw new Error(`Expected an explicit test file inside the repository: ${file}`);
    }
  }
  const absolute = [...new Set(files)].map(file => path.resolve(root, file));
  if (group === 'node') return { bin: process.execPath, args: ['--test', ...absolute], cwd: root };
  if (group === 'python') return { bin: 'uv', args: ['run', 'pytest', '-q', ...absolute], cwd: path.join(root, PYTHON_ROOT) };
  if (['playwright', 'membership'].includes(group)) return {
    bin: path.join(root, 'node_modules/.bin/playwright'),
    args: ['test', '--config', group === 'membership' ? 'playwright.membership-preview.config.ts' : 'playwright.config.ts', ...absolute], cwd: root,
  };
  return {
    bin: path.join(root, group === 'admin' ? 'apps/admin/node_modules/.bin/vitest' : 'node_modules/.bin/vitest'),
    args: ['run', '--config', group === 'edge' ? 'vitest.edge-functions.config.ts' : group === 'admin' ? 'apps/admin/vite.config.ts' : 'vitest.config.ts', ...absolute], cwd: root,
  };
}

function repositoryFiles(root) {
  const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const files = new Map();
  for (const file of new Set(listed.split('\0').filter(Boolean))) {
    if (!SOURCE.test(file)) continue;
    try { files.set(file, readFileSync(path.join(root, file), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return files;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const run = option('--run');
  let plan;
  if (option('--plan-env')) {
    plan = JSON.parse(process.env[option('--plan-env')] ?? 'null');
    if (plan?.version !== 1 || !plan.groups) throw new Error('Missing or invalid scoped test plan');
  } else {
    const changed = option('--changed-json') ? JSON.parse(option('--changed-json'))
      : changedPaths(root, option('--base'), option('--head'), option('--event'));
    if (!Array.isArray(changed) || changed.some(file => typeof file !== 'string')) throw new Error('Changed paths must be a JSON string array');
    plan = selectTests(repositoryFiles(root), changed);
  }
  if (run) {
    const selected = plan.groups[run];
    const command = commandFor(run, selected, root);
    if (!command) { console.log(`No related ${run} tests selected; runner was not started.`); return; }
    for (const file of selected) {
      if (groupFor(file, readFileSync(path.join(root, file), 'utf8')) !== run) throw new Error(`Wrong runner for ${file}`);
    }
    console.log(JSON.stringify(command));
    const result = spawnSync(command.bin, command.args, { cwd: command.cwd, stdio: 'inherit', shell: false });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
    return;
  }
  if (option('--github-output')) {
    appendFileSync(option('--github-output'), `plan=${JSON.stringify(plan)}\n` + GROUPS.map(group => `${group}=${plan.groups[group].length > 0}\n`).join(''));
  }
  console.log(JSON.stringify(plan, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
