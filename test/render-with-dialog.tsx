import { render as renderUi, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { AppDialogProvider } from '../src/dialog/AppDialog';

export function render(ui: ReactElement, options?: RenderOptions) {
  return renderUi(ui, { wrapper: AppDialogProvider, ...options });
}
