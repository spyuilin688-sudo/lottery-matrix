import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const expectedManifest = {
  profile: "product-admin",
  sourceRoots: ["src"],
  locale: "zh-TW",
  canonicalMap: "UX-CONTRACT.md",
  requiredCapabilities: ["Select/Listbox", "Date", "Form", "Scrollbar"],
  ownership: {
    "Select/Listbox": "native",
    Date: "native",
  },
};

const tokenTrace = [
  ["--lottery-neutral-950", "#02070c"],
  ["--lottery-gold-500", "#c49145"],
  ["--lottery-gold-300", "#f4ce67"],
  ["--layout-page-inline", "16px"],
  ["--layout-section-gap", "8px"],
  ["--lottery-card-radius", "10px"],
  ["--bottom-navigation-height", "72px"],
];

const reachableConfirmations = [
  {
    scope: "notebook",
    location: "MatrixNotebookPage.returnFromNote",
    copy: "內容尚未寫入，確定返回列表？",
    sourcePattern: /const returnFromNote = \(\) => \{[\s\S]{0,240}?window\.confirm\("內容尚未寫入，確定返回列表？"\)/,
  },
  {
    scope: "notebook",
    location: "MatrixNotebookPage.saveNote",
    copy: "確定寫入筆記？",
    sourcePattern: /const saveNote = \(\) => \{[\s\S]{0,200}?window\.confirm\("確定寫入筆記？"\)/,
  },
  {
    scope: "notebook",
    location: "MatrixNotebookPage.deleteNote",
    copy: "確定刪除此筆記？",
    sourcePattern: /const deleteNote = \(id: string\) => \{[\s\S]{0,120}?window\.confirm\("確定刪除此筆記？"\)/,
  },
  {
    scope: "notebook",
    location: "MatrixNotebookPage.leaveSettings",
    copy: "設定尚未儲存，確定離開？",
    sourcePattern: /const leaveSettings = \(action: \(\) => void\) => \{[\s\S]{0,180}?window\.confirm\("設定尚未儲存，確定離開？"\)/,
  },
  {
    scope: "notebook",
    location: "MatrixNotebookPage.endTagDrag",
    copy: "確定變更玩法順序？",
    sourcePattern: /const endTagDrag = \(\) => \{[\s\S]{0,420}?window\.confirm\("確定變更玩法順序？"\)/,
  },
  {
    scope: "notebook",
    location: "MatrixNotebookPage.addSettingsTag",
    copy: "確定新增「{玩法名稱}」玩法？",
    sourcePattern: /const addSettingsTag = \(\) => \{[\s\S]{0,360}?window\.confirm\(\x60確定新增「\$\{name\}」玩法？\x60\)/,
  },
  {
    scope: "notebook",
    location: "MatrixNotebookPage.deleteSettingsTag",
    copy: "確定刪除「{玩法名稱}」玩法？",
    sourcePattern: /const deleteSettingsTag = \(index: number, name: string\) => \{[\s\S]{0,200}?window\.confirm\(\x60確定刪除「\$\{name\}」玩法？\x60\)/,
  },
  {
    scope: "notebook",
    location: "MatrixNotebookPage.resetSettings",
    copy: "確定重置設定？",
    sourcePattern: /const resetSettings = \(\) => \{[\s\S]{0,120}?window\.confirm\("確定重置設定？"\)/,
  },
  {
    scope: "notebook",
    location: "MatrixNotebookPage.saveSettings",
    copy: "確定儲存設定？",
    sourcePattern: /const saveSettings = \(\) => \{[\s\S]{0,120}?window\.confirm\("確定儲存設定？"\)/,
  },
  {
    scope: "notebook",
    location: "MatrixNotebookPage record-card delete action",
    copy: "確定刪除此紀錄？",
    sourcePattern: /className="record-status-actions"[\s\S]{0,420}?window\.confirm\("確定刪除此紀錄？"\)/,
  },
  {
    scope: "notebook",
    location: "MatrixNotebookPage tag-name input onBlur",
    copy: "確定將「{原玩法名稱}」修改為「{新玩法名稱}」？",
    sourcePattern: /aria-label="玩法名稱"[\s\S]{0,520}?onBlur=\{\(\) => \{[\s\S]{0,180}?window\.confirm\(\x60確定將「\$\{editingTagName\.current\}」修改為「\$\{tag\.name\}」？\x60\)/,
  },
  {
    scope: "plans",
    location: "ProPlansPage.handleAutoRenewChange",
    copy: "確定開啟自動續訂？／確定關閉自動續訂？",
    sourcePattern: /const handleAutoRenewChange = \(\) => \{[\s\S]{0,200}?window\.confirm\(\x60確定\$\{nextState \? "開啟" : "關閉"\}自動續訂？\x60\)/,
  },
  {
    scope: "plans",
    location: "ProPlansPage.handlePayment",
    copy: "確定以{方案名稱}進行付款？",
    sourcePattern: /const handlePayment = \(\) => \{[\s\S]{0,120}?window\.confirm\(\x60確定以\$\{selected\.name\}進行付款？\x60\)/,
  },
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertSourceConfirmationInventory(sources) {
  for (const { scope, location, sourcePattern } of reachableConfirmations) {
    assert.match(
      sources[scope],
      sourcePattern,
      `source confirmation mismatch for ${location}`,
    );
  }
}

test("declares the intentional minimum Premium manifest", () => {
  const manifest = JSON.parse(readFileSync("premium-ui.json", "utf8"));
  assert.deepEqual(manifest, expectedManifest);
});

test("declares runtime token ownership and traces the maintained values", () => {
  const design = readFileSync("DESIGN.md", "utf8");
  const tokenDocs = readFileSync("docs/DESIGN_TOKENS.md", "utf8");
  const runtimeTokens = readFileSync("src/design-tokens.css", "utf8");

  assert.match(
    design,
    /`src\/design-tokens\.css` is the authoring and runtime owner;/,
  );

  for (const [property, value] of tokenTrace) {
    const tableEntry = `| \`${property}\` | \`${value}\` |`;
    assert.ok(design.includes(tableEntry), `DESIGN.md must trace ${property}`);
    assert.ok(tokenDocs.includes(tableEntry), `docs/DESIGN_TOKENS.md must trace ${property}`);
    assert.match(runtimeTokens, new RegExp(`${escapeRegExp(property)}:\\s*${escapeRegExp(value)};`));
  }
});

test("keeps every shared feature title card eight pixels from page content", () => {
  const featureStyles = readFileSync("src/feature-pages.css", "utf8");

  assert.match(
    featureStyles,
    /\\.product-header\\s*\\{[^}]*margin-bottom:\\s*var\\(--layout-section-gap\\);/s,
  );
  assert.doesNotMatch(
    featureStyles,
    /(?:profile|notifications|calculator|draw-history|tongxing|number-reference)-screen[^{}]*>\\s*\\.product-header\\s*\\{[^}]*margin-bottom:/s,
  );
});

test("assigns every required capability to a complete canonical row", () => {
  const contract = readFileSync("UX-CONTRACT.md", "utf8");
  const exactHeading = "| Capability | Canonical owner | Source of truth | Allowed variants | Verification |";

  assert.ok(contract.includes(exactHeading));

  for (const capability of expectedManifest.requiredCapabilities) {
    const row = contract
      .split("\n")
      .find((line) => line.startsWith(`| ${capability} |`));

    assert.ok(row, `${capability} must have a canonical row`);
    const cells = row.slice(1, -1).split("|").map((cell) => cell.trim());
    assert.equal(cells.length, 5);
    assert.ok(cells.every(Boolean), `${capability} canonical row must not contain empty cells`);
  }
});

test("documents only evidenced font loading and route-focus behavior", () => {
  const design = readFileSync("DESIGN.md", "utf8");
  const contract = readFileSync("UX-CONTRACT.md", "utf8");
  const main = readFileSync("src/main.tsx", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.match(main, /import "@fontsource\/roboto\/latin-500\.css";/);
  assert.match(main, /import "@fontsource\/roboto\/latin-700\.css";/);
  assert.equal(typeof packageJson.dependencies["@fontsource/roboto"], "string");
  assert.ok(packageJson.dependencies["@fontsource/roboto"].trim());
  assert.match(design, /Roboto Latin 500／700 由 `@fontsource\/roboto` 明確匯入/);
  assert.match(design, /繁體中文字形則落到 system TC fallback stack/);
  assert.doesNotMatch(design, /已載入的 Roboto/);

  assert.match(contract, /Route-focus restoration is absent and unverified\./);
  assert.doesNotMatch(contract, /restores route focus/);
});

test("routes every reachable confirmation through the shared accessible dialog owner", () => {
  const contract = readFileSync("UX-CONTRACT.md", "utf8");
  const featurePages = readFeaturePagesSource();
  const dialogSource = readFileSync("src/dialog/AppDialog.tsx", "utf8");
  const notebookSource = featurePages.slice(
    featurePages.indexOf("export function MatrixNotebookPage"),
    featurePages.indexOf("export function NotesPage"),
  );
  const plansSource = featurePages.slice(
    featurePages.indexOf("function ProPlansPage"),
    featurePages.indexOf("function AboutMatrixPage"),
  );
  const profileSource = featurePages.slice(
    featurePages.indexOf("export function ProfilePage"),
    featurePages.indexOf("function ProfileMenu"),
  );
  const dialogContract = contract.slice(
    contract.indexOf("## Shared application dialog"),
    contract.indexOf("## Navigation, async and recovery"),
  );

  assert.doesNotMatch(featurePages, /window\.(?:confirm|alert)\(/);
  assert.match(featurePages, /import \{ useAppDialog \} from "\.\.\/dialog\/AppDialog"/);
  assert.match(notebookSource, /const confirmCurrent = async \(options: AppDialogOptions\) =>/);
  assert.equal(notebookSource.match(/appDialog\.confirm\(/g)?.length, 1);
  assert.ok((notebookSource.match(/confirmCurrent\(/g) ?? []).length >= 10);
  assert.equal(plansSource.match(/appDialog\.confirm\(/g)?.length, 1);
  assert.equal(profileSource.match(/confirmDialog\(/g)?.length, 1);
  assert.match(featurePages, /if \(screen === "notebook"\) return <LinePageGuard [^\n]*<MatrixNotebookPage /);
  assert.match(dialogSource, /@radix-ui\/react-dialog/);
  assert.match(dialogSource, /returnFocus/);
  assert.match(dialogContract, /AppDialogProvider/);
  assert.match(dialogContract, /Escape/);
  assert.doesNotMatch(dialogContract, /LegacyMatrixNotebookPage/);
});

test("keeps every shared prompt compact and content-adaptive on mobile", () => {
  const dialogStyles = readFileSync("src/dialog/app-dialog.css", "utf8");

  assert.match(dialogStyles, /\.app-dialog-content\s*\{[^}]*width:\s*280px;[^}]*max-width:\s*calc\(100vw - \(var\(--layout-dialog-inline\) \* 2\)\);[^}]*max-height:\s*min\(78dvh,\s*480px\);[^}]*gap:\s*8px;[^}]*padding:\s*12px;[^}]*overflow:\s*auto;[^}]*border-radius:\s*12px;/s);
  assert.doesNotMatch(dialogStyles, /\.app-dialog-content\s*\{[^}]*height:\s*200px;/s);
  assert.match(dialogStyles, /\.app-dialog-icon\s*\{[^}]*width:\s*42px;[^}]*font-size:\s*24px;/s);
  assert.match(dialogStyles, /\.app-dialog-icon svg\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/s);
  assert.match(dialogStyles, /\.app-dialog-title\s*\{[^}]*font-size:\s*17px;/s);
  assert.match(dialogStyles, /\.app-dialog-description\s*\{[^}]*font-size:\s*13px;[^}]*line-height:\s*1\.5;/s);
  assert.match(dialogStyles, /\.app-dialog-actions\[data-single="true"\]\s*\{[^}]*grid-template-columns:\s*1fr;[^}]*width:\s*200px;[^}]*max-width:\s*100%;[^}]*justify-self:\s*center;/s);
  assert.match(dialogStyles, /\.app-dialog-button\s*\{[^}]*box-sizing:\s*border-box;[^}]*min-height:\s*var\(--layout-touch-target\);[^}]*padding:\s*6px 8px;[^}]*border-radius:\s*8px;/s);
});
