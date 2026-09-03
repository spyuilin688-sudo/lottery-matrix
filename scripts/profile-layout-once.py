from pathlib import Path
import re
import subprocess

EXPECTED_MAIN = '3cf728a48f87661332bb1ecf4c6e37a645912f12'
PR_BRANCHES = [
    ('fix/subscription-pricing-title-assets-20260904-v6', 'PR #287'),
    ('fix/remaining-audit-issues-20260904', 'PR #277'),
    ('fix/explore-result-refinement-20260904', 'PR #284'),
]
ALLOWED_CONFLICTS = {'src/__tests__/app-production-shell.test.tsx'}


def run(args, check=False):
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    return result


def persist_diagnostic(start_sha: str, lines: list[str]) -> None:
    run(['git', 'merge', '--abort'])
    run(['git', 'reset', '--hard', start_sha])
    Path('integration-diagnostic.txt').write_text('\n'.join(lines) + '\n')
    run(['git', 'add', 'integration-diagnostic.txt'])
    run(['git', 'commit', '-m', 'chore: record guarded integration diagnostic'])
    pushed = run(['git', 'push', 'origin', 'HEAD:我的'])
    if pushed.returncode != 0:
        raise SystemExit('diagnostic push failed: ' + (pushed.stdout or ''))
    raise SystemExit('guarded diagnostic recorded')


def main():
    run(['git', 'config', 'user.name', 'github-actions[bot]'])
    run(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])
    start_sha = (run(['git', 'rev-parse', 'HEAD']).stdout or '').strip()
    lines = [f'start={start_sha}']
    remote_main = (run(['git', 'rev-parse', 'origin/main']).stdout or '').strip()
    lines.append(f'origin/main={remote_main}')
    if remote_main != EXPECTED_MAIN:
        lines.append(f'FAIL main moved expected={EXPECTED_MAIN}')
        persist_diagnostic(start_sha, lines)

    for branch, label in PR_BRANCHES:
        fetched = run(['git', 'fetch', 'origin', f'{branch}:refs/remotes/origin/{branch}'])
        lines.append(f'{label} fetch={fetched.returncode}')
        if fetched.returncode != 0:
            lines.append(fetched.stdout or '')
            persist_diagnostic(start_sha, lines)
        merged = run(['git', 'merge', '--no-ff', '--no-commit', f'origin/{branch}'])
        lines.append(f'{label} merge={merged.returncode}')
        if merged.stdout:
            lines.append(merged.stdout[-4000:])
        if merged.returncode != 0:
            conflicts_raw = run(['git', 'diff', '--name-only', '--diff-filter=U']).stdout or ''
            conflicts = {line.strip() for line in conflicts_raw.splitlines() if line.strip()}
            lines.append(f'{label} conflicts={sorted(conflicts)}')
            unexpected = conflicts - ALLOWED_CONFLICTS
            if unexpected or not conflicts:
                lines.append(f'FAIL unexpected_conflicts={sorted(unexpected)}')
                persist_diagnostic(start_sha, lines)
            for path in sorted(conflicts):
                run(['git', 'checkout', '--ours', '--', path])
                run(['git', 'add', '--', path])
        committed = run(['git', 'commit', '-m', f'Diagnostic merge {label}'])
        lines.append(f'{label} commit={committed.returncode}')
        if committed.returncode != 0:
            lines.append(committed.stdout or '')
            persist_diagnostic(start_sha, lines)

    feature = Path('src/FeaturePages.tsx').read_text()
    checks = {
        'ExploreValidationProcess': feature.count('function ExploreValidationProcess('),
        'TianyanValidationProcess': feature.count('function TianyanValidationProcess('),
        'displayNumber': feature[feature.find('function ExploreValidationProcess('):feature.find('function TianyanValidationProcess(')].count('const displayNumber = (value: string | number) => String(value).padStart(2, "0");'),
        'validationFormula': feature[feature.find('function ExploreValidationProcess('):feature.find('function TianyanValidationProcess(')].count('const validationFormula = ('),
        'formulaDisplayValues': feature[feature.find('function ExploreValidationProcess('):feature.find('function TianyanValidationProcess(')].count('const formulaDisplayValues = '),
        'currentOldRhs': feature[feature.find('function ExploreValidationProcess('):feature.find('function TianyanValidationProcess(')].count('formulaRows(validation.sourceA.baseNumber, values(ruleSet.predictionNumbers).join("、"))'),
        'historicalOldRhs': feature[feature.find('function ExploreValidationProcess('):feature.find('function TianyanValidationProcess(')].count('formulaRows(row.baseNumber, resultNumbers, row.matchedRules)'),
        'specialOldSeparator': feature[feature.find('function ExploreValidationProcess('):feature.find('function TianyanValidationProcess(')].count('aria-hidden="true">{" +"}</i>'),
        'pr277ReferenceState': feature.count('const [referenceLoadState, setReferenceLoadState]'),
        'pr277HistoryError': feature.count('const [historyError, setHistoryError]'),
        'pr277Referral': feature.count('fetchMemberReferralSummary()'),
        'pr287Month': feature.count('price: "$2,880"'),
        'pr287Quarter': feature.count('price: "$5,580"'),
        'pr287Year': feature.count('price: "$17,800"'),
        'pr284Defaults': feature.count('const defaultFiltersFor = (hitValue: string, roadValue: string): ConsecutiveOption[] => {'),
        'pr284GroupStart': feature.count('data-number-group-start={sameCode && index > 0'),
    }
    for key, value in checks.items():
        lines.append(f'{key}={value}')

    section_start = feature.find('function ExploreValidationProcess(')
    section_end = feature.find('\nfunction TianyanValidationProcess(', section_start)
    section = feature[section_start:section_end]
    validation_pattern = re.compile(
        r'  const displayNumber = \(value: string \| number\) => String\(value\)\.padStart\(2, "0"\);\n'
        r'  const validationFormula = \([\s\S]*?\n  \);\n(?=  const resultFormula = )'
    )
    current_pattern = re.compile(
        r'        const currentCalculations = validation\.sourceA\n'
        r'          \? formulaRows\(validation\.sourceA\.baseNumber, values\(ruleSet\.predictionNumbers\)\.join\("、"\)\)\n'
        r'          : \[\];'
    )
    lines.append(f'validation_pattern={len(validation_pattern.findall(section))}')
    lines.append(f'current_pattern={len(current_pattern.findall(section))}')
    lines.append(f'formula_start={section.find("        const formulaDisplayValues = ")}')
    lines.append(f'formula_end={section.find("        const summaryFormulaValues = ")}')
    lines.append(f'temp_workflow={Path(".github/workflows/restore-explore-formula-core-once.yml").exists()}')
    lines.append('MERGE_AND_ANCHOR_PHASE_OK')
    persist_diagnostic(start_sha, lines)


if __name__ == '__main__':
    main()
