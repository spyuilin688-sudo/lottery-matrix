from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label} count={count}")
    return source.replace(old, new, 1)


feature_path = Path("src/FeaturePages.tsx")
source = feature_path.read_text()

# Consecutive filter type: extend only with the five Tianyan streak values required by the UI.
union_start = source.index("  type ConsecutiveOption =")
union_end = source.index("\n\n  type ExploreDate", union_start)
source = source[:union_start] + '''  type ConsecutiveOption =
    | "準4進5"
    | "準5進6"
    | "準6進7"
    | "準7進8"
    | "準9進10"
    | "準11進12"
    | "準14進15"
    | "準15進16"
    | "準16進17"
    | "準17進18";''' + source[union_end:]

old_streaks = '? ["準5進6", "準6進7", "準7進8"]'
if source.count(old_streaks) != 2:
    raise SystemExit(f"Tianyan streak branch count={source.count(old_streaks)}")
source = source.replace(
    old_streaks,
    '? ["準11進12", "準14進15", "準15進16", "準16進17", "準17進18"]',
)

# Scope result mapping changes to Tianyan only, avoiding same literals elsewhere in the file.
mapping_start = source.index('    return (tianyanResponse?.items ?? []).map((item): ExploreResult => ({')
mapping_end = source.index('    }));', mapping_start) + len('    }));')
mapping = source[mapping_start:mapping_end]
mapping = replace_once(mapping, 'algorithmType: "複合版路",', 'algorithmType: item.roadTypeLabel,', "Tianyan algorithm type")
mapping = replace_once(mapping, 'numberOrder: "依號碼由小到大排序",', 'numberOrder: item.numberOrder,', "Tianyan number order")
source = source[:mapping_start] + mapping + source[mapping_end:]

# Matrix Explore keeps its history; Matrix Tianyan omits the shared recent-history card.
history_anchor = 'onExpandedChange={setHistoryExpanded}'
anchor_index = source.index(history_anchor)
history_start = source.rfind('      <HistoryList', 0, anchor_index)
history_end = source.index('      />', anchor_index) + len('      />')
if history_start < 0:
    raise SystemExit("MatrixExplore HistoryList start not found")
history_block = source[history_start:history_end]
source = source[:history_start] + '      {title === "Matrix 探索" ? (\n' + history_block.replace('      <HistoryList', '        <HistoryList', 1).replace('\n        lottery=', '\n          lottery=').replace('\n        numberOrder=', '\n          numberOrder=').replace('\n        onOpenHistory=', '\n          onOpenHistory=').replace('\n        collapsible', '\n          collapsible').replace('\n        collapseControl=', '\n          collapseControl=').replace('\n        showOrderText=', '\n          showOrderText=').replace('\n        expanded=', '\n          expanded=').replace('\n        onExpandedChange=', '\n          onExpandedChange=').replace('\n      />', '\n        />') + '\n      ) : null}' + source[history_end:]

road_label = '<span>{item.algorithmType.endsWith("版路") ? item.algorithmType : `${item.algorithmType}版路`}</span>'
source = replace_once(
    source,
    road_label,
    '<span>{title === "Matrix 天衍" ? item.algorithmType : item.algorithmType.endsWith("版路") ? item.algorithmType : `${item.algorithmType}版路`}</span>',
    "result road label",
)

