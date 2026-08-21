# Matrix Tiangong Production Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production Matrix Tiangong candidate generator, expose its completed artifacts through the existing API/PWA, and publish Explore, Tianyan, and Tiangong under one completed analysis version.

**Architecture:** Keep candidate discovery as a pure backend module that consumes normalized newest-first draw history and emits fully identified `TiangongCandidate` values. The evaluator remains responsible for final arithmetic, road naming, identity, and validity; the service converts valid results into compact list rows plus detached validation evidence. The analysis pipeline must build all three artifacts before the first write and publish the completion marker only after all three artifact writes succeed.

**Tech Stack:** TypeScript, Node.js, Vitest, React, existing Matrix analysis store and HTTP route layer

**Spec:** `docs/superpowers/specs/2026-08-21-matrix-tiangong-production-generator-design.md`

## Global Constraints

- History is newest-first and uses one-based positions: position `p` resolves to `history[p - 1]`.
- `sourceSequence` stores A/B/C/D from newest to oldest, so positions increase through the tuple. Rule verification traverses the reversed sequence (oldest to newest), making A the final prediction group.
- Source spacing `d`, first-stage distance `n1`, and second-stage distance `n2` are independent search dimensions; never introduce `n1 = d`, `n1 + n2 = d`, or an `A <= d` validity rule.
- One-stage result position is `p - n1`; two-stage intermediate position is `p - n1`; two-stage final position is `p - (n1 + n2)`.
- `準2進3` uses two validation groups plus one prediction group; `準3進4` uses three validation groups plus one prediction group.
- In two-stage mode, the same first-stage rule must hold for all `N+1` groups; only the first `N` groups validate the second stage, and the last group produces the final prediction.
- The 50/80 ranges limit only source history and complete equal-spacing source sequences. Stage-distance search is bounded by the selected prediction result period, not by 50/80.
- Reference offsets are upper 1–14, same draw, or lower draws before the final result. A stage result draw cannot also be its reference, and unavailable history positions are excluded.
- Position paths are fixed, increasing, or decreasing, traversed oldest validation group to newest prediction group. 539/Tiantian use five positions; Mark Six/Lotto use six main positions plus special number, for seven positions.
- Addition/subtraction values are `-49..49`; sum values are `1..98`; only addition value zero is classified as drag.
- Candidate discovery reverse-derives rules from known pairs and intersects later groups. It must not construct an unconditional Cartesian product of all arithmetic values, positions, offsets, and distances.
- List evidence remains detached under `validationById`. Complete-rule identity, prediction distance, position, number, and road type participate in deduplication.
- Results sort by interval, prediction distance, predicted position, road type, then stable ID.
- No database migration is required: the existing analysis store accepts generic artifact kinds and already supports `tiangong`.
- Do not deploy during this plan. Completion means committed code plus local verification only.

## File Structure

- Create `backend/matrix-tiangong-generator.ts`: pure history normalization, position paths, reverse rule derivation, one-stage search, and two-stage search.
- Create `backend/matrix-tiangong-generator.test.ts`: focused production-generator tests using confirmed draw examples and small synthetic histories.
- Modify `backend/matrix-tiangong.ts`: generalized source sequences, explicit prediction distance, structured evidence roles, and evaluator identity/validity.
- Modify `backend/matrix-tiangong.test.ts`: domain/evaluator unit tests for three- and four-source candidates.
- Modify `backend/matrix-tiangong-cases.ts` and `backend/matrix-tiangong-cases.test.ts`: replace obsolete synthetic spacing assumptions with confirmed acceptance cases.
- Modify `backend/matrix-tiangong-service.ts` and `backend/matrix-tiangong-service.test.ts`: use the production generator and emit the stable artifact contract.
- Modify `backend/matrix-analysis-pipeline.ts` and `backend/matrix-analysis-pipeline.test.ts`: build and publish all three Matrix artifacts atomically by completion marker.
- Modify `backend/matrix-ready-analysis.test.ts`: verify Tiangong is readable only when named by the marker.
- Modify `src/matrix-algorithm-api.ts`, `src/__tests__/MatrixTiangongPage.test.tsx`, and `backend/matrix-tiangong-routes.test.ts`: align API/PWA types and fixtures with `sourceSequence` and `predictionDistance`.

