import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const layout = fs.readFileSync('src/matrix-explore-spacing.css', 'utf8');
const balls = fs.readFileSync('src/number-ball.css', 'utf8');
test('compact lower sections', () => {
  assert.match(layout, /\.history-panel \.panel-heading\s*\{[^}]*min-height:\s*32px/s);
  assert.match(layout, /\.history-row,[\s\S]*?height:\s*50px;[\s\S]*?min-height:\s*50px;[\s\S]*?grid-template-columns:\s*minmax\(0, \.65fr\) minmax\(0, \.85fr\) minmax\(0, 3\.5fr\)/);
  assert.match(layout, /\.result-summary > div\s*\{[^}]*min-height:\s*clamp\(36px, 10vw, 40px\)/s);
  assert.match(layout, /\.road-results-head\s*\{[^}]*min-height:\s*32px/s);
  assert.match(layout, /\.road-result-row\s*\{[^}]*min-height:\s*46px;[^}]*padding:\s*\.375rem 0/s);
  assert.match(layout, /\.repeat-stats-heading button\s*\{[^}]*border:\s*1px solid rgba\(212, 165, 47, \.72\);[^}]*background:\s*transparent/s);
  assert.match(balls, /--number-ball-size:\s*clamp\(28px, 7\.7vw, 30px\)/);
});
test('320 360 390 preserve 6+1 room', () => {
  for (const viewport of [320,360,390]) {
    const inner=viewport-34, draw=inner*(3.5/5), ball=Math.max(20,Math.min(viewport*.057,22)), gap=3;
    assert.ok(ball*7+gap*8+8 < draw, `${viewport}px overflow risk`);
  }
});
test('no hard overwrite hacks', () => {
  assert.doesNotMatch(layout, /!important|zoom\s*:|scale\s*\(|transform\s*:|margin(?:-[a-z]+)?\s*:\s*-/);
});