# Reuse Matrix Explore's three-column validation classes; rule 1 and rule 2 occupy formula rows 1 and 2.
validation_start = source.index('function TianyanValidationProcess({')
validation_end = source.index('export function MatrixExplorePage', validation_start)
validation_component = r'''function TianyanValidationProcess({
  lottery,
  validation,
  loading,
}: {
  lottery: LotteryId;
  validation?: TianyanValidation;
  loading: boolean;
}) {
  const contentProtected = useExploreValidationProtection();
  if (loading) return <p className="empty-result">驗證資料載入中</p>;
  if (!validation) return <p className="empty-result">無驗證資料</p>;

  type TianyanDisplayRow = {
    key: string;
    period: string;
    numbers: Array<string | number>;
    sourceNumber?: number;
    hitNumbers?: number[];
  };
  const displayNumber = (value: string | number) => String(value).padStart(2, "0");
  const values = (numbers: Array<string | number>) => numbers.map(displayNumber);
  const validationFormula = (
    position: number,
    baseNumber: number,
    algorithmType: string,
    ruleValue: number,
    calculationResult: number,
  ) => (
    <span className="explore-validation-formula-expression">
      <span>第</span>
      <span>{position}</span>
      <span>顆</span>
      <span>{displayNumber(baseNumber)}</span>
      {algorithmType.startsWith("合值") ? (
        <><span>合值</span><span>{ruleValue}</span></>
      ) : <span>{`+${ruleValue}`}</span>}
      <span>=</span>
      <span>{displayNumber(calculationResult)}</span>
    </span>
  );
  const resultFormula = (resultNumbers: Array<string | number>) => (
    <>［{" "}<strong className="explore-validation-result-number">{values(resultNumbers).join("、")}</strong>{" "}］</>
  );
  const validationGroup = (key: string, rows: TianyanDisplayRow[], formulas: ReactNode[]) => (
    <div
      className="explore-validation-group"
      data-lottery={lottery}
      data-road-type="複合版路"
      data-row-count={rows.length}
      data-wide-numbers={rows.some((row) => row.numbers.length >= 6) ? "true" : "false"}
      key={key}
    >
      <div className="explore-validation-issues explore-validation-numeric-text">
        {rows.map((row) => (
          <span className="explore-validation-issue" key={`${row.key}-period`}>
            {displayValidationPeriod(lottery, row.period)}
          </span>
        ))}
      </div>
      <div className="explore-validation-numbers-card">
        {rows.map((row) => (
          <div className="explore-validation-draw-row explore-validation-number-row" key={`${row.key}-numbers`}>
            <span className="explore-validation-numbers explore-validation-numeric-text">
              {values(row.numbers).map((value, index) => {
                const state = row.sourceNumber !== undefined && value === displayNumber(row.sourceNumber)
                  ? "hit"
                  : (row.hitNumbers ?? []).some((hit) => value === displayNumber(hit)) ? "step" : "";
                const number = (
                  <i className={state ? `explore-validation-number explore-validation-number--${state}` : "explore-validation-number"}>{value}</i>
                );
                return index === 6 && (lottery === "六合彩" || lottery === "大樂透") ? (
                  <span className="explore-validation-special-number" key={`${value}-${index}`}>
                    <i className="explore-validation-special-separator" aria-hidden="true">+</i>
                    {number}
                  </span>
                ) : <Fragment key={`${value}-${index}`}>{number}</Fragment>;
              })}
            </span>
          </div>
        ))}
      </div>
      <div className="explore-validation-formulas">
        {rows.map((row, index) => (
          <span className="explore-validation-formula-row" key={`${row.key}-formula`}>{formulas[index] ?? ""}</span>
        ))}
      </div>
    </div>
  );
  const currentFormulas = validation.rules.slice(0, 2).map((rule) => validationFormula(
    rule.validationPosition,
    rule.currentBaseNumber,
    rule.algorithmType,
    rule.ruleValue,
    rule.currentPredictionNumber,
  ));

  return (
    <section
      className="road-validation-process explore-validation-card"
      aria-label="天衍驗證過程"
      data-content-protected={contentProtected ? "true" : "false"}
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className="validation-rule-set explore-validation-rule-set">
        <header className="explore-validation-summary-card">
          <ExploreValidationSummary>
            {validation.rules.slice(0, 2).map((rule, index) => (
              <Fragment key={rule.id}>
                {index > 0 ? <i className="explore-validation-summary-separator" aria-hidden="true">｜</i> : null}
                規則{index === 0 ? "一" : "二"}：第 <i className="validation-summary-position">{rule.validationPosition}</i> 顆 {rule.algorithmType} <i className="validation-summary-formula">{rule.ruleValue}</i>
              </Fragment>
            ))}
          </ExploreValidationSummary>
          <strong className="explore-validation-consecutive-tag">準{validation.groupCount}進{validation.groupCount + 1}</strong>
        </header>
        <div className="explore-validation-groups">
          {validation.historicalValidation.map((row) => validationGroup(
            `${validation.itemId}-${row.group}-${row.predictionPeriod}`,
            [
              { key: `source-${row.group}`, period: row.sourcePeriod, numbers: row.sourceNumbers, sourceNumber: row.lockedNumber },
              { key: `formula-${row.group}-2`, period: "", numbers: [] },
              { key: `prediction-${row.group}`, period: row.predictionPeriod, numbers: row.predictionNumbers, hitNumbers: row.hitNumbers },
            ],
            [
              validationFormula(row.rule1.validationPosition, row.rule1.baseNumber, row.rule1.algorithmType, row.rule1.ruleValue, row.rule1.calculationResult),
              validationFormula(row.rule2.validationPosition, row.rule2.baseNumber, row.rule2.algorithmType, row.rule2.ruleValue, row.rule2.calculationResult),
              resultFormula(row.hitNumbers),
            ],
          ))}
          {validation.sourceA && currentFormulas.length === 2 ? validationGroup(
            `${validation.itemId}-current`,
            [
              { key: "current-source", period: validation.sourceA.sourcePeriod, numbers: validation.sourceA.sourceNumbers, sourceNumber: validation.sourceA.lockedNumber },
              { key: "current-formula-2", period: "", numbers: [] },
            ],
            currentFormulas,
          ) : null}
        </div>
        <footer className="explore-validation-prediction">
          <DoubleArrowLeftIcon className="explore-validation-prediction-arrow explore-validation-prediction-arrow--left" aria-hidden="true" />
          <span className="explore-validation-prediction-content">
            <strong>本期預測</strong>
            <b className="explore-validation-numeric-text">{values(validation.mergedSearchPredictionNumbers).join("、")}</b>
          </span>
          <DoubleArrowRightIcon className="explore-validation-prediction-arrow explore-validation-prediction-arrow--right" aria-hidden="true" />
        </footer>
      </div>
    </section>
  );
}

'''
source = source[:validation_start] + validation_component + source[validation_end:]
feature_path.write_text(source)