---

### Task 1: Generalize the Tiangong domain model

**Files:**
- Modify: `backend/matrix-tiangong.ts`
- Modify: `backend/matrix-tiangong.test.ts`

**Interfaces:**
- Produces: `TiangongSourceSequence = [number, number, number] | [number, number, number, number]`
- Produces: `enumerateEqualSpacingSequences(periodRange: 50 | 80, hitCondition: TiangongHitCondition): TiangongSourceSequence[]`
- Produces: `TiangongValidationRole = 'first-stage-evidence' | 'second-stage-validation' | 'prediction'`
- Produces: `TiangongCandidate.sourceSequence`, structured `validationRows`, and evaluator-derived `TiangongResult.predictionDistance`
- Consumes: existing `normalizeMatrixNumber` and `MatrixLottery`

- [ ] **Step 1: Replace triple-only enumeration tests with sequence-length tests**

```ts
it('enumerates three sources for 準2進3 and four for 準3進4', () => {
  expect(enumerateEqualSpacingSequences(50, '準2進3')).toContainEqual([1, 8, 15]);
  expect(enumerateEqualSpacingSequences(50, '準3進4')).toContainEqual([1, 8, 15, 22]);
  expect(enumerateEqualSpacingSequences(50, '準3進4'))
    .not.toContainEqual([1, 18, 35, 52]);
});
```

- [ ] **Step 2: Add evaluator tests proving distance independence and prediction metadata**

```ts
const candidate: TiangongCandidate = {
  lottery: '今彩539',
  periodRange: 50,
  sourceSequence: [5, 12, 19],
  mode: 'one-stage',
  hitCondition: '準2進3',
  exploreDirection: '固定',
  baseNumber: 24,
  firstStage: { startPosition: 2, direction: '依序遞增', algorithmType: '加減', value: 2, nextN: 5 },
  validationRows: [],
};
expect(evaluateTiangongCandidate(candidate)).toMatchObject({
  valid: true,
  interval: 7,
  predictionDistance: 1,
  predictionNumber: '26',
});
```

- [ ] **Step 3: Run the focused test and confirm the old API fails**

Run: `npm run test:unit -- backend/matrix-tiangong.test.ts`

Expected: FAIL because `enumerateEqualSpacingSequences`, `sourceSequence`, and `predictionDistance` do not exist.

- [ ] **Step 4: Implement generalized sequences and evaluator metadata**

```ts
export type TiangongSourceSequence =
  | [number, number, number]
  | [number, number, number, number];

export function enumerateEqualSpacingSequences(
  periodRange: 50 | 80,
  hitCondition: TiangongHitCondition,
): TiangongSourceSequence[] {
  const length = hitCondition === '準2進3' ? 3 : 4;
  const sequences: TiangongSourceSequence[] = [];
  for (let first = 1; first <= periodRange; first += 1) {
    for (let d = 1; first + (length - 1) * d <= periodRange; d += 1) {
      sequences.push(Array.from({ length }, (_, index) => first + index * d) as TiangongSourceSequence);
    }
  }
  return sequences;
}
```

Update validation so the sequence length must match the hit condition, every adjacent difference equals `d`, and the maximum source position is within the selected range. Remove `availableFuturePeriods` and its incorrect upper-bound check. Derive `predictionDistance` as `n1 - sourceSequence[0] + 1` for one-stage mode or `n1 + n2 - sourceSequence[0] + 1` for two-stage mode, and reject a value below 1 as `PREDICTION_NOT_FUTURE`. Include `sourceSequence`, the derived prediction distance, and all stage fields in `ruleIdentity`. Add `predictionDistance` to `TiangongResult`; do not accept it as caller-supplied candidate data.

