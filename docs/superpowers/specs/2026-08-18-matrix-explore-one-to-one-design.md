# Matrix Explore One-to-One Design

## Scope
- Only modify the Matrix 探索 page.
- Use the latest user-provided reference screenshots as the visual source of truth.
- Preserve all existing functionality, copy, data flow, lottery logic, navigation, title artwork, and assets.

## Layout strategy
- Use one canonical, scoped hard-layout source under `.matrix-explore-main-screen`.
- This single source may use fixed mobile geometry to reproduce the reference proportions.
- Do not add a second/third override layer.
- Remove or consolidate any pre-existing Matrix Explore rules that conflict with this canonical block.
- Do not use `!important`, negative margins, compensating transforms, or duplicate media-query patches.

## Target visual structure
1. 探索設定 card
   - Title with 4×24-ish gold title bar.
   - Three setting rows: 彩種 / 探索期數 / 版路類型.
   - Left icon, label, and control aligned to match the reference screenshots.
   - Controls use the same relative widths and row spacing as the reference.
2. 命中條件 card
   - Two equal-width hit buttons.
   - Divider below buttons.
   - 進階探索設定 row below divider.
3. 開始探索 button
   - Full available width inside page safe area.
   - Reference-like vertical spacing from cards above/below.
4. 近10期開獎號碼 card
   - Header, table header, and data rows aligned to the reference.
   - Preserve existing 5-ball / 6+1-ball behavior.
5. 重複號碼統計 card
   - Six-column grid with reference-like density and spacing.
6. Disclaimer text
   - Keep existing copy and align vertical spacing to reference.
7. 探索結果區 card
   - Keep existing result content and logic, but align heading, filter, summary, columns, and row rhythm to the reference.

## Canonical spacing targets
- Page left/right safe area: 12px.
- Main vertical section rhythm: approximately 12px between major blocks.
- Card inner padding: 12px.
- Setting row vertical spacing: 12px.
- Icon → label: 8px.
- Label → control: 8px.
- Same-row control gap: 8px.
- Hit-button gap: 8px.
- Divider spacing above/below: 12px.
- Start button gap above/below: 12px.
- Repeat-stat grid gap: 6px.
- History ball gap: approximately 6px.

## Canonical dimensions
- Setting icons: 34×34px.
- Main select height: 44px.
- Three-way setting buttons: 40px height.
- Hit-condition buttons: 44px height.
- Advanced row: 44px min-height.
- Start button: 50px height.
- History heading: 46px minimum.
- History table header: 42px.
- History rows: 46px.
- Repeat-stat cell: 54px height.
- Matrix Pro / 推薦 badges: 18px height.

## Constraints
- No new feature behavior.
- No copy changes.
- No data/API changes.
- No changes to other pages.
- Final Matrix Explore sizing and spacing must come from one canonical scoped source.
- Sync completed implementation directly to `lottery-matrix/main`.
- No deployment for this task.
