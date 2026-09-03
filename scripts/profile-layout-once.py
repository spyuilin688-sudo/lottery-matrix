from pathlib import Path
import re
import subprocess
import sys

ROOT = Path('.')
EXPECTED_MAIN = '3cf728a48f87661332bb1ecf4c6e37a645912f12'
PR_BRANCHES = [
    ('fix/subscription-pricing-title-assets-20260904-v6', 'PR #287 subscription pricing/title assets'),
    ('fix/remaining-audit-issues-20260904', 'PR #277 audit remediation'),
    ('fix/explore-result-refinement-20260904', 'PR #284 Explore refinements'),
]
ALLOWED_CONFLICTS = {'src/__tests__/app-production-shell.test.tsx'}


def run(args, *, check=True, capture=False):
    print('+', ' '.join(args), flush=True)
    result = subprocess.run(
        args,
        cwd=ROOT,
        text=True,
        check=False,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
    )
    if capture and result.stdout:
        print(result.stdout, end='')
    if check and result.returncode != 0:
        raise SystemExit(f'command failed ({result.returncode}): {" ".join(args)}')
    return result


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one source, found {count}')
    return text.replace(old, new, 1)


def merge_remote(branch, label):
    run(['git', 'fetch', 'origin', f'{branch}:refs/remotes/origin/{branch}'])
    result = run(['git', 'merge', '--no-ff', '--no-commit', f'origin/{branch}'], check=False)
    if result.returncode != 0:
        conflicts_raw = run(
            ['git', 'diff', '--name-only', '--diff-filter=U'],
            capture=True,
        ).stdout or ''
        conflicts = {line.strip() for line in conflicts_raw.splitlines() if line.strip()}
        unexpected = conflicts - ALLOWED_CONFLICTS
        if unexpected or not conflicts:
            run(['git', 'merge', '--abort'], check=False)
            raise SystemExit(
                f'{label}: unexpected merge conflicts: {sorted(conflicts)}; '
                f'allowed only: {sorted(ALLOWED_CONFLICTS)}'
            )
        for path in sorted(conflicts):
            # The three PRs intentionally disagree on the obsolete formula test block.
            # Keep the current integration side here, then write the final canonical
            # #259 + #284 contract after all merges are complete.
            run(['git', 'checkout', '--ours', '--', path])
            run(['git', 'add', '--', path])
    run(['git', 'commit', '-m', f'Integrate {label}'])


