# 樂彩 Matrix LINE 登入 API 設計

日期：2026-08-24  
Repository：`spyuilin688-sudo/lottery-matrix`  
Branch：`main`  
基準 HEAD：`90597286b96ee7f9484ccb2a0aa7a13c37210cac`

## 1. 目的

準備 LINE 登入 API，沿用現有 Supabase Auth session、`members.auth_user_id`、AppDeploy Bearer 驗證與既有 RLS，不建立第二套會員 token。

本階段可完成程式、mock contract 與設定文件；缺少 LINE Channel 與憑證時，不宣稱已可完成真實 LINE 登入。

## 2. 既有正式來源

- 前端：React/Vite `src/`。
- Auth client：`src/lib/supabase.ts`。
- API bearer：`src/matrix-api-client.ts` 從 Supabase session 取得 access token。
- 後端會員驗證：`backend/matrix-member-auth.ts` 以 bearer 呼叫 Supabase `/auth/v1/user`，再以 `auth_user_id` 查 `members`。
- 會員欄位：`members.auth_user_id` unique，`members.line_user_id` unique。
- 會員、通知、online 與 Matrix 權限 API 繼續使用現有 Supabase bearer。

## 3. 採用方案

使用 Supabase Auth Custom OAuth2 Provider，identifier 固定為 `custom:line`。

不使用 LINE OIDC auto-discovery 作為第一版。LINE Web Login ID token 使用 HS256；本次採 manual OAuth2 endpoints 與 userinfo，避免把第一版建立在未驗證的 JWKS 相容性上。

不採自建 AppDeploy session，因為那會改寫目前 bearer、RLS、RPC 與所有會員 API。

## 4. Provider 設定

Supabase Custom OAuth2 Provider 使用以下正式值：

| 欄位 | 值 |
| --- | --- |
| Provider type | `oauth2` |
| Identifier | `custom:line` |
| Authorization URL | `https://access.line.me/oauth2/v2.1/authorize` |
| Token URL | `https://api.line.me/oauth2/v2.1/token` |
| UserInfo URL | `https://api.line.me/oauth2/v2.1/userinfo` |
| Scopes | `openid profile` |
| Email optional | `true` |
| PKCE | `true` |

- 第一版不要求 `email` scope。
- Channel ID 與 Channel secret 只存於 Supabase provider 設定或 server secret store，不寫入 GitHub、前端 bundle、回應或日誌。
- LINE Console 必須登記 Supabase 建立 provider 時顯示的 exact callback URL；不得自行推算或替換。
- 前端 return URL 只能使用已核准的同源網址，不接受任意外部 `returnTo`。

## 5. 登入資料流

1. 前端 auth helper 呼叫 Supabase `signInWithOAuth({ provider: 'custom:line' })`。
2. Supabase Auth 以 `state`、`nonce` 與 PKCE 導向 LINE Authorization URL。
3. LINE 將 authorization code 回傳到 Supabase provider 顯示的 callback URL。
4. Supabase server 交換 LINE token、取得 userinfo，建立或解析 Supabase user identity。
5. Supabase 將 session 回到目前 PWA。
6. 前端以 Supabase access token 呼叫 `POST /api/member/bootstrap`。
7. bootstrap 成功後，既有會員、通知、online 與 Matrix API 繼續使用相同 bearer，無須改寫。

本次只準備 auth helper 與 API 串接，不新增未確認的登入頁面或 auth gate 版面。

## 6. `POST /api/member/bootstrap`

### 6.1 請求

- Header：`Authorization: Bearer <Supabase access token>`。
- 不接受前端提供 `line_user_id`、display name 或 profile 作為可信身分。
- Request body 不需要會員身分欄位。

### 6.2 驗證

1. 以現有 Supabase URL 與 anon key 呼叫 `/auth/v1/user` 驗證 bearer。
2. 從已驗證 user 的 identities 找到 provider 為 `custom:line` 的 identity。
3. 使用該 identity 的 `provider_id` 作為 `members.line_user_id`。
4. `provider_id` 缺少或 provider 不符時拒絕建立 member。

### 6.3 建立與衝突

- 同一 `auth_user_id` 已有 member 且 `line_user_id` 為空：寫入已驗證的 LINE `provider_id`。
- 同一 `auth_user_id` 已有 member 且 `line_user_id` 相同：回傳既有 member，操作冪等。
- 同一 `auth_user_id` 已有 member，但 `line_user_id` 為另一個非空值：回傳 409，不覆寫既有關聯。
- `line_user_id` 已屬於不同 `auth_user_id`：回傳 HTTP 409，code 為 `LINE_IDENTITY_CONFLICT`，不得靜默移轉。
- 新 user：只寫入 `auth_user_id` 與 `line_user_id`；不自行建立付費方案、到期日、推薦碼、付款或通知資料。
- 唯一鍵競態造成的 identity collision 同樣轉為 409，不回傳底層資料庫內容。

### 6.4 回應

