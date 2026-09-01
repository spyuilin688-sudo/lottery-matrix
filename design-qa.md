# Matrix Card Design QA

- Source visual truth: `/workspace/scratch/fa1323970119/inspect_cards/4-jcsb.png`, `4-edsb.png`, `4-hksb.png`, and `4-l649sb.png`.
- Implementation captures: `/workspace/scratch/fa1323970119/matrix-card-qa/v2/implementation-539.png`, `implementation-daily.png`, `implementation-hk.png`, and `implementation-lotto.png`.
- Focused comparison captures: `/workspace/scratch/fa1323970119/matrix-card-qa/v2/crop-539-body.png` and `crop-hk-body.png`.
- Canvas: 2276 × 3438 px SVG at 1× raster density.
- State: sorted-number card; synthetic draw values were used for the implementation capture. The first 539 and 六合彩 rows used the same values as the source for typography comparison.

## Full-view comparison

- All four cards: header, row pitch, footer, outer border, and horizontal grid runs match the source at 2 px internal / 6 px outer thickness.
- Vertical grid runs match the source for each individual lottery template. 天天樂 uses its three independent reference positions; 大樂透 uses its independent second-panel weekday divider.
- Sampled fills match exactly: `#ffff00`, `#ccff99`, `#ffc0cb`, `#87cefa`, `#d3d3d3`, `#0000ff`, `#ff0000`, and `#000000`.

## Focused comparison

- 539 body numerals: baseline and height match; raster bounding boxes differ by at most 1 px horizontally for the matching sample values.
- 六合彩 special-number divider is black and its horizontal rules are blue, matching the source.
- Footer text content was not compared or changed by request.

## Residual test gap

- The QA host has no Traditional Chinese font installed, so the visible Chinese glyph shapes cannot be raster-compared in this host. The SVG uses the `Microsoft JhengHei, Noto Sans TC, Arial, sans-serif` fallback stack for Chinese text; this does not affect the measured grid, colours, Latin numerals, or special-number rules.

## Final result

passed