def restore_explore_formula_core():
    path = Path('src/FeaturePages.tsx')
    source = path.read_text()
    start = source.find('function ExploreValidationProcess(')
    end = source.find('\nfunction TianyanValidationProcess(', start)
    if start < 0 or end < 0:
        raise SystemExit('ExploreValidationProcess anchors not found')
    section = source[start:end]

    validation_pattern = re.compile(
        r'  const displayNumber = \(value: string \| number\) => String\(value\)\.padStart\(2, "0"\);\n'
        r'  const validationFormula = \([\s\S]*?\n  \);\n(?=  const resultFormula = )'
    )
    matches = list(validation_pattern.finditer(section))
    if len(matches) != 1:
        raise SystemExit(f'validationFormula source count={len(matches)}')
    validation_block = '''  const displayNumber = (value: string | number) => String(value).padStart(2, "0");
  const lotteryMaximum = lottery === "今彩539" || lottery === "天天樂" ? 39 : 49;
  const normalizeFormulaNumber = (value: number) => String(
    (((value - 1) % lotteryMaximum) + lotteryMaximum) % lotteryMaximum + 1,
  ).padStart(2, "0");
  const formulaResultNumber = (algorithmType: string, baseNumber: number, ruleValue: number) => (
    normalizeFormulaNumber(algorithmType.startsWith("合值") ? ruleValue - baseNumber : baseNumber + ruleValue)
  );
  const validationFormula = (
    position: number,
    baseNumber: number,
    algorithmType: string,
    ruleValue: number,
  ) => (
    <span className="explore-validation-formula-expression">
      <span className="explore-validation-formula-position">
        <span>第</span>
        <span>{position}</span>
        <span>顆</span>
      </span>
      <span>{displayNumber(baseNumber)}</span>
      {algorithmType.startsWith("合值") ? (
        <>
          <span>合值</span>
          <span>{ruleValue}</span>
        </>
      ) : <span>{`+${ruleValue}`}</span>}
      <span>=</span>
      <span>{formulaResultNumber(algorithmType, baseNumber, ruleValue)}</span>
    </span>
  );
'''
    section = validation_pattern.sub(validation_block, section, count=1)

    special_old = '<i className="explore-validation-special-separator" aria-hidden="true">{" +"}</i>'
    special_new = '<i className="explore-validation-special-separator" aria-hidden="true">+</i>'
    section = replace_once(section, special_old, special_new, 'special-number separator')

    formula_start = section.find('        const formulaDisplayValues = ')
    formula_end = section.find('        const summaryFormulaValues = ', formula_start)
    if formula_start < 0 or formula_end < 0:
        raise SystemExit('formulaDisplayValues/formulaRows anchors not found')
    formula_block = '''        const formulaRules = (matchedRules?: ExploreValidation["ruleSets"][number]["historicalValidation"][number]["matchedRules"]) => {
          const resolved = matchedRules
            ? matchedRules.map((matched) => {
                if (typeof matched !== "number") {
                  return ruleSet.rules.find((rule) => (
                    rule.value === matched.value && rule.algorithmType === matched.algorithmType
                  )) ?? matched;
                }
                return ruleSet.rules.find((rule) => (
                  rule.value === matched && (
                    rule.algorithmType === item.algorithmType || rule.algorithmType === `${item.algorithmType}版路`
                  )
                )) ?? ruleSet.rules.find((rule) => rule.value === matched) ?? {
                  value: matched,
                  display: String(matched),
                  algorithmType: item.algorithmType,
                };
              })
            : ruleSet.rules;
          return item.algorithmType === "拖牌" ? [...resolved].reverse() : resolved;
        };
        const formulaRows = (
          baseNumber: number,
          matchedRules?: ExploreValidation["ruleSets"][number]["historicalValidation"][number]["matchedRules"],
        ) => formulaRules(matchedRules).slice(0, 2).map((rule) => validationFormula(
          item.referencePosition ?? item.position,
          baseNumber,
          rule.algorithmType,
          rule.value,
        ));
'''
    section = section[:formula_start] + formula_block + section[formula_end:]

    current_pattern = re.compile(
        r'        const currentCalculations = validation\.sourceA\n'
        r'          \? formulaRows\(validation\.sourceA\.baseNumber, values\(ruleSet\.predictionNumbers\)\.join\("、"\)\)\n'
        r'          : \[\];'
    )
    if len(current_pattern.findall(section)) != 1:
        raise SystemExit('currentCalculations old RHS source not found exactly once')
    section = current_pattern.sub(
        '        const currentCalculations = validation.sourceA\n'
        '          ? formulaRows(validation.sourceA.baseNumber)\n'
        '          : [];',
        section,
        count=1,
    )

    section = replace_once(
        section,
        'const calculations = formulaRows(row.baseNumber, resultNumbers, row.matchedRules);',
        'const calculations = formulaRows(row.baseNumber, row.matchedRules);',
        'historical formulaRows RHS source',
    )

    required = [
        'const lotteryMaximum = lottery === "今彩539" || lottery === "天天樂" ? 39 : 49;',
        'const normalizeFormulaNumber = (value: number) => String(',
        'const formulaResultNumber = (algorithmType: string, baseNumber: number, ruleValue: number)',
        'const formulaRules = (matchedRules?:',
        'rule.value === matched.value && rule.algorithmType === matched.algorithmType',
        'item.algorithmType === "拖牌" ? [...resolved].reverse() : resolved',
        'formulaResultNumber(algorithmType, baseNumber, ruleValue)',
        'className="explore-validation-formula-position"',
        'className="explore-validation-special-separator" aria-hidden="true">+</i>',
    ]
    for needle in required:
        if needle not in section:
            raise SystemExit(f'missing restored Explore contract: {needle}')
    forbidden = [
        'const formulaDisplayValues =',
        'baseNumber: number,\n          resultNumbers: string,',
        'formulaRows(row.baseNumber, resultNumbers, row.matchedRules)',
        'formulaRows(validation.sourceA.baseNumber, values(ruleSet.predictionNumbers)',
        '{" +"}',
    ]
    for needle in forbidden:
        if needle in section:
            raise SystemExit(f'stale Explore formula contract remains: {needle}')

    source = source[:start] + section + source[end:]
    path.write_text(source)