成功回傳 `{ memberId, lineUserId }`。不得回傳 LINE access token、refresh token、Channel secret、Supabase service-role key 或完整 Supabase user payload。

## 7. LINE logout／revoke 準備

- 現有會員「登出」按鈕由 Supabase Auth session owner 處理，不再保留 actionless button。
- 準備 server-side LINE revoke service contract，正式 endpoint 為 `POST /api/auth/line/logout`。
- Header 使用 `Authorization: Bearer <Supabase access token>`；body 固定為 `{ providerAccessToken }`。
- endpoint 必須先驗證 Supabase bearer，再驗證 LINE provider access token 屬於設定的 Channel，且 LINE user `sub` 與 Supabase `custom:line` identity 的 `provider_id` 相同，才可呼叫 LINE revoke。
- LINE provider access token 只存在請求處理記憶體，不寫入資料庫或日誌。
- revoke 成功後，前端再呼叫 Supabase `signOut()` 清除目前 session。
- 缺少 Channel credentials 或 provider token 時，API 明確回傳未設定／缺少 token 錯誤，不宣稱 LINE token 已撤銷。

本次不新增帳號刪除或解除連結流程；原始需求未定義這兩項行為。

## 8. 錯誤語意

| 狀態 | Code | 條件 |
| --- | --- | --- |
| 401 | `AUTH_REQUIRED` | 缺少或無效 Supabase bearer |
| 400 | `LINE_PROVIDER_TOKEN_REQUIRED` | logout request 缺少 provider access token |
| 403 | `LINE_IDENTITY_REQUIRED` | Supabase user 沒有 `custom:line` identity |
| 409 | `LINE_IDENTITY_CONFLICT` | LINE identity 已屬其他 member |
| 503 | `LINE_LOGIN_NOT_CONFIGURED` | server 缺少正式 LINE 設定 |
| 502 | `LINE_PROVIDER_REQUEST_FAILED` | LINE token verify、userinfo 或 revoke 失敗 |

錯誤回應不得包含 authorization code、token、secret、完整 ID token 或 Supabase service key。

## 9. 安全限制

- PKCE 必須啟用；LINE 只使用 `S256`。
- Supabase 管理 `state`、`nonce` 與 code verifier，前端不得自建第二份平行流程。
- callback URL 與 return URL 使用 exact allowlist。
- `line_user_id` 只信任 Supabase 已驗證 identity 的 `provider_id`。
- 不在 localStorage 另存 LINE token。
- 不記錄 authorization code、provider token、Channel secret 或完整 user payload。
- 既有 401「未驗證身份」與 403「已驗證但沒有 member／停用／無權限」語意維持；bootstrap 是唯一不先要求 member record 的會員建立入口。

## 10. 測試

### 10.1 無真實 LINE 憑證可完成

- 前端以 `custom:line` 啟動 Supabase OAuth 的 unit test。
- bootstrap 無 bearer、無 LINE identity、首次建立、重試冪等與 identity collision。
- 不信任 request body 內偽造的 `line_user_id`。
- LINE verify／userinfo／revoke request contract 使用 mock fetch。
- provider token、Channel secret 與 service-role key 不出現在 log、error 或 frontend bundle。
- 既有 member bearer、401／403、RLS、RPC、通知與 Matrix API regression tests。
- TypeScript 與 production build。

### 10.2 需要真實 Channel 才能完成

- LINE → Supabase callback → Supabase session 的真實流程。
- Supabase generic OAuth2 對 LINE `sub`／`provider_id` 的實際 mapping。
- LINE App 內建瀏覽器、外部瀏覽器、SSO、QR 與拒絕授權流程。
- 真實 revoke。

缺少真實 Channel 時，這些項目列為尚未執行，不以 mock 結果宣稱正式登入可用。

## 11. 正式啟用所需資料

- LINE Provider 與 LINE Login Channel。
- Channel ID 與 Channel secret。
- Supabase Custom OAuth2 Provider 建立後顯示的 callback URL。
- LINE Console 中完成 callback 登記。
- Channel 的 Admin／Tester 或 Published 狀態。
- Supabase redirect allowlist 中的正式 PWA return URL。

## 12. 不在本次範圍

- 新增或重新設計登入畫面。
- LINE email permission。
- LIFF、Messaging API、加入官方帳號或推播發送。
- 帳號刪除、解除 LINE 連結或既有帳號合併 UI。
- 自建 AppDeploy session 或第二套 JWT。
- 修改現有 Matrix 權限、方案、推薦、付款或通知規則。

## 13. 第一方規格

- LINE Web Login：<https://developers.line.biz/en/docs/line-login/integrate-line-login/>
- LINE PKCE：<https://developers.line.biz/en/docs/line-login/integrate-pkce/>
- LINE Login v2.1 API：<https://developers.line.biz/en/reference/line-login/>
- LINE ID token：<https://developers.line.biz/en/docs/line-login/verify-id-token/>
- Supabase Custom OAuth/OIDC Provider：<https://supabase.com/docs/guides/auth/custom-oauth-providers>
