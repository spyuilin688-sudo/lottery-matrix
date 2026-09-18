import { describe, expect, it } from 'vitest';
import { deduplicateDrawRecords } from './draw-records';

describe('draw history deduplication', () => {
  it('returns one enriched record per period', () => {
    const rows = deduplicateDrawRecords([
      {
        period: '115000123',
        drawDate: '2026-08-20',
        numbers: ['01', '02', '03', '04', '05'],
      },
      {
        period: '115000123',
        drawDate: '',
        numbers: ['01', '02', '03', '04', '05'],
        drawOrderNumbers: ['05', '04', '03', '02', '01'],
      },
    ]);

    expect(rows).toEqual([
      {
        period: '115000123',
        drawDate: '2026-08-20',
        numbers: ['01', '02', '03', '04', '05'],
        sortedNumbers: ['01', '02', '03', '04', '05'],
        drawOrderNumbers: ['05', '04', '03', '02', '01'],
      },
    ]);
  });

  it('is order-independent and never mixes conflicting number sets', () => {
    const dated = {
      period: '115000124',
      drawDate: '2026-08-21',
      numbers: ['01', '02', '03', '04', '05'],
    };
    const ordered = {
      period: '115000124',
      drawDate: '2026-08-20',
      numbers: ['06', '07', '08', '09', '10'],
      drawOrderNumbers: ['10', '09', '08', '07', '06'],
    };

    const forward = deduplicateDrawRecords([dated, ordered]);
    const reverse = deduplicateDrawRecords([ordered, dated]);

    expect(forward).toEqual(reverse);
    expect([...forward[0].drawOrderNumbers ?? []].sort()).toEqual(forward[0].sortedNumbers);
  });

  it('stays order-independent with three conflicting duplicates', () => {
    const dated = {
      period: '115000125',
      drawDate: '2026-08-21',
      numbers: ['01', '02', '03', '04', '05'],
    };
    const conflicting = {
      period: '115000125',
      drawDate: '2026-08-22',
      numbers: ['06', '07', '08', '09', '10'],
      drawOrderNumbers: ['10', '09', '08', '07', '06'],
    };
    const compatible = {
      period: '115000125',
      drawDate: '',
      numbers: ['01', '02', '03', '04', '05'],
      drawOrderNumbers: ['05', '04', '03', '02', '01'],
    };

    const expected = deduplicateDrawRecords([dated, conflicting, compatible]);
    expect(deduplicateDrawRecords([conflicting, compatible, dated])).toEqual(expected);
    expect(deduplicateDrawRecords([compatible, dated, conflicting])).toEqual(expected);
  });
});
