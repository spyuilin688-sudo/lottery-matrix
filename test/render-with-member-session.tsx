import { render as renderUi, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemberSessionBridge } from '../src/auth/MemberSessionBridge';

export function render(ui: ReactElement, options?: RenderOptions) {
  return renderUi(<><MemberSessionBridge />{ui}</>, options);
}
