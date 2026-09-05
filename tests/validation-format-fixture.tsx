import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppDialogProvider, useAppDialog } from '../src/dialog/AppDialog';
import { MatrixExplorePage } from '../src/FeaturePages';
import { TianyanExpandedLayoutPatch } from '../src/TianyanExpandedLayoutPatch';
import { exploreEnvelope, exploreValidationEnvelope, tianyanEnvelope, tianyanValidation } from './validation-format-fixture-data';
import '../src/design-tokens.css';
import '../src/feature-pages.css';
import '../src/explore-result-preview.css';
import '../src/styles.css';
import '../src/prototype.css';
import '../src/brand-header-unify.css';
import '../src/homepage-repair.css';
import '../src/responsive-feature-pages.css';
import '../src/tongxing-compact.css';
import '../src/matrix-explore-spacing.css';
import '../src/matrix-explore-result-13px.css';
import '../src/feature-page-adjustments.css';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-700.css';
import '@fontsource/roboto/latin-900.css';

// Local regression fixtures only. No request leaves this page.
// The HTTP preview lacks secure-context randomUUID; requests use a fixture ID.
crypto.randomUUID ??= () => '00000000-0000-4000-8000-000000000001';
// Discard earlier fixture snapshots so edited history rows are loaded on refresh.
Object.keys(localStorage)
  .filter((key) => /^(matrix-result|lottery-history|lottery-latest|lottery-query):/.test(key))
  .forEach((key) => localStorage.removeItem(key));
window.fetch = async (input, options) => {
  const url = String(input);
  const request = JSON.parse(String(options?.body ?? '{}')).p_request ?? {};
  const pathLottery = /\/(?:history|latest)\/([^?]+)/.exec(url)?.[1];
  const lottery = request.lottery ?? (pathLottery ? decodeURIComponent(pathLottery) : '今彩539');
  let data: unknown = {};
  const wide = lottery === '六合彩' || lottery === '大樂透';
  const numbers = wide ? ['01','08','14','22','31','36','44'] : ['01','08','14','22','31'];
  if (url.includes('/rpc/matrix_explore_list')) data = { ...exploreEnvelope, lottery };
  else if (url.includes('/rpc/matrix_explore_validation')) {
    const v = structuredClone(exploreValidationEnvelope) as any;
    v.lottery = lottery;
    v.validation.sourceA.sourceNumbers = numbers;
    v.validation.sourceA.referenceNumbers = numbers;
    v.validation.ruleSets[0].rules = [{ value: 5, display: '+5', algorithmType: '加減' }, { value: 15, display: '+15', algorithmType: '加減' }];
    const row = v.validation.ruleSets[0].historicalValidation[0];
    v.validation.ruleSets[0].historicalValidation = Array.from({ length: 3 }, (_, index) => ({ ...row, group: String(index), sourceNumbers: numbers, referenceNumbers: numbers, predictionNumbers: numbers }));
    data = v;
  } else if (url.includes('/rpc/matrix_tianyan_list')) data = { ...tianyanEnvelope, lottery };
  else if (url.includes('/rpc/matrix_tianyan_validation')) {
    const validation = structuredClone(tianyanValidation) as any;
    validation.sourceA.sourceNumbers = numbers.map(Number);
    validation.sourceA.lockedNumber = 38;
    validation.sourceA.lockedPosition = 5;
    Object.assign(validation.rules[0], { referenceOffset: -10, referencePosition: 4, ruleValue: 14 });
    Object.assign(validation.rules[1], { referenceOffset: -1, referencePosition: 4, ruleValue: 55 });
    const row = validation.historicalValidation[0];
    validation.historicalValidation = Array.from({ length: 3 }, (_, index) => ({
      ...row, group: String(index), sourceNumbers: numbers.map(Number), predictionNumbers: numbers.map(Number),
      rule1: { ...row.rule1, hit: index !== 1 },
      rule2: { ...row.rule2, hit: index !== 0 },
      hitNumbers: index === 0 ? [14] : index === 1 ? [27] : [14, 27],
    }));
    data = { ...tianyanEnvelope, lottery, validation };
  }
  else if (url.includes('history')) data = { items: Array.from({ length: 15 }, (_, i) => ({ period: String(114000116 + i), numbers, sortedNumbers: numbers, drawOrderNumbers: numbers })) };
  else if (url.includes('latest')) data = { period: '114000130', numbers, sortedNumbers: numbers };
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

function Inner() {
  const [title, setTitle] = useState<'Matrix 探索' | 'Matrix 天衍'>('Matrix 探索');
  const dialog = useAppDialog();
  return <>
    <nav style={{ position: 'relative', zIndex: 100, display: 'flex', flexWrap: 'wrap', gap: 6, padding: 8 }}>
      <button onClick={() => setTitle('Matrix 探索')}>探索</button>
      <button onClick={() => setTitle('Matrix 天衍')}>天衍</button>
      <button onClick={() => void dialog.confirm({ title: '確認登出？', icon: 'logout' })}>確認小窗</button>
      <button onClick={() => void dialog.alert({ title: '提示', description: '驗證完成', tone: 'success' })}>提示小窗</button>
    </nav>
    <MatrixExplorePage key={title} title={title} roadTypes={title === 'Matrix 天衍' ? ['複合版路'] : ['加減版路','合值版路','拖牌版路']} onNavigate={() => {}} />
    <TianyanExpandedLayoutPatch active={title === 'Matrix 天衍'} />
  </>;
}

function Outer() {
  const [width, setWidth] = useState(390);
  return <main style={{ padding: 12 }}>
    <p>驗證資料為本地測試資料</p>
    <nav>{[320,390,430].map((w) => <button key={w} onClick={() => setWidth(w)}>{w}px</button>)}</nav>
    <iframe title="手機版面" src="?inside=1" style={{ width, height: 1000, border: 0, background: '#02070c' }} />
  </main>;
}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('inside') ? <AppDialogProvider><Inner /></AppDialogProvider> : <Outer />);