api_path = Path("src/matrix-algorithm-api.ts")
api = api_path.read_text()
api_start = api.index("export type TianyanApiRow = {")
api_end = api.index("export type TianyanValidationResponse = {", api_start)
api_types = '''export type TianyanRoadTypeLabel =
  | '加減版路'
  | '合值版路'
  | '拖牌版路'
  | '加減合值'
  | '加減拖牌'
  | '合值拖牌';

export type TianyanApiRow = {
  id: string;
  number: string;
  lockedPosition: number;
  predictionDistance: number;
  consecutive: string;
  highestStreak: number;
  predictionNumbers: string[];
  roadType: '複合';
  roadTypeLabel: TianyanRoadTypeLabel;
  hitCondition: '準5+（鎖定2碼）';
  numberOrder: MatrixNumberOrder;
  ruleIds: [string, string];
};

export type TianyanListResponse = {
  kind: 'tianyan';
  lottery: NumberBallLottery;
  drawPeriod: string;
  analysisVersion: string;
  status: 'complete';
  items: TianyanApiRow[];
  total: number;
};

export type TianyanRuleValidation = {
  validationPeriodOffset: number;
  validationPeriod: string;
  validationPosition: number;
  baseNumber: number;
  algorithmType: '加減' | '合值' | '拖牌';
  candidateValues: number[];
  ruleValue: number;
  calculationResult: number;
  hit: boolean;
};

export type TianyanValidation = {
  itemId: string;
  sourceA?: {
    sourcePeriod: string;
    sourceNumbers: Array<string | number>;
    lockedPosition: number;
    lockedNumber: number;
    predictionDistance: number;
  };
  rules: Array<{
    id: string;
    validationPeriodOffset: number;
    validationPeriod: string;
    validationPosition: number;
    referenceOffset: number;
    referencePosition: number;
    algorithmType: '加減' | '合值' | '拖牌';
    value: number;
    ruleValue: number;
    currentBaseNumber: number;
    currentPredictionNumber: number;
  }>;
  groupCount: number;
  minimumIndependentHits: number;
  rule1Only: number;
  rule2Only: number;
  bothHit: number;
  mergedSearchPredictionNumbers: string[];
  historicalValidation: Array<{
    group: string;
    sourcePeriod: string;
    sourceNumbers: Array<string | number>;
    lockedPosition: number;
    lockedNumber: number;
    predictionPeriod: string;
    predictionNumbers: Array<string | number>;
    rule1: TianyanRuleValidation;
    rule2: TianyanRuleValidation;
    hitType: 'rule1Only' | 'rule2Only' | 'bothHit';
    hitNumbers: number[];
    success: boolean;
  }>;
};

'''
api_path.write_text(api[:api_start] + api_types + api[api_end:])

