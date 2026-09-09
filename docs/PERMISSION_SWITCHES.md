# 權限管理開關

管理網站：https://matrix-permissions.spyuilin688.chatgpt.site

網站獨立部署於 Sites，僅限擁有者登入；不占用既有 AppDeploy 管理後台部署。

兩個開關由 Supabase private.matrix_permission_settings 保存：

| 開關 | 開啟 | 關閉 |
| --- | --- | --- |
| 顯示訂閱購買 | 顯示購買入口、方案與轉帳頁 | 隱藏購買入口並由 router 返回會員頁 |
| 註冊會員免費使用 | 所有有效的新舊註冊會員取得天衍、天工、探索七期、十三期、完整範圍 | 依原本方案、推薦、試用計算權限 |

PWA 首次需發布包含此串接的版本。之後變更設定不需要重新部署：開啟中的 PWA 在前景每 30 秒或重回前景時重讀；每次演算法請求在讀取快取前確認設定版本。伺服器 RPC 權限立即採用設定。

購買開關只控制介面顯示，不停止既有付款後端。免費開放不修改會員方案與到期日，不開放其他 Pro 功能。

管理憑證只保存在 Sites 的 MATRIX_MANAGEMENT_TOKEN 秘密環境變數；資料庫只保存 SHA-256。它只能修改這兩項設定，不能存取會員資料。不要將憑證放進 PWA、Git 或公開環境變數。
輪替時產生至少 48 隨機位元組的 token，更新 private.matrix_permission_credentials 的 hash 及 Sites runtime secret，再發布既有網站版本使秘密生效。

設定寫入需 expectedRevision，衝突回 409，管理頁必須重讀。操作失敗或結果未知時不顯示儲存成功。

本次直接相關驗證：

- node scripts/tests/permission-switches.test.mjs
- node node_modules/vitest/vitest.mjs run src/permission-settings.test.tsx src/__tests__/MemberProfilePage.test.tsx src/__tests__/MatrixExplorePage.test.tsx src/matrix-algorithm-api.test.ts src/matrix-explore-rpc.test.ts
- TypeScript 與 Vite 建置
- 正式資料庫 rollback 交易驗證會員權限回復、訪客限制與未授權更新拒絕
