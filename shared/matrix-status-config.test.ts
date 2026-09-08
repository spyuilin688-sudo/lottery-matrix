import { describe, expect, it } from 'vitest';
import {
  createDefaultCustomStatusConfig, normalizeCustomStatusConfig, validateCustomConfigRows,
  customRowKey, type CustomConditionRow,
} from './matrix-status-config';

const template = () => createDefaultCustomStatusConfig('今彩539', 'ACTIVE');
const row = (overrides: Partial<CustomConditionRow> = {}) => ({ ...template().oneCodeGroups[0].rows[0], ...overrides });
describe('versioned Matrix custom condition configuration', () => {
  it('provides all twenty-two defaults as independent templates without modifying their source', () => {
    const counts = ['ACTIVE', 'FOCUS', 'RESONANCE', 'CRITICAL'].map((status) => {
      const config = createDefaultCustomStatusConfig('今彩539', status as 'ACTIVE');
      expect(validateCustomConfigRows(config)).toEqual({ ok: true });
      return config.oneCodeGroups.length + config.twoCodeGroups.length;
    });
    expect(counts).toEqual([2, 6, 10, 4]);
    const changed = template();
    changed.oneCodeGroups[0].rows[0].sameCodeMax = 99;
    expect(template().oneCodeGroups[0].rows[0].sameCodeMax).toBe(4);
  });
  it('migrates legacy minimum quantities without making them exact counts', () => {
    const config = normalizeCustomStatusConfig({
      lottery: '今彩539', status: 'ACTIVE', explorePeriods: 13, exploreRange: '完整範圍',
      oneCodeGroups: [{ id: 'existing', rows: [{ consecutive: '準6進7', roadType: '加減', numberOrder: '依實際開獎順序排序', sameCodeQuantity: 7 }] }],
      twoCodeGroups: [],
    });
    expect(config.schemaVersion).toBe(2);
    expect(config.oneCodeGroups[0].rows).toEqual([{
      consecutiveMin: 6, consecutiveMax: 6, roadTypes: ['加減'], roadRelation: 'any',
      numberOrder: '依實際開獎順序排序', sameCodeMin: 7, sameCodeMax: null,
    }]);
  });
  it.each([
    row({ consecutiveMin: 7, consecutiveMax: 5 }), row({ sameCodeMin: 5, sameCodeMax: 4 }),
    row({ sameCodeMax: undefined }), row({ roadTypes: ['加減', '加減'] }),
    row({ roadTypes: [] }), row({ roadTypes: ['加減', '合值'], roadRelation: 'all', roadTypeAlternatives: [['加減']] }),
    row({ roadTypes: ['加減'], roadTypeAlternatives: [['加減']] }),
  ])('rejects malformed ranges and road relations', (condition) => {
    const config = template(); config.oneCodeGroups[0].rows = [condition];
    expect(validateCustomConfigRows(config).ok).toBe(false);
  });
  it('rejects missing v2 fields instead of silently treating them as old rows', () => {
    const config = template();
    config.oneCodeGroups[0].rows = [{ consecutive: '準5進6', roadType: '加減', sameCodeQuantity: 1 } as unknown as CustomConditionRow];
    expect(validateCustomConfigRows(config).ok).toBe(false);
  });
  it('canonicalizes road selections for duplicate detection', () => {
    expect(customRowKey(row())).toBe(customRowKey(row({ roadTypes: ['合值', '加減'] })));
    const config = template(); config.oneCodeGroups[0].rows.push(row({ roadTypes: ['合值', '加減'] }));
    expect(validateCustomConfigRows(config)).toMatchObject({ ok: false, code: 'DUPLICATE_ROW' });
  });
  it('enforces composite permissions in selected alternatives', () => {
    const config = template(); config.oneCodeGroups[0].rows = [row({ roadTypes: ['加減', '複合'], roadRelation: 'all', roadTypeAlternatives: [['加減', '複合']] })];
    expect(validateCustomConfigRows(config, { canCustomizeStatus: true, canUseCompositeCustomRoad: false })).toMatchObject({ ok: false, code: 'COMPOSITE_NOT_ENTITLED' });
  });
});
