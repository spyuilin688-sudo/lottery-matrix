# CSS canonical cleanup — 2026-09-14

Scope: all production `src/**/*.css` (32 starting files), the CSS imports in `src/main.tsx`, and directly related tests. Admin CSS is tracked by the parent review. Initial audit baseline: main `28fbac6e1d1340f9e47f4ffcdcb446e8e0bb8c18`, source blobs verified before editing. The final integration base is newer main `4d5bc44`; its legacy notebook-record removal is preserved as described below. No image binary was deleted or changed.

## Results

| Measure | Initial baseline | Cleanup snapshot | Integrated 4d5bc44 |
|---|---:|---:|---:|
| CSS files | 32 | 28 | 28 |
| Parsed rule blocks | 1878 | 1811 | 1716 |
| Important declarations | 12 | 2 | 2 |
| Fixed pixel size declarations | 466 | 452 | 419 |
| Transforms / scale / negative geometry candidates | 79 | 78 | 77 |
| Overflow / clip / object-fit declarations | 153 | 150 | 149 |
| Repeated exact selector-group + conditional-context identities | 62 | 3 | 3 |

The machine inventory in [css-inventory.json](css-inventory.json) lists every matched declaration with source line, selector, value and media context before/after, all comma-split repeated selectors, and specificity candidates. It distinguishes visual variants, animation, scrollers and asset optics from accidental overrides. CSS files were parsed rather than searched only for names containing “patch”.

## Canonical ownership changes

| Finding | Root fix / retained final behavior |
|---|---|
| Notification styles split over three files | `feature-page-adjustments.css` owns final 8px content gap, 29px bulk height, 600 heading weight, 21px time-select height, 12/11px frame radii, 1px time-row gap, gold selected text and gray empty text. Deleted the visual/mobile patch files. |
| Notification list expanded through negative margins | Body owns the 16px list inset; bulk actions add the positive 2px difference to reach 18px. List uses margin 0. Rendered list/control widths stay equivalent. |
| Result inset variable overwritten by a 6-line file | Moved final `-26px` formula into `matrix-explore-spacing.css`; deleted `matrix-explore-result-13px.css`. Merged actual final result-panel width 100% into its original rule. General/result insets remain 16px/13px. |
| Responsive sheet imported directly and recursively | Kept the recursive import at `matrix-explore-spacing.css`, removed duplicate main import. It retains the last effective source position after TongXing. |
| Profile width patch | Moved unchanged `calc(100% + 20px)` / `-10px` into existing membership-stack owner in `feature-pages.css`; deleted the patch import/file. Asset geometry exception is explained below. |
| Transfer grid used important to beat generic rows | Generic two-column declaration now excludes the semantic bank row. Bank row owns its three columns normally. Merged final compact dimensions (28px copy, 36px input, 34px submit) from mobile patch into component rules. |
| Numeric record fields used seven important declarations | Initial cleanup removed priority escalation. New main `4d5bc44` retires the entire old record component and its styles; integration preserves those deletions, so the numeric field and its exclusion selector no longer exist. The live Matrix notebook remains. |
| Four runtime cursor-important rules | Removed redundant active/type rules. Two retained cursor rules implement the existing device-emulator cursor and explicit cursor-debug mode. They are not product layout overrides. |
| Duplicate base/refined selectors throughout shared sheet | Removed superseded properties and combined complementary rules for select boxes, result headings, validation labels, filter options, profile menus, notebook header controls and old notification rows. The initially merged weekly-summary rules were subsequently removed with upstream record retirement. |
| Old notification responsive rules in unrelated tool sheet | Legacy notifications are still exported/routed; kept the UI and merged final dimensions into their non-v2 canonical rules in `feature-pages.css`. No claim that these routes are dead. |
| Pro-plan visual geometry in shared and specific files | Moved final plan-specific type and geometry into `pro-plans-layout.css`, retained carousel pagination backgrounds in their separate renderer. |
| Homepage status border painted then cancelled | Base status-section rule now owns the final transparent, borderless surface and current dimensions. Base also owns accepted status-card paint and homepage gaps; removed competing visual-language blocks. State-dependent tone/pressed/focus selectors remain semantic variants. |
| Device white background cancelled in prototype sheet | Existing `styles.css` device rule now uses the dark runtime token; removed prototype repaint. |
| Matrix default variables separated from responsive owner | Moved existing variables into the existing Matrix screen rule in `matrix-explore-spacing.css`; values unchanged. |
| Tianyan summary position declared separately | Existing summary rule in `explore-result-preview.css` now owns relative positioning. Expanded-specific rows remain in their existing component file. |
| Static positioning lived in JSX | Parent removes static inline positions; `reference-window` / its row own relative/absolute position in CSS. Dynamic height/top remain data-derived. Tiangong summary spacer owns visibility in result CSS. |
| Portaled old tool settings lost token inheritance | Existing select token declarations use one grouped scope for feature screen/history filter/TongXing query. Parent may remove fixed inline tokens while retaining dynamic top. |