Replace the open-ended evidence record with these explicit contracts:

```ts
export type TiangongValidationRole =
  | 'first-stage-evidence'
  | 'second-stage-validation'
  | 'prediction';

export type TiangongStageEvidence = {
  distance: number;
  position: number;
  algorithmType: TiangongAlgorithmType;
  value: number;
  inputNumber: number;
  outputNumber: number;
  actualNumber?: number;
  hit?: boolean;
};

export type TiangongValidationRow = {
  role: TiangongValidationRole;
  group: 'A' | 'B' | 'C' | 'D';
  sourcePosition: number;
  sourcePeriod: string;
  sourceNumbers: number[];
  referenceOffset: number;
  referencePosition: number;
  referencePeriod: string;
  referenceBallPosition: number;
  baseNumber: number;
  firstStage: TiangongStageEvidence;
  secondStage?: TiangongStageEvidence;
  resultPeriod: string;
  resultNumbers?: number[];
  predictionDistance?: number;
};
```

- [ ] **Step 5: Run domain tests**

Run: `npm run test:unit -- backend/matrix-tiangong.test.ts`

Expected: PASS, including `d = 7` with `n1 = 5` and a two-stage candidate where `d = 4`, `n1 = 9`, `n2 = 5`.

- [ ] **Step 6: Commit the domain change**

```bash
git add backend/matrix-tiangong.ts backend/matrix-tiangong.test.ts
git commit -m "refactor(api): generalize Tiangong source sequences"
```

---

### Task 2: Add generator primitives and one-stage production search

**Files:**
- Create: `backend/matrix-tiangong-generator.ts`
- Create: `backend/matrix-tiangong-generator.test.ts`
- Modify: `backend/matrix-tiangong-cases.ts`
- Modify: `backend/matrix-tiangong-cases.test.ts`

**Interfaces:**
- Produces: `runTiangongCandidates(lottery: MatrixLottery, history: MatrixDraw[], options?: TiangongSearchOptions): TiangongCandidate[]`
- Produces: `enumeratePositionPaths(positionCount: number, groupCount: 3 | 4): PositionPath[]`
- Produces: `deriveTiangongRules(base: number, target: number, maximum: 39 | 49): DerivedRule[]`
- Produces: `resolveHistoryPosition(history: MatrixDraw[], oneBasedPosition: number): MatrixDraw | undefined`
- Produces: `enumerateReferencePositions(sourcePosition: number, finalDistance: number, historyLength: number): number[]`
- Consumes: Task 1 `TiangongCandidate`, `TiangongSourceSequence`, and `enumerateEqualSpacingSequences`

- [ ] **Step 1: Write primitive tests for directions and reverse-derived rules**

Define the generator-local primitives used by every search layer:

```ts
export type PositionPath = {
  startPosition: number;
  direction: TiangongDirection;
  positionsOldestToNewest: number[];
};

export type DerivedRule = Pick<TiangongStage, 'algorithmType' | 'value'>;

export type TiangongSearchOptions = {
  periodRanges?: Array<50 | 80>;
  modes?: Array<'one-stage' | 'two-stage'>;
  hitConditions?: TiangongHitCondition[];
  sourceSequences?: TiangongSourceSequence[];
  referenceOffsets?: number[];
  explorePaths?: PositionPath[];
  firstStagePaths?: PositionPath[];
  secondStagePaths?: PositionPath[];
  firstStageDistances?: number[];
  secondStageDistances?: number[];
};
```

```ts
expect(enumeratePositionPaths(5, 3)).toContainEqual({
  startPosition: 3,
  direction: '依序遞增',
  positionsOldestToNewest: [3, 4, 5],
});
expect(enumeratePositionPaths(5, 4)).not.toContainEqual(expect.objectContaining({
  positionsOldestToNewest: [3, 4, 5, 6],
}));
expect(deriveTiangongRules(24, 26, 39)).toEqual(expect.arrayContaining([
  { algorithmType: '加減', value: 2 },
  { algorithmType: '合值', value: 50 },
]));
```

