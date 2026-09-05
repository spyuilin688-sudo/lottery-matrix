import { readFileSync } from 'node:fs';
export function readFeaturePagesSource() {
  return ["navigation","shared","LegacyHistoryPage","MatrixValidation","MatrixExplorePage","MatrixTiangongPage","LegacyTongXingPage","NumberReferencePage","CalculatorPage","MatrixCardPage","MatrixGuidePage","NotebookPages","LegacyNotificationsPage","MemberPages","MatrixStatusPages","router"].map(name => readFileSync(new URL('../../src/features/' + name + '.tsx', import.meta.url), 'utf8')).join('\n');
}