## Exhaustive file pass

Counts below are after integration with main `4d5bc44`; deleted files have zero. Every fixed-size/cropping/geometry match is expanded in the JSON inventory.

| File | Rules | ! | Geometry | Fixed size | Crop/overflow |
|---|---:|---:|---:|---:|---:|
| `src/activation-code-layout.css` | 16 | 0 | 1 | 9 | 0 |
| `src/design-tokens.css` | 1 | 0 | 0 | 0 | 0 |
| `src/dialog/app-dialog.css` | 24 | 0 | 3 | 7 | 1 |
| `src/explore-result-preview.css` | 111 | 0 | 5 | 12 | 6 |
| `src/explore-validation-protection.css` | 4 | 0 | 0 | 0 | 0 |
| `src/feature-page-adjustments.css` | 98 | 0 | 6 | 31 | 11 |
| `src/feature-page-load-state.css` | 5 | 0 | 0 | 0 | 0 |
| `src/feature-pages.css` | 843 | 0 | 30 | 233 | 63 |
| `src/homepage/base.css` | 59 | 0 | 4 | 15 | 16 |
| `src/homepage/free-statement.css` | 3 | 0 | 0 | 0 | 0 |
| `src/homepage/logo-spacing.css` | 4 | 0 | 0 | 0 | 3 |
| `src/homepage/lottery-switcher.css` | 21 | 0 | 0 | 3 | 4 |
| `src/homepage/visual-language.css` | 8 | 0 | 0 | 0 | 0 |
| `src/homepage-repair.css` | 0 | 0 | 0 | 0 | 0 |
| `src/line-pwa-return-fallback.css` | 8 | 0 | 2 | 0 | 0 |
| `src/matrix-explore-result-13px.css` | 0 | 0 | 0 | 0 | 0 |
| `src/matrix-explore-result-refinements.css` | 5 | 0 | 0 | 0 | 0 |
| `src/matrix-explore-spacing.css` | 155 | 0 | 5 | 32 | 12 |
| `src/matrix-tiangong-results.css` | 26 | 0 | 0 | 3 | 1 |
| `src/matrix-tianheng.css` | 5 | 0 | 0 | 0 | 0 |
| `src/mobile-layout-polish.css` | 0 | 0 | 0 | 0 | 0 |
| `src/notification-visual-refinement.css` | 0 | 0 | 0 | 0 | 0 |
| `src/number-ball.css` | 43 | 0 | 8 | 0 | 1 |
| `src/number-reference-visual-refinement.css` | 11 | 0 | 0 | 1 | 0 |
| `src/pro-plans-carousel-peek.css` | 4 | 0 | 0 | 0 | 0 |
| `src/pro-plans-layout.css` | 18 | 0 | 0 | 8 | 0 |
| `src/profile-card-visible-width.css` | 0 | 0 | 0 | 0 | 0 |
| `src/prototype.css` | 29 | 0 | 1 | 12 | 9 |
| `src/responsive-feature-pages.css` | 60 | 0 | 2 | 17 | 2 |
| `src/styles.css` | 101 | 2 | 10 | 31 | 17 |
| `src/tianyan-expanded-layout-patch.css` | 8 | 0 | 0 | 0 | 0 |
| `src/tongxing-compact.css` | 46 | 0 | 0 | 5 | 3 |