- [ ] **Step 2: Add the confirmed one-stage acceptance fixture**

Build a newest-first `MatrixDraw[]` containing periods `114215` through `114233`, then expose a test-only search configuration that selects source periods `114215/114222/114229`, `n1 = 5`, and the required positions. Assert that the generated candidate records:

```ts
expect(candidate).toMatchObject({
  sourceSequence: [5, 12, 19],
  firstStage: { nextN: 5 },
});
expect(evaluateTiangongCandidate(candidate).predictionDistance).toBe(1);
expect(candidate.validationRows.map((row) => row.resultPeriod))
  .toEqual(['114220', '114227', '114234']);
```

The source positions above are relative to latest period `114233`; the test must locate periods by value rather than silently relying on this literal tuple.

- [ ] **Step 3: Run the generator tests and confirm missing-module failure**

Run: `npm run test:unit -- backend/matrix-tiangong-generator.test.ts backend/matrix-tiangong-cases.test.ts`

Expected: FAIL because the production generator and generalized acceptance helpers are absent.

- [ ] **Step 4: Implement normalized history and position-path primitives**

```ts
type NormalizedDraw = {
  period: string;
  numbers: number[];
};

function normalizeHistory(lottery: MatrixLottery, history: MatrixDraw[]): NormalizedDraw[] {
  const count = lottery === '今彩539' || lottery === '天天樂' ? 5 : 7;
  return history.map((draw) => {
    const source = draw.drawOrderNumbers?.length === count ? draw.drawOrderNumbers : draw.numbers;
    if (source.length !== count) throw new Error('INVALID_MATRIX_DRAW');
    return { period: draw.period, numbers: source.map(Number) };
  });
}
```

`enumeratePositionPaths` must create only paths whose every one-based position remains between 1 and `positionCount`. Keep traversal order oldest-to-newest while `sourceSequence` itself remains newest-to-oldest.

- [ ] **Step 5: Implement reverse derivation without arithmetic Cartesian products**

For a known base/target pair, return only the small exact set of cyclic addition and sum representations:

```ts
function deriveTiangongRules(base: number, target: number, maximum: 39 | 49): DerivedRule[] {
  const positiveDelta = ((target - base) % maximum + maximum) % maximum;
  const signed = positiveDelta > maximum / 2 ? positiveDelta - maximum : positiveDelta;
  const addValues = signed === 0 ? [0] : [signed, signed > 0 ? signed - maximum : signed + maximum]
    .filter((value) => value >= -49 && value <= 49);
  const sumValues = [base + target - maximum, base + target, base + target + maximum]
    .filter((value) => value >= 1 && value <= 98);
  return dedupeRules([
    ...addValues.map((value) => ({ algorithmType: '加減' as const, value })),
    ...sumValues.map((value) => ({ algorithmType: '合值' as const, value })),
  ]);
}
```

Verify every returned rule by applying the existing Matrix normalization before retaining it.

- [ ] **Step 6: Implement exact reference-position bounds**

For source position `p` and one-stage final distance `n1`, enumerate only:

```ts
const upper = range(1, 14).map((k) => p + k);
const same = [p];
const lowerBeforeResult = range(1, n1 - 1).map((k) => p - k);
return [...upper, ...same, ...lowerBeforeResult]
  .filter((q) => q >= 1 && q <= historyLength && q !== p - n1);
```

For two-stage candidates use final distance `n1 + n2` in the same function. This keeps the reference search independent of `d`, excludes the final result, and never fabricates unavailable future draws.

- [ ] **Step 7: Implement the one-stage layered search**

For each hit condition, source range, equal-spaced source sequence, reference offset, source-position path, result-position path, and legal independent `n1`, let A be `sourceSequence[0]` at position `a` and the immediately older validation source be at `a + d`. Enumerate the finite range `a <= n1 < a + d`: A produces a future result while the older groups retain historical results.

