import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import glob from 'fast-glob';
import postcssConfig from '../apps/admin/postcss.config.js';
import tailwindConfig from '../apps/admin/tailwind.config.js';

test('admin Tailwind uses admin templates and one config for all CSS files', () => {
  const css = readFileSync('apps/admin/src/index.css', 'utf8');
  const adminRoot = fileURLToPath(new URL('../apps/admin/', import.meta.url));
  const configPath = fileURLToPath(new URL('../apps/admin/tailwind.config.js', import.meta.url));

  assert.match(css, /^@config "\.\.\/tailwind\.config\.js";\n/);
  assert.ok(css.indexOf('@config') < css.indexOf('@tailwind base'));
  assert.equal(postcssConfig.plugins.tailwindcss.config, configPath);
  assert.equal(tailwindConfig.content.relative, true);
  const templates = new Set(glob.sync(tailwindConfig.content.files, { cwd: adminRoot, onlyFiles: true })
    .map(path => path.replace(/^\.\//, '')));
  assert.ok(templates.has('index.html'));
  assert.ok(templates.has('src/AdminTodos.tsx'));
});
