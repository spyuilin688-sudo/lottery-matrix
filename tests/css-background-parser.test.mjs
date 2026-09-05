import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { ruleBodies } from './helpers/css-rules.mjs';

test('the branded action retains all 16 gradient layers without parser iteration warnings', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const css = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
  const body = ruleBodies(css, /^\.branded-explore-action::before$/).join('\n');
  const dom = new JSDOM(`<style>.sample {${body}}</style><div class="sample"></div>`);
  try {
    const background = dom.window.getComputedStyle(dom.window.document.querySelector('.sample')).backgroundImage;
    assert.equal((background.match(/(?:radial|linear)-gradient\(/g) ?? []).length, 16);
    assert.equal(warn.mock.calls.filter(({ arguments: args }) => args.some(value => String(value).includes('csstree-match'))).length, 0);
  } finally { dom.window.close(); }
});