Then:

1. Resolve the first validation group’s source/reference/result draws.
2. Reverse-derive only rules that transform its base number into its known result number.
3. Intersect those rules against the remaining validation groups.
4. Apply the surviving rule to the prediction group.
5. Retain it only when `predictionDistance = n1 - predictionSourcePosition + 1` is positive and every reference/result used for validation resolves to existing history.
6. Traverse the reversed source sequence; emit `first-stage-evidence` for the oldest N validation groups and `prediction` for final group A.

Use a small optional internal `TiangongSearchOptions` parameter only in tests to restrict ranges, modes, hit conditions, offsets, paths, and distances. Production calls omit it and enumerate the complete legal space.

- [ ] **Step 8: Run one-stage and acceptance tests**

Run: `npm run test:unit -- backend/matrix-tiangong-generator.test.ts backend/matrix-tiangong-cases.test.ts`

Expected: PASS and the confirmed `d = 7`, `n1 = 5` fixture produces `114220/114227/114234` without any equality between `d` and `n1`.

- [ ] **Step 9: Commit the one-stage generator**

```bash
git add backend/matrix-tiangong-generator.ts backend/matrix-tiangong-generator.test.ts backend/matrix-tiangong-cases.ts backend/matrix-tiangong-cases.test.ts
git commit -m "feat(api): generate one-stage Tiangong candidates"
```

---

### Task 3: Implement the two-stage layered search

**Files:**
- Modify: `backend/matrix-tiangong-generator.ts`
- Modify: `backend/matrix-tiangong-generator.test.ts`
- Modify: `backend/matrix-tiangong-cases.ts`
- Modify: `backend/matrix-tiangong-cases.test.ts`

**Interfaces:**
- Extends: `runTiangongCandidates(...)` with `mode: 'two-stage'`
- Produces: first-stage evidence for `N+1` groups, second-stage validation for the first `N`, and final prediction for the last group
- Consumes: Task 2 normalized draws, position paths, rule derivation, and test-only search restrictions

- [ ] **Step 1: Add the confirmed independent-distance two-stage acceptance test**

Use the supplied 539 history and restrict the test search to source periods `114212/114216/114220`, first-stage `n1 = 9`, second-stage `n2 = 5`, and the documented positions/rules. Assert:

```ts
expect(candidate).toMatchObject({
  mode: 'two-stage',
  firstStage: { nextN: 9 },
  secondStage: { nextN: 5 },
});
expect(candidate.sourceSequence[1] - candidate.sourceSequence[0]).toBe(4);
expect(candidate.firstStage.nextN + candidate.secondStage!.nextN).toBe(14);
expect(candidate.validationRows.filter((row) => row.role === 'first-stage-evidence')).toHaveLength(3);
expect(candidate.validationRows.filter((row) => row.role === 'second-stage-validation')).toHaveLength(2);
expect(candidate.validationRows.filter((row) => row.role === 'prediction')).toHaveLength(1);
```

- [ ] **Step 2: Add a 準3進4 role-count test**

Create a compact synthetic history with four equal-spaced source groups. Restrict the search to one known two-stage rule and assert four first-stage evidence rows, three second-stage validation rows, and one prediction row. Also mutate A’s known first-stage intermediate value and assert that no candidate survives.

- [ ] **Step 3: Run focused tests and confirm two-stage failure**

Run: `npm run test:unit -- backend/matrix-tiangong-generator.test.ts backend/matrix-tiangong-cases.test.ts`

Expected: FAIL because the runner only emits one-stage candidates.

- [ ] **Step 4: Implement first-stage establishment for all N+1 groups**

Enumerate `n1` independently. Require every prediction group’s first-stage intermediate position `p - n1` to resolve to an existing draw because the first-stage rule must be established before second-stage prediction. Reverse-derive from the oldest group, intersect through all `N+1` groups, and retain only a single identical full first-stage rule across them.