## Remaining repeated exact rule identities

| Identity | Why the remaining declarations are separate |
|---|---|
| `:root` | `design-tokens.css` owns semantic palette/layout tokens; `styles.css` owns document typography/rendering and the runtime canvas maximum. Distinct properties, no override fight. |
| `.home-screen .latest-draw-card` | `base.css` owns card box/paint; `number-ball.css` owns only the dedicated special-ball size variable. Distinct component responsibilities. |
| `.pro-plans-screen .plan-carousel` | Layout file owns geometry/scroll behavior; carousel-peek file owns the non-repeating pagination-dot background and selection-specific paint. No overlapping declaration. |

Comma-group membership causes additional repeated *complete* selectors (e.g. a shared layout group plus a lottery/state variant). These are retained where properties or conditions are complementary. The JSON records every such occurrence, including high-specificity candidates, rather than treating a comma group as a single selector. Repeated media thresholds are likewise retained for disjoint component/state rules: 350px and 360px typography/geometry, 359.98px exploration layout, 40rem exploration/Tiangong label columns, 768px desktop homepage flow, reduced motion, hover, forced colors and print. No retained breakpoint value was changed; the retired record form’s 370px block was deleted by upstream.

## Geometry, fixed sizes and cropping dispositions

- **Preserved membership artwork optics:** JSX uses the 1563×1006 raster through SVG viewBoxes, including top crop 48px and the 1563×692 visible composition, masked sample data and independently placed live content. Parent measured production at a 430px canvas: stack 418px, margin -10px, viewBox `0 48 1563 692`. The 20px expansion compensates the image's inset frame rails; deleting it would visibly shrink/reposition all cqw content. Original raster is not available in this local checkout, so exact painted alpha bounds were not independently re-measured. Existing masks/slices were preserved, not added.
- **Preserved optical coordinates:** NumberBall sprite/value centering, lottery-specific 2px/3px baseline shifts, history special-label centering, approved homepage draw-meta/history-link offsets and status-logo coordinates are visual alignment rules for existing assets. Card/media sizes use contain or aspect-ratio where present. Avatar alone intentionally uses cover. No image aspect ratio or source URL changed.
- **Preserved documented gutters / column allocation:** Status list's -3px breakout corresponds to the maintained 13px status-card contract; result last-column extra width/margin allocates the explicit added 6px to the rightmost result column. These existing coordinate contracts are recorded, not silently removed. Notification list's negative expansion was resolved because its independent inner gutters had an equivalent natural layout.
- **Preserved semantic motion:** Toggle thumb travel, expanded chevron rotation, modal/accordion entry, carousel overdrag and pressed-action motion encode state or pointer interaction. Reduced-motion variants remain. They are not compensatory static layout patches.
- **Preserved deliberate spacing:** Existing AppDialog description -4px margin, activation copy scale .9 and result-tag overlap have no competing override owner after this pass. They are held at current values pending separate visual approval; this review does not claim they are ideal layout choices.
- **Preserved accessibility primitives:** -1px screen-reader-only labels use the established visually hidden pattern. Offsets in cursor/keyboard/navigation chrome belong to the emulated device runtime.
- **Fixed pixel candidates:** Dense controls, icon boxes, row heights and 44px touch hit areas are component geometry, not fixed viewport widths. Document/page/screen owners retain min-width:0, fluid widths and their existing scroll containment. No mass conversion of 28–54px data rows or artwork coordinates was made.
- **Cropping candidates:** Overflow hidden/clip is used for app viewport ownership, rounded/segmented borders, animation containment, ellipsis, sprite bounds and trusted SVG crops. Actual data scrollers retain auto scrolling, and protected print suppression remains. No new clipping mask, pseudo-element overlay or compensatory transform was added.
- **Legacy selectors:** Old notifications and the live Matrix notebook retain their source exports/routes. Upstream `4d5bc44` explicitly removes the separate legacy record pages; their form, card, weekly-summary, number-group and detail styles remain deleted. Four retired CSS entry files have no production import. No component was removed solely because its name appeared old.