Path("supabase/migrations/20260903073500_matrix_tianyan_result_road_types.sql").write_text(r'''begin;

create or replace function public.matrix_tianyan_list(p_request jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lottery text := nullif(pg_catalog.btrim(p_request->>'lottery'), '');
  v_period text := nullif(pg_catalog.btrim(p_request->>'drawPeriod'), '');
  v_offset integer := coalesce((p_request->>'exploreDateOffset')::integer, 0);
  v_streaks jsonb := coalesce(p_request->'selectedStreaks', '[]'::jsonb);
  v_version text;
  v_draw text;
  v_payload jsonb;
  v_items jsonb;
  v_entitlements jsonb := private.matrix_result_entitlements();
begin
  if v_lottery not in ('今彩539', '天天樂', '六合彩', '大樂透')
    or pg_catalog.jsonb_typeof(v_streaks) <> 'array'
    or v_offset not in (0, 1, 2) then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;

  if (v_entitlements->>'canUseTianyan')::boolean is not true then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  with latest_versions as (
    select distinct on (run.draw_period)
      run.analysis_version,
      run.draw_period,
      draw.draw_date,
      run.completed_at
    from public.matrix_analysis_runs as run
    left join public.lottery_draws as draw
      on draw.lottery = run.lottery
     and draw.period = run.draw_period
    where run.lottery = v_lottery
      and run.status = 'complete'
      and (v_period is null or run.draw_period = v_period)
    order by run.draw_period, run.completed_at desc nulls last
  )
  select analysis_version, draw_period into v_version, v_draw
  from latest_versions
  order by
    (draw_date is not null) desc,
    draw_date desc nulls last,
    draw_period desc,
    completed_at desc nulls last
  offset v_offset
  limit 1;

  if v_version is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  v_payload := private.matrix_artifact_payload('tianyan', v_lottery, v_draw, v_version);
  if v_payload is null then
    raise exception using errcode = 'P0001', message = 'ANALYSIS_NOT_READY';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      item || pg_catalog.jsonb_build_object(
        'roadTypeLabel',
        case
          when v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '加減'
           and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '加減' then '加減版路'
          when v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '合值'
           and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '合值' then '合值版路'
          when v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '拖牌'
           and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '拖牌' then '拖牌版路'
          when (v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '加減'
            and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '合值')
            or (v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '合值'
            and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '加減') then '加減合值'
          when (v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '加減'
            and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '拖牌')
            or (v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '拖牌'
            and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '加減') then '加減拖牌'
          when (v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '合值'
            and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '拖牌')
            or (v_payload->'validationById'->(item->>'id')->'rules'->0->>'algorithmType' = '拖牌'
            and v_payload->'validationById'->(item->>'id')->'rules'->1->>'algorithmType' = '合值') then '合值拖牌'
        end
      )
      order by (item->>'highestStreak')::integer desc, item->>'id'
    ),
    '[]'::jsonb
  ) into v_items
  from pg_catalog.jsonb_array_elements(coalesce(v_payload->'items', '[]'::jsonb)) as item
  where v_streaks ? (item->>'consecutive');

  return pg_catalog.jsonb_build_object(
    'kind', 'tianyan',
    'lottery', v_lottery,
    'drawPeriod', v_draw,
    'analysisVersion', v_version,
    'exploreDateOffset', v_offset,
    'status', 'complete',
    'items', v_items,
    'total', pg_catalog.jsonb_array_length(v_items)
  );
end;
$$;

commit;
''')

