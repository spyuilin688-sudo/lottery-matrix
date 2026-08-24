from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old!r}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "src/design-tokens.css",
    "  --layout-page-inline: 12px;",
    "  --layout-page-inline: 16px;",
)

replace_once(
    "src/homepage/base.css",
    ".home-screen .lottery-screen {\n  --home-content-width:",
    ".home-screen .lottery-screen {\n  --layout-page-inline: 12px;\n  --home-content-width:",
)

replace_once(
    "src/responsive-feature-pages.css",
    "  --tool-page-inline: 16px;",
    "  --tool-page-inline: var(--layout-page-inline);",
)
replace_once(
    "src/responsive-feature-pages.css",
    "  left: 16px;\n  right: 16px;",
    "  left: var(--tool-page-inline);\n  right: var(--tool-page-inline);",
)

replace_once(
    "src/matrix-explore-spacing.css",
    "  padding: 0 16px var(--layout-bottom-nav-clearance);",
    "  padding: 0 var(--layout-page-inline) var(--layout-bottom-nav-clearance);",
)
replace_once(
    "src/matrix-explore-spacing.css",
    "  width: calc(100% - 32px);\n  max-width: none;\n  min-width: 0;",
    "  width: calc(100% - (var(--layout-page-inline) * 2));\n  max-width: none;\n  min-width: 0;",
)

replace_once(
    "src/feature-page-adjustments.css",
    "  padding: 0 16px calc(var(--layout-bottom-nav-clearance) + 12px);",
    "  padding: 0 var(--layout-page-inline) calc(var(--layout-bottom-nav-clearance) + 12px);",
)
replace_once(
    "src/feature-page-adjustments.css",
    "\n.profile-screen .feature-body {\n  padding-inline: 16px;\n}\n",
    "\n",
)

replace_once(
    "src/feature-pages.css",
    ".matrix-status-screen { --layout-page-inline: 16px; }\n",
    "",
)
replace_once(
    "src/feature-pages.css",
    "  margin-inline: 0;\n  padding-inline: 20px;\n  padding-top: 0;",
    "  margin-inline: 0;\n  padding-top: 0;",
)
