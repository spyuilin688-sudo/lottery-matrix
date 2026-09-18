# Fixed card fonts

Only these bundled fonts are loaded by the PNG renderer. No OS font discovery or remote fonts are used. The SVG geometry and text remain owned by `../card_renderer.py`.

Matrix Card TC is a renamed subset of Noto Sans CJK TC Regular/Bold (SIL OFL 1.1): https://github.com/notofonts/noto-cjk/tree/main/Sans/OTF/TraditionalChinese
Matrix Card Sans is a renamed subset of Liberation Sans Regular/Bold (SIL OFL 1.1), an Arial-metric-compatible family: https://github.com/liberationfonts/liberation-fonts

The subsets include all static renderer text and printable ASCII. Modified fonts use new family/PostScript names in accordance with reserved-font-name terms. Original license notices are included alongside the binaries. Add glyphs when changing card text. Both font bytes and renderer source are part of every card generation digest, so updates produce new immutable objects.

- MatrixCardTC-Regular.otf: subset of NotoSansCJKtc-Regular.otf; original SHA-256 `dce08bd4fd91aa8aa76ed8fea4b694c2dfb8550f67871e326843212ddbeb88b4`.
- MatrixCardTC-Bold.otf: subset of NotoSansCJKtc-Bold.otf; original SHA-256 `3ee160e5015106e3ec1a394301df54fa9bbbf8a251519984aec5c0abc50840c0`.
- MatrixCardSans-Regular.ttf: subset of LiberationSans-Regular.ttf; original SHA-256 `76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8`.
- MatrixCardSans-Bold.ttf: subset of LiberationSans-Bold.ttf; original SHA-256 `788abee4c806d660e8aee46689dd8540cd4bb98da03dcc9d171ce3efd99a9173`.
