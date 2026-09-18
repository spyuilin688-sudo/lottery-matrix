import { describe, expect, it } from 'vitest';
import { runTianyanAppendixCases, TIANYAN_APPENDIX_EXPECTED } from './matrix-tianyan-cases';

describe('Tianyan Appendix A', () => {
  it('reproduces all five formally confirmed predictions', () => {
    const results = runTianyanAppendixCases();
    expect(results.map(({ name, actual }) => [name, actual])).toEqual(TIANYAN_APPENDIX_EXPECTED);
    expect(results.every(({ pass }) => pass)).toBe(true);
  });
});