Path("src/__tests__/MatrixTianyanPage.test.tsx").write_text(r'''// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { MatrixExplorePage } from '../FeaturePages';

const matrixApi = vi.hoisted(() => ({
  fetchExploreList: vi.fn(),
  fetchExploreValidation: vi.fn(),
  fetchTianyanList: vi.fn(),
  fetchTianyanValidation: vi.fn(),
}));
vi.mock('../matrix-algorithm-api', () => matrixApi);

const envelope = {
  kind: 'tianyan', lottery: '今彩539', drawPeriod: '114000123', analysisVersion: '114000123:v1', status: 'complete', total: 1,
  items: [{
    id: 'tianyan-api-1', number: '07', lockedPosition: 1, predictionDistance: 1,
    consecutive: '準11進12', highestStreak: 11, predictionNumbers: ['14', '27'],
    roadType: '複合', roadTypeLabel: '加減合值', hitCondition: '準5+（鎖定2碼）',
    numberOrder: '依號碼由小到大排序', ruleIds: ['r1', 'r2'],
  }],
} as const;

const validation = {
  itemId: 'tianyan-api-1',
  sourceA: { sourcePeriod: '114000130', sourceNumbers: [7, 11, 15, 22, 30], lockedPosition: 1, lockedNumber: 7, predictionDistance: 1 },
  rules: [
    { id: 'r1', validationPeriodOffset: -1, validationPeriod: '114000129', validationPosition: 2, referenceOffset: -1, referencePosition: 2, algorithmType: '加減', value: 3, ruleValue: 3, currentBaseNumber: 11, currentPredictionNumber: 14 },
    { id: 'r2', validationPeriodOffset: -2, validationPeriod: '114000128', validationPosition: 4, referenceOffset: -2, referencePosition: 4, algorithmType: '合值', value: 5, ruleValue: 5, currentBaseNumber: 22, currentPredictionNumber: 27 },
  ],
  groupCount: 11, minimumIndependentHits: 4, rule1Only: 4, rule2Only: 4, bothHit: 3,
  mergedSearchPredictionNumbers: ['14', '27'],
  historicalValidation: [{
    group: '1', sourcePeriod: '114000120', sourceNumbers: [7, 11, 15, 22, 30], lockedPosition: 1, lockedNumber: 7,
    predictionPeriod: '114000123', predictionNumbers: [14, 18, 27, 31, 35],
    rule1: { validationPeriodOffset: -1, validationPeriod: '114000119', validationPosition: 2, baseNumber: 11, algorithmType: '加減', candidateValues: [3], ruleValue: 3, calculationResult: 14, hit: true },
    rule2: { validationPeriodOffset: -2, validationPeriod: '114000118', validationPosition: 4, baseNumber: 22, algorithmType: '合值', candidateValues: [5], ruleValue: 5, calculationResult: 27, hit: true },
    hitType: 'bothHit', hitNumbers: [14, 27], success: true,
  }],
} as const;

beforeEach(() => {
  document.body.innerHTML = '';
  matrixApi.fetchTianyanList.mockReset().mockResolvedValue(envelope);
  matrixApi.fetchTianyanValidation.mockReset().mockResolvedValue({ ...envelope, itemId: 'tianyan-api-1', validation });
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [] }) }) as typeof fetch;
});

test('天衍移除近10期開獎號碼', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  expect(screen.queryByText('近10期開獎號碼')).toBeNull();
});

test('天衍連準篩選固定為指定五項', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(await screen.findByText('14.27')).toBeTruthy();
  expect(matrixApi.fetchTianyanList).toHaveBeenCalledWith({
    lottery: '今彩539', exploreDateOffset: 0,
    selectedStreaks: ['準11進12', '準14進15', '準15進16', '準16進17', '準17進18'],
  });
  fireEvent.click(screen.getByRole('button', { name: /連準篩選/ }));
  for (const label of ['準11進12', '準14進15', '準15進16', '準16進17', '準17進18']) {
    expect(screen.getByRole('button', { name: label })).toBeTruthy();
  }
  expect(screen.queryByRole('button', { name: '準5進6' })).toBeNull();
});

test('天衍結果依兩條規則分類並保留 Matrix 探索欄位呈現', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(await screen.findByText('加減合值')).toBeTruthy();
  expect(screen.getByText('順球')).toBeTruthy();
});

test('天衍驗證右欄第一列與第二列分別顯示兩條公式', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  fireEvent.click(await screen.findByRole('button', { name: /展開版路/ }));
  const region = await screen.findByRole('region', { name: '天衍驗證過程' });
  const group = region.querySelector('.explore-validation-group');
  expect(group).toBeTruthy();
  const formulas = group?.querySelectorAll('.explore-validation-formula-row') ?? [];
  expect(formulas.length).toBe(3);
  expect(formulas[0]?.textContent?.replace(/\s/g, '')).toContain('第2顆11+3=14');
  expect(formulas[1]?.textContent?.replace(/\s/g, '')).toContain('第4顆22合值5=27');
  expect(formulas[2]?.textContent?.replace(/\s/g, '')).toContain('14、27');
  expect(group?.querySelector('.explore-validation-issue')?.textContent).toBe('114120');
});

test('未登入時維持既有登入提示', async () => {
  matrixApi.fetchTianyanList.mockRejectedValue({ code: 'AUTH_REQUIRED' });
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect((await screen.findByRole('alert')).textContent).toBe('請先登入後再使用 Matrix 天衍');
});
''')