## Verification and limits

- PostCSS successfully parses every remaining `src/**/*.css` file. Source inventory scans each rule/declaration and conditional context before/after.
- `node --test tests/css-canonical-cleanup.test.mjs tests/notification-visual-hierarchy.test.mjs tests/profile-card-visible-width.test.mjs tests/matrix-explore-result-inline-spacing.test.mjs tests/pro-plans-canonical-gutters.test.mjs tests/homepage-status-layout.test.mjs`: **22/22 pass**. Explicit files only; no full suite.
- Related profile test now checks the canonical owner and fixes pre-existing double-escaped regular expressions; notification and Pro-plan checks follow the new owners while preserving accepted values.
- Parent's production browser baseline: 430px canvas gives notification list width 398px, gap 8px, bulk height 29px; bulk font weight stays 700. These production measurements are baseline evidence, not a changed-build screenshot claim.
- Parent owns typecheck/build/runtime-lock checks and any changed-build browser verification. Local browser navigation is currently blocked; visual parity at 320/360/390/430px, physical PWA safe areas and all expanded states remains a limitation until those checks can run.
- Directly affected source-contract tests were migrated in a bounded follow-up below. No test reads one of the four retired files; their remaining filename references assert that the obsolete source is absent.

## Admin CSS follow-up

The parent authorized an additional pass over all nine `apps/admin/src/*.css` files after its primary/login/form-action and todo-error fixes. The admin snapshot starts **after those parent fixes**; those changes were preserved. `css-inventory.json` includes the complete admin before/after rule inventory.

| Measure | Before this follow-up | After |
|---|---:|---:|
| CSS files parsed | 9 | 9 |
| Rule blocks | 534 | 507 |
| Repeated exact selector-group + normalized media context | 22 | 0 |
| Important declarations | 0 | 0 |

- `admin.css` now owns its actual final shared geometry: content padding 14px desktop / 10px mobile; nav gap/spacing; cards gap 8px; metric min-height 60px, padding 8px 10px desktop / 8px mobile, value size 22px; panel/form-card spacing; shared borders and shadows; toolbar rhythm. Removed the equivalent repeated overrides from `admin-operations.css`.
- Cascade order was considered across media contexts: the old mobile metric font size 20px was already superseded by the later unconditional 22px rule. Moving 22px to the base without removing that stale 20px declaration would have regressed mobile. The obsolete declaration was removed; viewport assertions cover 320/390/430/761px. Header mobile padding retains its final `0 10px` value.
- Shared list pagination and transfer-row metadata now have one rule each. `profile-name.css` owns the modal scroller, name-dialog 14px/12px padding, 17px title and 34px input with 6px/8px padding. No generic shell positioning was moved onto semantic system-status headers.
- Component differences in `system-status.css`, `admin-transfer-push.css`, `admin-todos.css`, `member-info.css` and `permission-switches.css` remain intentional: live status rows, push disclosure, edit/error states, table-specific small actions, member modal widths, native switches and narrow-width reflow. These files were parsed and reviewed; no extra geometry or masks were introduced.
- Fixed max-width/min-height values in admin reserve modal/workspace bounds, control hit areas and the paginated login table footprint. Table overflow remains scrollable; mobile notification table reflow and visually hidden table headers remain the existing accessible presentation. Name clipping remains the documented profile-label behavior, while IDs/diagnostics retain anywhere wrapping.
- Verification: `node_modules/.bin/vitest run --config apps/admin/vite.config.ts src/admin-density.test.ts src/admin-button-styles.test.ts` — **29/29 pass**. Density tests now inspect canonical declarations by exact selector and viewport, so a matching `.primary` suffix cannot falsely satisfy another button variant. The initial root-config invocation excluded these `.test.ts` files; the admin config successfully ran the explicit two files. No full suite was run.
- `git diff --check` passes. Premium strict static audit reports three existing actionless **test mocks** (`src/__tests__/AppPermissionSettings.test.tsx:20`, `src/__tests__/TianyanExpandedLayoutPatch.test.tsx:124`, `src/permission-settings.test.tsx:21`); there are no production findings in that audit. This does not substitute for browser verification.


