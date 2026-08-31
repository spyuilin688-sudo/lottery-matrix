// @ts-nocheck
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('keeps every Mark Six number on the shared centre without number-specific offsets', () => {
    render(<>{Array.from({ length: 49 }, (_, index) => (
      <NumberBall key={index + 1} lottery="六合彩" number={index + 1} />
    ))}</>);
    const stylesheet = readFileSync(
      resolve(process.cwd(), 'src/number-ball.css'),
      'utf8',
    );

    expect(screen.getAllByLabelText(/^號碼 /)).toHaveLength(49);
    expect(stylesheet).not.toContain('[data-number=');
    expect(stylesheet).not.toContain('--number-optical');
    expect(stylesheet).toContain('top: 50%;');
    expect(stylesheet).toContain('left: 50%;');
    expect(stylesheet).toContain('transform: translate(-50%, -50%)');
  });
});
