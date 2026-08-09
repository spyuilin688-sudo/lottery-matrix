# AppDeploy 歷史／遷移腳本

`import-lottery-zip.mjs` 與 `apply-document-update.mjs` 完整保留自 AppDeploy v26（Version ID `1786213708089`），僅作版本來源與遷移歷史參考。

目前 `src/` 與 `public/` 已完成展開並套用 v26 更新。一般開發與建置不會執行這兩支腳本；請直接使用：

```bash
npm run dev
npm run build
```

執行 `import-lottery-zip.mjs` 會重新展開內嵌來源並覆寫目前的 `src/`、`public/`，不屬於一般 Work 開發流程。