## CSS contract migration follow-up

The CI dependency inventory identified source-shape contracts that read retired files or inspect declarations moved by this cleanup. Those tests now load canonical component owners and assert their final accepted values. No production geometry was changed to satisfy an old expectation.

- Notifications: canonical 8px content/list gaps, 29px equal-column bulk actions, 16px list / 18px bulk gutters, 600 title weight, 21px time controls and 1px second-row margin. `notification-status-layout.test.mjs` remains unchanged and passes all six checks, including expanded controls and the denied system-notification status.
- Header settings: assertions follow the current DESIGN contract: one sticky header owns the floating settings card, action placement is right 4px / bottom 0px, and the active History/TongXing/Reference pages use the shared settings slot without viewport-coordinate relocation or a portal. Primary-row select paint belongs to the shared responsive rule; history's secondary-row treatment remains separate.
- Matrix: 13px result geometry and 100% canonical panel width, native advanced-order controls, current 20px condition buttons and exact result-heading owner. Unrelated 14px ball/title typography was preserved. Header/condition fixture markup follows the actual component classes.
- Pro/profile: tests load `pro-plans-layout.css` / `activation-code-layout.css` / `feature-pages.css`; retired patch absence is checked explicitly. Artwork remains the existing cropped SVG composition.
- Source matcher checks distinguish a declaration owner from a complementary grouped selector; negative-property checks no longer mistake `border-top` for a `top` positioning property. Assertions still require exact property values. The homepage import's final semicolon was restored; its import graph is unchanged.

Explicit verification (no entire suite):

```sh
node --test --test-reporter=spec tests/ui-responsive-cleanup-contract.test.mjs tests/responsive-feature-pages-request.test.mjs tests/notification-status-layout.test.mjs tests/pro-plans-carousel-peek.test.mjs tests/css-background-parser.test.mjs tests/matrix-explore-fluid-layout.test.mjs tests/bottom-navigation-safe-area-position.test.mjs tests/layout-inline-spacing.test.mjs tests/final-ui-interaction-spacing-contract.test.mjs tests/homepage-visual-language.test.mjs
node --test --test-reporter=spec tests/bottom-navigation-safe-area-position.test.mjs tests/matrix-explore-fluid-layout.test.mjs
node_modules/.bin/vitest run src/__tests__/profile-referral-settings-layout.test.ts src/__tests__/pro-plans-layout-refinement.test.ts src/__tests__/notification-visual-refinement.test.ts src/__tests__/requested-layout-refinement.test.ts src/__tests__/matrix-result-layout-contract.test.ts --reporter=json --outputFile=/tmp/css-vitest-results2.json
node_modules/.bin/vitest run src/__tests__/requested-layout-refinement.test.ts --reporter=json --outputFile=/tmp/css-vitest-results4.json
```

Final evidence: **59/59 Node checks across these ten files**, combining the eight passing files from the combined run with the final 11/11 rerun of the two corrected files; **35/35 Vitest checks across five files**, combining 19 passing checks from four files with the final 16/16 requested-layout run. All retired-file reads are gone. `git diff --check` passes. These are CSS/source contracts and JSDOM checks, not changed-build pixel comparisons.