def write_canonical_app_formula_test():
    path = Path('src/__tests__/app-production-shell.test.tsx')
    source = path.read_text()
    marker = '  it("keeps the scoped tag selector and lets the period column fit its content", () => {'
    if source.count(marker) != 1:
        raise SystemExit(f'app shell formula insertion marker count={source.count(marker)}')

    for name in [
        'inserts the requested half-width spaces in validation formulas',
        'keeps the requested formula spacing through the segmented expression contract',
        'keeps validation formula content while spacing 第、球位、顆 independently',
        'calculates validation formula results while spacing the position token independently',
    ]:
        test_start = source.find(f'  it("{name}"')
        if test_start >= 0:
            next_start = source.find(marker, test_start)
            if next_start < 0:
                raise SystemExit(f'cannot remove obsolete formula test: {name}')
            source = source[:test_start] + source[next_start:]

    canonical = '''  it("calculates validation formula results while spacing the position token independently", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-09" }));

    const formula = Array.from(document.querySelectorAll<HTMLElement>(".explore-validation-formula-expression"))
      .find((element) => element.textContent === "第2顆09+21=30");
    expect(formula).toBeDefined();

    const position = formula?.querySelector<HTMLElement>(".explore-validation-formula-position");
    expect(Array.from(position?.children ?? []).map((part) => part.textContent)).toEqual(["第", "2", "顆"]);
    expect(Array.from(formula?.children ?? []).map((part) => part.textContent)).toEqual(["第2顆", "09", "+21", "=", "30"]);

    const css = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");
    expect(css).toMatch(/\.matrix-explore-main-screen:not\(\.matrix-tianyan-screen\) \.explore-validation-formula-position\s*\{[^}]*gap:\s*1px/s);
  });

'''
    source = source.replace(marker, canonical + marker, 1)
    path.write_text(source)


def update_validation_contract_test():
    path = Path('tests/matrix-explore-validation-preview-merge.test.mjs')
    source = path.read_text()
    start_anchor = '  assert.match(component[0], /className="explore-validation-formula-expression"/);\n'
    end_anchor = '  assert.doesNotMatch(component[0], /className="explore-validation-formulas explore-validation-numeric-text"/);\n'
    start = source.find(start_anchor)
    end = source.find(end_anchor, start)
    if start < 0 or end < 0:
        raise SystemExit('validation contract test anchors not found')
    canonical = '''  assert.match(component[0], /className="explore-validation-formula-expression"/);
  assert.match(component[0], /className="explore-validation-formula-position"/);
  assert.match(component[0], /const formulaResultNumber = \\(algorithmType: string, baseNumber: number, ruleValue: number\\)/);
  assert.match(component[0], /const formulaRules = \\(matchedRules\\?/);
  assert.match(component[0], /rule\\.value === matched\\.value && rule\\.algorithmType === matched\\.algorithmType/);
  assert.match(component[0], /item\\.algorithmType === "拖牌" \\? \\[\\.\\.\\.resolved\\]\\.reverse\\(\\) : resolved/);
  assert.match(component[0], /formulaResultNumber\\(algorithmType, baseNumber, ruleValue\\)/);
  assert.doesNotMatch(component[0], /const formulaDisplayValues =/);
  assert.doesNotMatch(component[0], /const formulaRows = \\(\\s*baseNumber: number,\\s*resultNumbers: string,/s);
  assert.doesNotMatch(component[0], /formulaRows\\(row\\.baseNumber, resultNumbers, row\\.matchedRules\\)/);
  assert.doesNotMatch(component[0], /formulaRows\\(validation\\.sourceA\\.baseNumber, values\\(ruleSet\\.predictionNumbers\\)/);
'''
    source = source[:start] + canonical + source[end:]
    path.write_text(source)


