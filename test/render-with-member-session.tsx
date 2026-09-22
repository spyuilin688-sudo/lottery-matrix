import { render as renderUi, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemberSessionBridge } from '../src/auth/MemberSessionBridge';

function Wrapper({ children }: { children: ReactNode }) {
  return <><MemberSessionBridge />{children}</>;
}

export function render(ui: ReactElement, options?: RenderOptions) {
  return renderUi(ui, { wrapper: Wrapper, ...options });
}
