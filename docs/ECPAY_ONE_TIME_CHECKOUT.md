# Matrix Pro 綠界單次付款啟用紀錄

## 付款流程

1. 已登入的會員選擇月、季或年方案；伺服器從 `public.plans` 讀取金額並建立待付款訂單。
2. 瀏覽器在原分頁將簽章欄位 POST 到綠界 `AioCheckOut/V5`；`ChoosePayment=ALL` 顯示該特店已開通的付款方式。沒有自動續訂。
3. 綠界 POST 付款結果到 `ecpay-notify`；後端驗證檢查碼，再用 `QueryTradeInfo/V5` 向綠界查詢確認已付款。瀏覽器返回頁面不會自行開通會員。
4. 資料庫在同一交易中記帳、延長會員期限；同一訂單重複通知不會重複延長。會員付款紀錄包含綠界和原有人工轉帳。
5. 特店額度用滿時，將 `ECPAY_PAYMENT_MODE` 改為 `manual`；原方案按鈕改走既有人工轉帳表單。設定為 `ecpay` 才會產生綠界訂單。未設定也維持人工模式。

## 啟用順序

1. 部署 `20260923080601_ecpay_one_time_checkout.sql` 和 `ecpay-checkout`、`ecpay-notify` 兩個 Edge Functions。前者需 `verify_jwt=true`，綠界回傳的後者需 `verify_jwt=false`；回傳處理器會驗證綠界檢查碼並向綠界查詢付款結果。尚未設定模式時，原人工轉帳流程可用。
2. 從 [綠界廠商後台](https://vendor.ecpay.com.tw/) → 系統設定 → 系統介接設定 → 介接資訊，取得正式環境的特店編號、HashKey、HashIV。不要將正式金鑰貼入程式碼、GitHub、聊天或瀏覽器網址。
3. 將 `ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV`、`ECPAY_ENVIRONMENT=production`、`ECPAY_CLIENT_BACK_URL=https://matrixlottery.idv.tw/` 設定為 Supabase Edge Function Secrets；先讓 `ECPAY_PAYMENT_MODE=manual`。
4. 部署前端網站，確認方案頁可進入原人工轉帳流程。再用綠界測試商店金鑰、`ECPAY_ENVIRONMENT=stage`、`ECPAY_PAYMENT_MODE=ecpay` 在獨立測試環境完成付款、通知、會員期限及重複通知測試；正式環境切回正式金鑰和 `production`。
5. 正式特店已開通且完成一筆小額真實交易的後台對帳後，將 `ECPAY_PAYMENT_MODE=ecpay`。定期檢查付款紀錄與綠界對帳。若收到付款但會員未開通，先以特店交易編號在綠界查詢，核對資料庫訂單；不要僅依瀏覽器返回畫面手動開通。

## 設定與網址

| 設定 | 說明 |
| --- | --- |
| `ECPAY_PAYMENT_MODE` | `manual`（預設）或 `ecpay`；使用者付款入口保留原本按鈕 |
| `ECPAY_ENVIRONMENT` | `stage` 或 `production`；啟用綠界時必填 |
| `ECPAY_MERCHANT_ID` | 此環境的特店編號 |
| `ECPAY_HASH_KEY`、`ECPAY_HASH_IV` | 此環境的介接金鑰，只放 Edge Function Secrets |
| `ECPAY_CLIENT_BACK_URL` | 付款頁的返回網址，正式設定為 `https://matrixlottery.idv.tw/` |
| `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Functions 的專案環境值；不可放入前端 |

綠界文件：[產生訂單](https://developers.ecpay.com.tw/2862/) · [付款結果通知](https://developers.ecpay.com.tw/2878/) · [查詢訂單](https://developers.ecpay.com.tw/2890/) · [測試介接資訊](https://developers.ecpay.com.tw/2856/)。

### 未收到通知時

綠界對信用卡與 TWQR 訂單建議於付款後 10 分鐘查詢，必要時再隔 10 分鐘，或待 40 分鐘後查詢；ATM、超商與條碼等離線付款則等待綠界付款通知。現有程式會在**收到通知時**查詢並驗證；若通知完全未到，需由管理人員在綠界後台核對並處理。綠界也限制高頻查詢，因此不要對所有待付款訂單頻繁輪詢。