### Untouched historical contract boundary

The wider generated CI selection includes the following historical contracts. They were inspected, not executed or rewritten during this bounded follow-up, and the full selected CI set is **not claimed green**. Direct comparison with `git show HEAD:src/homepage/base.css` (local base snapshot `40c0ee8`) proves that the conflicting production properties already had the current values before this cleanup: Core width `calc(min(100vw, 390px) - 32px)`, height `calc(var(--home-core-width) * 181 / 654)`, 16px feature gutter, four columns, and `1px solid var(--home-frame-gold)` feature frame. Current DESIGN documents the accepted September 14 thin-frame treatment.

| Untouched test file | Historical expectation inconsistent with the unchanged base |
|---|---|
| `tests/home-octagon-hidden-scrollbar.test.mjs` | Shared octagon clipping, double frames and added feature-frame masks; current accepted components use single thin gold frames. |
| `tests/home-layout-contract.test.mjs` | Core width subtracts 28px, five feature columns, octagonal embedded time cells; unchanged base uses 32px, four columns and the approved thin frame. |
| `tests/homepage-followup-layout.test.mjs` | 10px feature gutter, 28px total Core inset and a 0.7px octagonal selected frame; unchanged base has 16px gutters and 32px total Core inset. |
| `src/__tests__/homepage-home-controls-style.test.ts` | Clamped 1536:414 Core height / old layered background; unchanged base uses the 654:181 artwork ratio. |

These are known stale-assertion candidates for a separately scoped migration, not evidence of a regression caused by moving CSS ownership. They must be accounted for before treating the complete generated CI selection as passing; no test skip or weakened assertion was introduced here.


## Integration with newer main 4d5bc44

Main advanced while the initial cleanup was being prepared. The integration preserves upstream’s retirement of the old record route/components, including `.note-form`, `.note-card`, `.notes-list`, `.weekly-summary`, `.note-number-group`, `.note-detail-card`, their dependent selectors and the record-only 370px media block. It does not restore the initially consolidated numeric input rules. `MatrixNotebookPage`, its notebook editor/list styles and current storage behavior remain owned by upstream.

Three conflicts in `src/feature-pages.css` were resolved by retaining upstream record deletions and the cleanup’s canonical notification declarations. The reference input previously shared a group with `.note-form`; after retirement, its two complementary rules were combined into its existing owner. Declaration-by-declaration AST comparison against the pre-integration cleanup checkpoint found **99 removed complete selector/context identities, zero added identities and zero changed declaration lists on retained identities**. There is no unrelated visual adjustment in the CSS merge.

The minified inventory keeps every original `baseline`, `method`, `before`, `after` and `admin` field unchanged. `integration.baseline` identifies main `4d5bc44`; `integration.after` records the final full candidate inventory and duplicate analysis. It contains 28 PWA CSS files, 1716 parsed rules, two runtime cursor-important declarations and three justified repeated exact rule identities. The active shared sheet contains 843 rules after upstream retirement.

`tests/css-canonical-cleanup.test.mjs` now asserts that retired record selectors have no production CSS owner or record route and that the live Matrix notebook remains exported. Existing notification, Matrix result, transfer controls, reference virtualization and Tiangong spacer assertions remain exact.

```sh
node --test --test-reporter=spec tests/css-canonical-cleanup.test.mjs tests/ui-responsive-cleanup-contract.test.mjs tests/responsive-feature-pages-request.test.mjs tests/notification-status-layout.test.mjs tests/notification-visual-hierarchy.test.mjs
```

Final integration verification: **39/39 checks pass across these five explicit Node files**. PostCSS parses every remaining PWA stylesheet; no CSS conflict marker or retired record selector remains. Original inventory snapshots were compared after serialization and are byte-equivalent as JSON data. The historical-test and visual-verification limitations documented above still apply.
