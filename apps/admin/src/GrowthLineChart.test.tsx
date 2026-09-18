import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GrowthLineChart } from './GrowthLineChart';

describe('GrowthLineChart', () => {
  it('renders a responsive accessible SVG for cumulative points', () => {
    const html = renderToStaticMarkup(
      <GrowthLineChart
        data={[
          { date: '2026-09-01', value: 1 },
          { date: '2026-09-02', value: 3 },
          { date: '2026-09-03', value: 5 },
        ]}
        ariaLabel="會員累積成長曲線"
        valueLabel="累積會員"
      />,
    );

    expect(html).toContain('<svg');
    expect(html).toContain('會員累積成長曲線');
    expect(html).toContain('2026/09/01');
    expect(html).toContain('2026/09/03');
    expect(html).toContain('累積會員 5');
  });

  it('keeps a clear empty state when no points are available', () => {
    const html = renderToStaticMarkup(
      <GrowthLineChart data={[]} ariaLabel="收入成長曲線" valueLabel="累積收入" />,
    );

    expect(html).not.toContain('<svg');
    expect(html).toContain('目前沒有可呈現的資料');
  });
});