- [ ] **Step 5: Implement second-stage validation and final prediction**

For each surviving first-stage rule, independently enumerate positive `n2` values and second-stage position paths. With A at position `a` and the immediately older source at `a + d`, enumerate only pairs satisfying `1 <= n1 < a` and `a <= n1 + n2 < a + d`: A’s intermediate result is known, A’s final result is future, and every older validation final is known. Reverse-derive the second-stage rule from the oldest validation group’s intermediate/result pair, intersect across the remaining `N-1` validation groups, then apply it to A’s intermediate value. Retain only candidates satisfying:

```ts
const predictionDistance = n1 + n2 - predictionSourcePosition + 1;
const predictsFuture = predictionDistance > 0;
const priorFinalResultsKnown = validationSources.every((p) => p - (n1 + n2) >= 1);
```

Do not compare either stage distance or their sum with source spacing `d`.

- [ ] **Step 6: Store explicit evidence roles**

For each group, write a structured evidence object including source period/numbers, reference offset/period/position/base number, stage distance/position/algorithm/value/calculation, actual result draw where known, and hit status. The prediction group contains both its known `first-stage-evidence` and a separate `prediction` row; it must never be marked as a second-stage hit.

- [ ] **Step 7: Run two-stage tests**

Run: `npm run test:unit -- backend/matrix-tiangong-generator.test.ts backend/matrix-tiangong-cases.test.ts backend/matrix-tiangong.test.ts`

Expected: PASS for `d = 4`, `n1 = 9`, `n2 = 5`, and for both hit-condition role counts.

- [ ] **Step 8: Commit the two-stage generator**

```bash
git add backend/matrix-tiangong-generator.ts backend/matrix-tiangong-generator.test.ts backend/matrix-tiangong-cases.ts backend/matrix-tiangong-cases.test.ts
git commit -m "feat(api): generate two-stage Tiangong candidates"
```

---

### Task 4: Wire the production generator into Tiangong artifacts

**Files:**
- Modify: `backend/matrix-tiangong-service.ts`
- Modify: `backend/matrix-tiangong-service.test.ts`

**Interfaces:**
- Produces: `buildTiangongArtifact(lottery, drawPeriod, history): TiangongArtifact`
- Produces: `TiangongArtifactRow.sourceSequence`, `predictionDistance`, and detached `TiangongValidation`
- Consumes: Task 3 `runTiangongCandidates`

- [ ] **Step 1: Update service tests to require the production contract**

```ts
expect(artifact.items[0]).toMatchObject({
  sourceSequence: [5, 12, 19],
  interval: 7,
  predictionDistance: 3,
});
expect(artifact.items[0]).not.toHaveProperty('sourceTriple');
expect(artifact.validationById[artifact.items[0].id].validationRows)
  .toEqual(expect.arrayContaining([expect.objectContaining({ role: 'prediction' })]));
```

Retain a narrow injected runner option in unit tests only by accepting an optional fourth parameter defaulting to `runTiangongCandidates`.

- [ ] **Step 2: Add ordering and 50/80 eligibility tests**

Provide candidates out of order and assert sorting by interval, prediction distance, predicted position, road type, and stable ID. Assert `eligiblePeriodRange` is 50 only when the maximum `sourceSequence` position is at most 50; otherwise it is 80.

- [ ] **Step 3: Run service tests and confirm schema failure**

Run: `npm run test:unit -- backend/matrix-tiangong-service.test.ts`

Expected: FAIL because the service still requires a runner and emits `sourceTriple` without prediction distance.

- [ ] **Step 4: Implement artifact conversion and production default**

```ts
export function buildTiangongArtifact(
  lottery: MatrixLottery,
  drawPeriod: string,
  history: MatrixDraw[],
  runCandidates: TiangongCandidateRunner = runTiangongCandidates,
): TiangongArtifact
```

Build a stable signature from `ruleIdentity`, `predictionDistance`, predicted position, prediction number, and road type. Store compact item rows and detached evidence keyed by stable ID. Determine range eligibility from `Math.max(...candidate.sourceSequence)`.

