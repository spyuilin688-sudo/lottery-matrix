// @ts-nocheck
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NumberBall } from '../NumberBall';

describe('NumberBall optical alignment hooks', () => {
  it('exposes the normalized number for Mark Six digit-specific alignment', () => {
    render(<>
      <NumberBall lottery="六合彩" number={15} />
      <NumberBall lottery="六合彩" number="16" />
    </>);

    expect(screen.getByLabelText('號碼 15').getAttribute('data-number')).toBe('15');
    expect(screen.getByLabelText('號碼 16').getAttribute('data-number')).toBe('16');
  });

  it('exposes calibrated number hooks for all 49 Mark Six balls', () => {
    render(<>{Array.from({ length: 49 }, (_, index) => (
      <NumberBall key={index + 1} lottery="六合彩" number={index + 1} />
    ))}</>);
    const values = screen.getAllByLabelText(/^號碼 /).map((ball) => ball.getAttribute('data-number'));

    expect(values).toHaveLength(49);
    expect(new Set(values).size).toBe(49);
    expect(values[0]).toBe('01');
    expect(values[48]).toBe('49');
  });
});
