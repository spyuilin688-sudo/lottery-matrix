import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('admin Tailwind entry explicitly owns the admin config when built from repository root', () => {
  const css = readFileSync('apps/admin/src/index.css', 'utf8');
  const config = readFileSync('apps/admin/tailwind.config.js', 'utf8');

  assert.match(css, /^@config "\.\.\/tailwind\.config\.js";\n/);
  assert.ok(css.indexOf('@config') < css.indexOf('@tailwind base'));
  assert.match(config, /content:\s*\["\.\/index\.html","\.\/src\/\*\*\/\*\.\{js,ts,jsx,tsx\}"\]/);
});