- [ ] **Step 5: Run service tests**

Run: `npm run test:unit -- backend/matrix-tiangong-service.test.ts backend/matrix-tiangong-generator.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit artifact integration**

```bash
git add backend/matrix-tiangong-service.ts backend/matrix-tiangong-service.test.ts
git commit -m "feat(api): build Tiangong production artifacts"
```

---

### Task 5: Publish Tiangong in the atomic Matrix analysis version

**Files:**
- Modify: `backend/matrix-analysis-pipeline.ts`
- Modify: `backend/matrix-analysis-pipeline.test.ts`
- Modify: `backend/matrix-ready-analysis.test.ts`

**Interfaces:**
- Adds dependency: `buildTiangong(lottery: LotteryId, drawPeriod: string, history: MatrixDraw[]): TiangongArtifact`
- Produces marker data: `{ artifactKinds: ['explore', 'tianyan', 'tiangong'] }`
- Consumes: Task 4 `buildTiangongArtifact`

- [ ] **Step 1: Add a success-path pipeline test**

```ts
expect(buildOrder).toEqual(['explore', 'tianyan', 'tiangong']);
expect(published.map((entry) => entry.meta.kind))
  .toEqual(['explore', 'tianyan', 'tiangong', 'status']);
expect(published.at(-1)?.data).toEqual({
  artifactKinds: ['explore', 'tianyan', 'tiangong'],
});
```

- [ ] **Step 2: Add build and publish failure tests**

Test that a Tiangong build exception produces zero writes because all artifacts are built before publishing. Test that a Tiangong publish exception may leave artifact rows written but never writes a new status marker, so readers stay on the prior complete version.

- [ ] **Step 3: Add ready-analysis marker coverage**

Assert `readReadyAnalysis('tiangong', ...)` returns null when the marker omits Tiangong and returns the artifact only when the marker’s `artifactKinds` contains `tiangong` under the same analysis version.

- [ ] **Step 4: Run pipeline tests and confirm missing dependency failure**

Run: `npm run test:unit -- backend/matrix-analysis-pipeline.test.ts backend/matrix-ready-analysis.test.ts`

Expected: FAIL because the pipeline currently builds and publishes only Explore and Tianyan.

- [ ] **Step 5: Build all artifacts before the first publication**

```ts
const explore = dependencies.buildExplore(lottery, drawPeriod, history);
const tianyan = dependencies.buildTianyan(lottery, drawPeriod, explore);
const tiangong = dependencies.buildTiangong(lottery, drawPeriod, history);
```

Then publish Explore, Tianyan, Tiangong, and finally status with all three artifact kinds. Include `tiangongItems` in the pipeline result.

- [ ] **Step 6: Run pipeline and readiness tests**

Run: `npm run test:unit -- backend/matrix-analysis-pipeline.test.ts backend/matrix-ready-analysis.test.ts`

Expected: PASS with no marker written on either build or artifact-publication failure.

- [ ] **Step 7: Commit atomic pipeline integration**

```bash
git add backend/matrix-analysis-pipeline.ts backend/matrix-analysis-pipeline.test.ts backend/matrix-ready-analysis.test.ts
git commit -m "feat(api): publish Tiangong with Matrix analysis versions"
```

---

### Task 6: Align HTTP and PWA contracts

**Files:**
- Modify: `src/matrix-algorithm-api.ts`
- Modify: `backend/matrix-tiangong-routes.test.ts`
- Modify: `src/__tests__/MatrixTiangongPage.test.tsx`
- Modify: `src/FeaturePages.tsx` only if structured validation evidence needs explicit labels

**Interfaces:**
- Produces: `TiangongApiRow.sourceSequence: number[]`
- Produces: `TiangongApiRow.predictionDistance: number`
- Preserves: list filters, entitlement handling, one-stage omission of second-stage filters, and validation detail endpoint

- [ ] **Step 1: Update route response fixtures and assertions**

```ts
expect(response.body.items[0]).toMatchObject({
  sourceSequence: expect.any(Array),
  predictionDistance: expect.any(Number),
});
```

Keep authorization, plan entitlement, range, mode, direction, road, and validation lookup assertions unchanged.

- [ ] **Step 2: Update PWA API types and page fixture**

Replace `sourceTriple: [number, number, number]` with `sourceSequence: number[]` and add `predictionDistance: number`. The results card continues to show interval, predicted position, prediction number, and road type; it does not add recent-ten or consecutive-hit controls.

- [ ] **Step 3: Add validation-role rendering assertions**

When opening validation details, assert the UI exposes readable role labels for first-stage evidence, second-stage validation, and prediction. If the existing generic renderer already includes these values, keep `FeaturePages.tsx` unchanged; otherwise map the role codes to `第一段成立`, `第二段驗證`, and `最終預測` in the validation panel.

- [ ] **Step 4: Run route and PWA tests**

Run: `npm run test:unit -- backend/matrix-tiangong-routes.test.ts src/__tests__/MatrixTiangongPage.test.tsx`

Expected: PASS with the new schema and unchanged entitlement/filter behavior.

- [ ] **Step 5: Commit contract alignment**

```bash
git add src/matrix-algorithm-api.ts backend/matrix-tiangong-routes.test.ts src/__tests__/MatrixTiangongPage.test.tsx src/FeaturePages.tsx
git commit -m "refactor(app): align Tiangong result contracts"
```

Before committing, omit `src/FeaturePages.tsx` from `git add` if Step 3 proved no change was necessary.

---

### Task 7: Full verification and acceptance audit

**Files:**
- Modify only files required by failures that are directly caused by Tasks 1–6

**Interfaces:**
- Verifies: backend generator, API routes, PWA, artifacts, readiness marker, and production build as one integrated change

- [ ] **Step 1: Search for obsolete source and spacing assumptions**

Run:

```bash
rg -n "sourceTriple|enumerateEqualSpacingTriples|availableFuturePeriods|n1\s*\+\s*n2\s*=|firstStage.*=\s*d|A\s*<=\s*d|p\s*-\s*d" backend src docs/superpowers/plans
```

Expected: no executable-code matches for obsolete assumptions. Historical design discussion may remain only if explicitly marked obsolete; the current spec and implementation plan must not prescribe them.

- [ ] **Step 2: Run all focused Tiangong tests**

Run:

```bash
npm run test:unit -- backend/matrix-tiangong.test.ts backend/matrix-tiangong-generator.test.ts backend/matrix-tiangong-cases.test.ts backend/matrix-tiangong-service.test.ts backend/matrix-tiangong-routes.test.ts backend/matrix-analysis-pipeline.test.ts backend/matrix-ready-analysis.test.ts src/__tests__/MatrixTiangongPage.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run the complete unit suite**

Run: `npm run test:unit`

Expected: PASS with no regression in Explore, Tianyan, subscriptions, custom triggers, or Matrix routes.

- [ ] **Step 4: Run site-level tests**

Run: `npm run test:sites`

Expected: PASS.

- [ ] **Step 5: Build the application**

Run: `npm run build`

Expected: exit code 0 with no TypeScript or bundler error.

- [ ] **Step 6: Validate the deployable artifact without deploying**

Run: `npm run validate:artifact`

Expected: PASS. Do not invoke AppDeploy or any hosting command.

- [ ] **Step 7: Review the confirmed acceptance evidence**

Confirm test output includes:

- one-stage source spacing 7 with first-stage distance 5;
- two-stage source spacing 4 with first-stage distance 9 and second-stage distance 5;
- 50/80 source-only bounds;
- correct `準2進3` and `準3進4` role counts;
- three-artifact completion marker and failure fallback behavior.

- [ ] **Step 8: Record final repository state**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: clean working tree and the task commits visible. Report that deployment has not been performed.
