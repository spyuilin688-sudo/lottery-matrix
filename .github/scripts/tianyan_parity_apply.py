from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if new in text and old not in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "src/FeaturePages.tsx",
    '''  const summaryRulePairs = Array.from(\n    { length: Math.ceil(validation.rules.length / 2) },\n    (_, index) => validation.rules.slice(index * 2, (index + 1) * 2),\n  );''',
    '''  const summaryRulePairs = [validation.rules.slice(0, 2)];''',
)

replace_once(
    "src/FeaturePages.tsx",
    '''  const duplicateStats = useMemo(() => {\n    if (title === "Matrix 探索") return exploreResponse?.duplicateStats ?? [];\n    const counts = new Map<string, number>();\n    for (const item of visibleResults) {\n      for (const number of item.prediction.split(".")) counts.set(number, (counts.get(number) ?? 0) + 1);\n    }\n    return [...counts.entries()]\n      .sort((left, right) => right[1] - left[1] || Number(left[0]) - Number(right[0]))\n      .map(([number, count]) => ({ number, count }));\n  }, [exploreResponse, title, visibleResults]);''',
    '''  const duplicateStats = title === "Matrix 探索"\n    ? exploreResponse?.duplicateStats ?? []\n    : tianyanResponse?.duplicateStats ?? [];''',
)

replace_once(
    "src/FeaturePages.tsx",
    '''        const response = await fetchTianyanList({\n          lottery,\n          exploreDateOffset,\n          selectedStreaks: nextFilters,\n        });''',
    '''        const response = await fetchTianyanList({\n          lottery,\n          exploreDateOffset,\n          selectedStreaks: nextFilters,\n          sameCode: nextSameCode,\n          ...(nextPredictionNumber ? { predictionNumber: nextPredictionNumber } : {}),\n        });''',
)

replace_once(
    "src/FeaturePages.tsx",
    '''  const togglePredictionNumber = (number: string) => {\n    if (title !== "Matrix 探索") return;\n    const next = selectedPredictionNumber === number ? null : number;''',
    '''  const togglePredictionNumber = (number: string) => {\n    const next = selectedPredictionNumber === number ? null : number;''',
)

replace_once(
    "src/FeaturePages.tsx",
    '''{duplicateStats.map(({ number, count }) => title === "Matrix 探索" ? (''',
    '''{duplicateStats.map(({ number, count }) => (title === "Matrix 探索" || title === "Matrix 天衍") ? (''',
)

replace_once(
    "src/TianyanExpandedLayoutPatch.tsx",
    '''    const candidate = await fetchTianyanList({\n      lottery,\n      exploreDateOffset,\n      selectedStreaks: [consecutive],\n    });''',
    '''    const candidate = await fetchTianyanList({\n      lottery,\n      exploreDateOffset,\n      selectedStreaks: [consecutive],\n      sameCode: false,\n    });''',
)

replace_once(
    "src/matrix-algorithm-api.ts",
    '''  items: TianyanApiRow[];\n  total: number;\n};''',
    '''  items: TianyanApiRow[];\n  duplicateStats: Array<{ number: string; count: number }>;\n  total: number;\n};''',
)

replace_once(
    "src/matrix-algorithm-api.ts",
    '''export function fetchTianyanList(request: {\n  lottery: NumberBallLottery;\n  drawPeriod?: string;\n  exploreDateOffset?: 0 | 1 | 2;\n  selectedStreaks: string[];\n}) {''',
    '''export function fetchTianyanList(request: {\n  lottery: NumberBallLottery;\n  drawPeriod?: string;\n  exploreDateOffset?: 0 | 1 | 2;\n  selectedStreaks: string[];\n  sameCode: boolean;\n  predictionNumber?: string;\n}) {''',
)

for old, new in [
    ('.matrix-explore-main-screen:not(.matrix-tianyan-screen) .road-results-head', '.matrix-explore-main-screen .road-results-head'),
    ('.matrix-explore-main-screen:not(.matrix-tianyan-screen) .road-results article[data-number-group-start="true"]', '.matrix-explore-main-screen .road-results article[data-number-group-start="true"]'),
    ('.matrix-explore-main-screen:not(.matrix-tianyan-screen) .road-results article:first-child', '.matrix-explore-main-screen .road-results article:first-child'),
]:
    replace_once("src/matrix-explore-spacing.css", old, new)

Path(".github/workflows/tianyan-parity-apply.yml").unlink(missing_ok=True)
Path(".github/scripts/tianyan_parity_apply.py").unlink(missing_ok=True)