Path("tests/matrix-tianyan-result-ui-contract.test.mjs").write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/FeaturePages.tsx', 'utf8');
const api = readFileSync('src/matrix-algorithm-api.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260903073500_matrix_tianyan_result_road_types.sql', 'utf8');

test('Tianyan result UI matches the approved differences', () => {
  assert.match(source, /title === "Matrix 探索" \? \([\s\S]*?<HistoryList/);
  assert.match(source, /\? \["準11進12", "準14進15", "準15進16", "準16進17", "準17進18"\]/);
  assert.match(source, /algorithmType: item\.roadTypeLabel/);
  assert.match(source, /numberOrder: item\.numberOrder/);
  assert.match(source, /aria-label="天衍驗證過程"/);
  assert.match(source, /validationFormula\(row\.rule1[\s\S]*?validationFormula\(row\.rule2/);
});

test('Tianyan road types are exactly the six approved labels', () => {
  for (const label of ['加減版路', '合值版路', '拖牌版路', '加減合值', '加減拖牌', '合值拖牌']) {
    assert.match(api, new RegExp(label));
    assert.match(migration, new RegExp(label));
  }
});

test('Tianyan list preserves distinct draw-period offsets from PR 244', () => {
  assert.match(migration, /distinct on \(run\.draw_period\)/);
  assert.match(migration, /draw_date desc nulls last/);
  assert.match(migration, /offset v_offset/);
});
''')