def verify_integrated_contracts():
    feature = Path('src/FeaturePages.tsx').read_text()
    css = Path('src/explore-result-preview.css').read_text()
    analysis_repo = Path('services/matrix-api/app/repositories/analysis_repository.py').read_text()

    required_feature = [
        # PR #277
        'const [referenceLoadState, setReferenceLoadState]',
        'const [historyError, setHistoryError]',
        'fetchMemberReferralSummary()',
        # PR #287
        'price: "$2,880"',
        'price: "$5,580"',
        'price: "$17,800"',
        'Matrix Pro 訂閱方案與收費標準',
        '/assets/lottery/functions/訂閱方案標題K.png',
        '/assets/lottery/functions/推薦啟動標題K.png',
        '/assets/lottery/functions/法律資訊標題K.png',
        # PR #284
        'const defaultFiltersFor = (hitValue: string, roadValue: string): ConsecutiveOption[] => {',
        'data-number-group-start={sameCode && index > 0',
        # restored #259 core
        'const lotteryMaximum = lottery === "今彩539" || lottery === "天天樂" ? 39 : 49;',
        'const formulaResultNumber = (algorithmType: string, baseNumber: number, ruleValue: number)',
        'const formulaRules = (matchedRules?:',
        'item.algorithmType === "拖牌" ? [...resolved].reverse() : resolved',
    ]
    for needle in required_feature:
        if needle not in feature:
            raise SystemExit(f'missing integrated FeaturePages contract: {needle}')
    if 'export function MatrixCorePage(' in feature:
        raise SystemExit('PR #277 unreachable MatrixCorePage was reintroduced')

    required_css = [
        'padding-block: 0.3px;',
        'padding-inline: 0.7px;',
        'border-width: 0.7px;',
        'flex-basis: auto;',
        '.matrix-explore-main-screen:not(.matrix-tianyan-screen) .explore-validation-card {',
        'padding-block: 12px;',
        '.matrix-explore-main-screen:not(.matrix-tianyan-screen) .explore-validation-formula-position {',
        'gap: 1px;',
    ]
    for needle in required_css:
        if needle not in css:
            raise SystemExit(f'missing approved Explore UI contract: {needle}')

    if 'ANALYSIS_RUN_LEASE_SECONDS = 300' not in analysis_repo:
        raise SystemExit('PR #277 analysis lease implementation missing')

    required_files = [
        'supabase/migrations/20260904110000_matrix_analysis_run_lease.sql',
        'supabase/migrations/20260904040000_matrix_explore_prediction_number_group_order.sql',
        'supabase/migrations/20260904032000_update_subscription_plan_prices.sql',
        'tests/matrix-explore-formula-core-regression-20260904.test.mjs',
        'tests/matrix-explore-result-refinement-20260904.test.mjs',
        'tests/subscription-copy-assets.test.mjs',
        'tests/matrix-analysis-run-lease-migration.test.mjs',
    ]
    for filename in required_files:
        if not Path(filename).exists():
            raise SystemExit(f'missing integrated file: {filename}')

    temp_workflow = Path('.github/workflows/restore-explore-formula-core-once.yml')
    if temp_workflow.exists():
        raise SystemExit('temporary PR #284 restore workflow must not remain')


def write_post_guard():
    Path('tests/profile-layout.test.mjs').write_text('''import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nimport test from "node:test";\n\nconst source = readFileSync("src/FeaturePages.tsx", "utf8");\n\ntest("integration runner restored the canonical Explore formula core", () => {\n  assert.match(source, /const formulaResultNumber = \\(algorithmType: string, baseNumber: number, ruleValue: number\\)/);\n  assert.match(source, /const formulaRules = \\(matchedRules\\?/);\n  assert.match(source, /item\\.algorithmType === "拖牌" \\? \\[\\.\\.\\.resolved\\]\\.reverse\\(\\) : resolved/);\n});\n''')


def main():
    run(['git', 'config', 'user.name', 'github-actions[bot]'])
    run(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])

    remote_main = (run(['git', 'rev-parse', 'origin/main'], capture=True).stdout or '').strip()
    if remote_main != EXPECTED_MAIN:
        raise SystemExit(f'main moved before integration: expected {EXPECTED_MAIN}, got {remote_main}')

    for branch, label in PR_BRANCHES:
        merge_remote(branch, label)

    temp_workflow = Path('.github/workflows/restore-explore-formula-core-once.yml')
    if temp_workflow.exists():
        run(['git', 'rm', '--', str(temp_workflow)])

    restore_explore_formula_core()
    write_canonical_app_formula_test()
    update_validation_contract_test()
    verify_integrated_contracts()
    write_post_guard()

    run(['git', 'diff', '--check'])
    run([
        'node', '--test',
        'tests/matrix-explore-formula-core-regression-20260904.test.mjs',
        'tests/matrix-explore-result-refinement-20260904.test.mjs',
        'tests/matrix-explore-validation-preview-merge.test.mjs',
        'tests/subscription-copy-assets.test.mjs',
        'tests/audit-remediation-contract.test.mjs',
        'tests/matrix-analysis-run-lease-migration.test.mjs',
        'tests/profile-layout.test.mjs',
    ])
    run([
        'npm', 'run', 'test:unit', '--',
        'src/__tests__/app-production-shell.test.tsx',
        'src/__tests__/MatrixExplorePage.test.tsx',
        'src/__tests__/ManualBankTransferPage.test.tsx',
        'src/__tests__/NotificationsLoadFailure.test.tsx',
        'src/__tests__/DataPageFailureStates.test.tsx',
        'src/__tests__/InviteFriendsReferral.test.tsx',
    ])

    run(['git', 'add', '-A'])
    run(['git', 'commit', '-m', 'Integrate PR 277 284 287 and restore Explore formula core'])
    run(['git', 'push', 'origin', 'HEAD:我的'])


if __name__ == '__main__':
    main()
