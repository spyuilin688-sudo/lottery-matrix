import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateChapter15, type StatusRoad } from './matrix-status';

function roads(hitType: StatusRoad['hitType'], streak: number, types: StatusRoad['algorithmType'][], result = hitType === 'one-code' ? ['08'] : ['08', '22']): StatusRoad[] {
  return types.map((algorithmType, index) => ({
    id: `${hitType}-${result.join(',')}-${streak}-${algorithmType}-${index}`, hitType, result,
    algorithmType, numberOrder: '依號碼由小到大排序', streak, predictionDistance: index + 1,
    position: index + 1, lockedNumber: '05', explorePeriods: 13,
  }));
}
const repeat = (type: StatusRoad['algorithmType'], count: number) => Array.from({ length: count }, () => type);
const cases: StatusRoad[][] = [];
for (const streak of [5, 6, 7]) {
  for (const count of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    cases.push(roads('one-code', streak, repeat('加減', count)));
    cases.push(roads('one-code', streak, [...repeat('加減', count), '拖牌']));
    cases.push(roads('one-code', streak, [...repeat('合值', count), '拖牌']));
  }
}
for (const high of [0, 1, 2, 3, 6]) {
  for (const middle of [0, 1, 2, 3, 5, 6, 7, 8]) {
    cases.push([...roads('two-code', 11, repeat('加減', high)), ...roads('two-code', 8, repeat('合值', middle))]);
  }
}
for (const low of [5, 6, 7, 8]) {
  cases.push([...roads('two-code', 11, repeat('加減', 6)), ...roads('two-code', 5, repeat('合值', low))]);
  cases.push([...roads('two-code', 9, ['拖牌']), ...roads('two-code', 5, repeat('加減', low))]);
  cases.push([...roads('two-code', 7, ['拖牌']), ...roads('two-code', 6, repeat('合值', low))]);
}
cases.push(roads('one-code', 7, ['加減', '合值', '拖牌']));
cases.push(roads('one-code', 7, ['拖牌', '拖牌']));
cases.push([...roads('one-code', 7, ['拖牌']), ...roads('one-code', 5, ['加減']), ...roads('one-code', 6, ['合值'])]);
cases.push(roads('one-code', 5, ['加減', '加減', '合值', '合值', '合值', '合值', '合值', '拖牌']));
cases.push([...roads('two-code', 11, ['加減'], ['08', '22']), ...roads('two-code', 7, ['合值'], ['09', '23'])]);
cases.push([...roads('two-code', 11, ['加減'], ['22', '08']), ...roads('two-code', 7, ['合值'], ['08', '22'])]);
const duplicated = roads('one-code', 5, ['加減', '合值']);
cases.push([...duplicated, ...duplicated, ...roads('one-code', 5, ['加減', '合值'], ['09'])]);

describe('canonical twenty-two status presets', () => {
  it('covers all twenty-two preset triggers across boundary fixtures', () => {
    const seen = new Set(cases.flatMap((roads) => evaluateChapter15({
      lottery: '今彩539', drawPeriod: '114123', roads,
    }).cards.map((card) => card.ruleId)));
    expect(seen.size).toBe(22);
  });
  it('keeps Python worker and Edge TS results identical across the same boundary fixtures', () => {
    const expected = cases.map((roads) => evaluateChapter15({ lottery: '今彩539', drawPeriod: '114123', roads }));
    const code = 'import json, sys\nfrom app.domain.status import evaluate_chapter15\nprint(json.dumps([evaluate_chapter15(dict(lottery="今彩539", drawPeriod="114123", roads=roads)) for roads in json.load(sys.stdin)], ensure_ascii=False))';
    const output = execFileSync('python3', ['-c', code], {
      cwd: fileURLToPath(new URL('../services/matrix-api', import.meta.url)),
      input: JSON.stringify(cases), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    });
    expect(JSON.parse(output)).toEqual(expected);
  });
});
