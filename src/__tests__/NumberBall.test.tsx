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
});
