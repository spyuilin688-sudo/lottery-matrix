import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import * as csstree from 'css-tree';
import { ruleBodies } from './helpers/css-rules.mjs';

const { next: syntaxes } = createRequire(import.meta.url)('@csstools/css-syntax-patches-for-csstree');

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

test('the transfer action retains all eight layers within the JSDOM grammar matcher budget', (t) => {
  const warn = t.mock.method(console, 'warn');
  const css = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
  const body = ruleBodies(css, /^\.manual-transfer-submit\.confirm-payment::before$/).join('\n');
  // JSDOM extends CSS Tree with these syntaxes. Validate directly so its lazy
  // style evaluation and shared value caches cannot hide a parser regression.
  const tree = csstree.fork(syntaxes);
  const declarations = tree.parse(body, { context: 'declarationList' });
  tree.walk(declarations, { visit: 'Declaration', enter(node) {
    if (node.property === 'background' || node.property === 'background-image') {
      assert.equal(tree.lexer.matchProperty(node.property, node.value).error, null);
    }
  } });
  const dom = new JSDOM(`<style>.sample {${body}}</style><div class="sample"></div>`);
  try {
    const background = dom.window.getComputedStyle(dom.window.document.querySelector('.sample')).backgroundImage;
    assert.equal((background.match(/(?:radial|linear)-gradient\(/g) ?? []).length, 8);
    assert.equal(warn.mock.calls.filter(({ arguments: args }) => args.some(value => String(value).includes('csstree-match'))).length, 0);
  } finally { dom.window.close(); }
});
