# 2026-09-14 限定範圍索引核對

本次索引處置：**保留 83 個零掃描候選；新增 0；移除 0**。這是基於目前證據的處置，不代表每個候選都已完成完整負載驗證。

資料來自 Supabase 專案 `wcimzbbapfrdotjsfyxa` 於 2026-09-14 11:22–11:25 UTC 的唯讀查詢。未因本報告再次執行測試、建立或刪除索引。

## 統計適用範圍

- `pg_stat_database.stats_reset` 回傳 NULL，因此**無法確定目前使用統計的完整觀察窗**。
- `pg_postmaster_start_time()` 為 2026-09-14 07:45:13.790214 UTC；這個時間不是統計重置時間的替代值。
- 四個演算法表的 `n_live_tup/n_dead_tup` 估計均為 0，但實際 COUNT 有資料；不可使用這批估計宣称表為空或直接計算膨脹程度。
- `pg_stat_user_indexes` 共查得 131 個索引；其中 83 個在本次查詢中 `idx_scan=0`。
- 比較相同資料表、鍵欄、operator class、collation、排序選項、唯一性、expression 與 predicate：完全重複的索引配對為 **0**。此結果不等於排除所有可能的部分冗餘。

## 已取得的具體查詢計畫

| 索引 | 現有證據 | 處置 |
| --- | --- | --- |
| `matrix_explore_results_expiry_idx` | `expires_at < now() ORDER BY expires_at LIMIT 5000` 的 EXPLAIN 選 Index Scan；雖然 idx_scan=0，仍有直接計畫依據。 | 保留 |
| `matrix_explore_results_list_idx` | 指定彩種／期數／版本／球序／規則數並加 `prediction_numbers ? '01'` 的樣本選用此複合索引。 | 保留 |
| `lottery_draws_lottery_draw_date_period_idx` | 彩種歷史依日期、期數排序取 100 筆的 EXPLAIN 選 Index Only Scan。 | 保留 |
| `native_push_ready` | 待送／重試的小表樣本選 Seq Scan；正式 claim 函式仍使用 next_attempt_at 條件，不能由單次小表計畫推定無用。 | 保留待觀察 |

上述僅為 EXPLAIN 計畫，不冒充 EXPLAIN ANALYZE 耗時或完整負載測試。既有 `matrix_explore_results_list_idx` 與 `matrix_explore_results_v2_list_idx` 都有非零掃描紀錄，鍵欄亦不同；本次不合併或刪除。

## 具有唯一性或約束用途的零掃描索引

以下索引的處置依據是實際 `pg_index`／`pg_constraint`，不是由名稱猜測。即使 `idx_scan=0`，唯一性檢查也不等同一般查詢掃描。

| 索引 | KiB | 保留理由 |
| --- | ---: | --- |
| `admin_profiles_pkey` | 16 | 主鍵約束 |
| `transfer_requests_pkey` | 16 | 主鍵約束，另被外鍵 `payments_transfer_request_id_fkey`、`admin_transfer_push_jobs_transfer_id_fkey` 引用 |
| `transfer_requests_one_pending_per_member` | 16 | 實際 UNIQUE 索引，維持既有唯一性／去重約束；不能因掃描為 0 移除 |
| `plans_name_key` | 16 | 唯一約束 `plans_name_key` |
| `line_pwa_handoff_diagnostics_pkey` | 16 | 主鍵約束 |
| `line_pwa_handoff_diagnostics_auth_user_id_request_id_key` | 16 | 唯一約束 `line_pwa_handoff_diagnostics_auth_user_id_request_id_key` |
| `activation_codes_pkey` | 40 | 主鍵約束 |
| `activation_codes_code_key` | 72 | 唯一約束 `activation_codes_code_key` |
| `members_line_user_id_key` | 16 | 唯一約束 `members_line_user_id_key` |
| `members_referral_code_normalized_key` | 16 | 實際 UNIQUE 索引，維持既有唯一性／去重約束；不能因掃描為 0 移除 |
| `activation_code_batches_request_id_key` | 16 | 唯一約束 `activation_code_batches_request_id_key` |
| `activation_code_batches_pkey` | 16 | 主鍵約束 |
| `activation_code_batches_id_duration_type_key` | 16 | 唯一約束 `activation_code_batches_id_duration_type_key`，另被外鍵 `activation_codes_batch_duration_fkey` 引用 |
| `payments_pkey` | 16 | 主鍵約束 |
| `payments_transfer_request_id_unique` | 16 | 實際 UNIQUE 索引，維持既有唯一性／去重約束；不能因掃描為 0 移除 |
| `matrix_analysis_artifacts_pkey` | 16 | 主鍵約束 |
| `admin_login_records_pkey` | 16 | 主鍵約束 |
| `audit_logs_pkey` | 16 | 主鍵約束 |
| `lottery_draws_pkey` | 992 | 主鍵約束 |
| `matrix_analysis_runs_pkey` | 16 | 主鍵約束 |
| `admin_accounts_account_key` | 16 | 唯一約束 `admin_accounts_account_key` |
| `matrix_analysis_artifact_chunks_pkey` | 88 | 主鍵約束 |
| `push_delivery_logs_pkey` | 16 | 主鍵約束 |
| `member_push_subscriptions_pkey` | 16 | 主鍵約束，另被外鍵 `push_delivery_logs_subscription_id_fkey` 引用 |
| `member_push_subscriptions_endpoint_key` | 16 | 唯一約束 `member_push_subscriptions_endpoint_key` |
| `matrix_custom_status_configs_pkey` | 16 | 主鍵約束 |
| `admin_push_subscriptions_pkey` | 16 | 主鍵約束，另被外鍵 `admin_transfer_push_jobs_subscription_id_fkey`、`admin_security_push_jobs_subscription_id_fkey` 引用 |
| `admin_push_subscriptions_endpoint_key` | 16 | 唯一約束 `admin_push_subscriptions_endpoint_key` |
| `admin_transfer_push_jobs_pkey` | 16 | 主鍵約束 |
| `admin_transfer_push_jobs_transfer_id_subscription_id_key` | 16 | 唯一約束 `admin_transfer_push_jobs_transfer_id_subscription_id_key` |
| `system_job_status_pkey` | 16 | 主鍵約束 |
| `admin_sessions_pkey` | 16 | 主鍵約束 |
| `admin_security_push_jobs_pkey` | 8 | 主鍵約束 |
| `admin_security_push_jobs_group_id_subscription_id_key` | 8 | 唯一約束 `admin_security_push_jobs_group_id_subscription_id_key` |
| `security_policy_audit_pkey` | 8 | 主鍵約束 |
| `native_push_deliveries_pkey` | 16 | 主鍵約束 |
| `native_push_deliveries_outbox_id_installation_id_key` | 16 | 唯一約束 `native_push_deliveries_outbox_id_installation_id_key` |
| `native_push_devices_pkey` | 16 | 主鍵約束，另被外鍵 `native_push_deliveries_installation_id_fkey` 引用 |
| `native_push_active_token` | 16 | 實際 UNIQUE 索引，維持既有唯一性／去重約束；不能因掃描為 0 移除 |
| `admin_todos_pkey` | 16 | 主鍵約束 |
| `matrix_analysis_active_versions_pkey` | 16 | 主鍵約束 |

## 其他零掃描候選

「候選」明確表示依索引定義可見用途，但未完成該操作流程的獨立執行驗證；此類暫保留，不宣稱效能已驗證。

| 索引 | KiB | 處置與依據 |
| --- | ---: | --- |
| `transfer_requests_member_id_idx` | 16 | 保留。會員待處理轉帳與付款歷史的 member_id 條件；已讀 member_pending_transfer_request／member_payment_history_get 定義。 |
| `transfer_requests_plan_id_idx` | 16 | 保留。索引覆蓋 plan_id 關聯欄位；未取得完整低頻方案管理負載，暫無移除依據。 |
| `transfer_requests_status_submitted_at_idx` | 16 | 保留。status／submitted_at 待處理清單排序候選；未做此端點定向計畫，保留待觀察。 |
| `activation_codes_status_created_at_idx` | 16 | 保留。狀態與建立時間管理清單候選；本次未取得完整啟動碼操作負載。 |
| `activation_codes_expires_at_idx` | 16 | 保留。expires_at 到期查詢候選；關閉收費期間的低頻統計不能證明索引無用。 |
| `activation_codes_redeemed_by_member_id_idx` | 16 | 保留。已兌換會員的關聯欄位；本次未取得完整兌換／管理負載。 |
| `activation_codes_batch_duration_idx` | 16 | 保留。覆蓋批次與期間的複合關聯欄位；保留既有批次流程依賴，未證明冗餘。 |
| `members_current_plan_id_idx` | 16 | 保留。current_plan_id 方案關聯候選；會員／方案負載未完整涵蓋。 |
| `members_registered_at_idx` | 16 | 保留。registered_at 會員成長與管理排序候選；未定向執行該低頻查詢。 |
| `members_plan_expires_at_idx` | 16 | 保留。plan_expires_at 訂閱到期管理候選；不得由免費模式期間的零掃描推定無用。 |
| `members_invitation_code_normalized_idx` | 16 | 保留。正規化 invitation_code 推薦查詢候選；與原始 invitation_code 比對並不完全等價，未證明可替代。 |
| `activation_code_batches_requested_by_idx` | 16 | 保留。requested_by 批次建立者關聯候選；未取得完整低頻管理負載。 |
| `activation_code_batches_created_at_idx` | 16 | 保留。created_at 批次管理排序候選；未定向執行該查詢。 |
| `payments_member_id_idx` | 16 | 保留。正式 matrix_result_entitlements 依 payment.member_id 查已確認付款；保留會員／推薦查詢。 |
| `payments_plan_id_idx` | 16 | 保留。plan_id 付款方案關聯候選；未取得完整管理負載。 |
| `payments_status_paid_at_idx` | 16 | 保留。status／paid_at 財務管理排序候選；本次未做付款統計計畫。 |
| `matrix_analysis_artifacts_expiry_idx` | 16 | 保留。既有 matrix_analysis_cleanup_batch 對 expires_at 篩選及排序；清理流程仍使用此條件。 |
| `admin_login_records_admin_id_idx` | 16 | 保留。admin_id 登入紀錄關聯候選；未取得完整低頻稽核負載。 |
| `audit_logs_admin_id_idx` | 16 | 保留。admin_id 稽核關聯候選；未取得完整低頻管理負載。 |
| `lottery_draws_preliminary_date_idx` | 8 | 保留。僅 preliminary 資料的部分索引；已讀 matrix_stage_fast_result／matrix_upsert_draws 的暫存開獎處理用途，非一般歷史索引替代品。 |
| `push_delivery_logs_outbox_receipt_idx` | 8 | 保留。outbox_id／sent_at 且 status=sent 的收據部分索引；未充分涵蓋通知確認低頻負載，保留。 |
| `push_delivery_logs_subscription_id_idx` | 16 | 保留。訂閱關聯欄位；通知送達紀錄保留／關聯查詢未完全涵蓋。 |
| `push_delivery_logs_user_id_idx` | 16 | 保留。使用者送達紀錄查詢候選；未取得完整低頻負載。 |
| `member_push_subscriptions_user_id_idx` | 16 | 保留。正式推播函式以 auth.uid() 綁定訂閱；保留使用者關聯查詢。 |
| `notification_outbox_member_id_idx` | 16 | 保留。member_id 通知歸屬關聯候選；批次與管理查詢未完整涵蓋。 |
| `admin_push_subscriptions_admin_idx` | 16 | 保留。security_collect 以訂閱 admin_id 連接管理員；保留通知收件人查詢。 |
| `admin_transfer_push_jobs_due_idx` | 16 | 保留。admin_transfer_push_claim／private.admin_transfer_push_tick 使用待送與重試時間；零掃描不代表停止使用。 |
| `admin_transfer_push_jobs_subscription_idx` | 16 | 保留。訂閱關聯候選；管理推播處置／關聯刪除未完整涵蓋。 |
| `admin_transfer_push_jobs_admin_idx` | 16 | 保留。管理員關聯候選；低頻推播管理負載未完整涵蓋。 |
| `admin_sessions_admin_id_idx` | 16 | 保留。admin_id 管理員工作階段關聯候選；未取得完整撤銷／管理負載。 |
| `admin_security_push_due` | 8 | 保留。正式 admin_security_push_claim／finish 使用 next_attempt_at；保留警示待送／重試用途。 |
| `admin_security_push_subscription` | 8 | 保留。警示訂閱關聯候選；低頻取消及清理負載未完整涵蓋。 |
| `admin_security_push_admin` | 8 | 保留。警示管理員關聯候選；低頻管理及清理負載未完整涵蓋。 |
| `matrix_explore_results_prediction_numbers_idx` | 2624 | 保留。正式 matrix_explore_list_impl 使用 prediction_numbers ? 條件；樣本計畫選複合索引，尚不足證明 GIN 在所有分布無效。 |
| `matrix_explore_results_expiry_idx` | 2264 | 保留。EXPLAIN 明確選此索引執行 expires_at < now() ORDER BY expires_at LIMIT 5000；必須保留。 |
| `native_push_deliveries_installation_id_idx` | 16 | 保留。正式 member_native_push_save 依 installation_id 修正待送資料；保留裝置關聯用途。 |
| `native_push_ready` | 16 | 保留。native_notification_claim 使用待送／重試條件；小表樣本計畫選 Seq Scan，不能據此刪除擴量後有用的部分索引。 |
| `matrix_tianheng_results_prediction_numbers_idx` | 848 | 保留。正式 matrix_tianheng_list_impl 使用 prediction_numbers ? 條件；未證明所有分布與查詢均不需 GIN。 |
| `matrix_tianheng_results_expiry_idx` | 520 | 保留。既有 matrix_analysis_cleanup_batch 對此表 expires_at 篩選／排序；同一清理核心仍啟用。 |
| `admin_todos_admin_id_idx` | 16 | 保留。admin_id 待辦歸屬關聯候選；未取得完整低頻管理負載。 |
| `member_login_records_user_time_idx` | 16 | 保留。auth_user_id／login_at／id 登入歷程排序；與 connection 索引時間語義不同，不能互相視為重複。 |
| `member_login_records_connection_idx` | 16 | 保留。auth_user_id／last_connection_at／id 最近連線排序；與 login_at 索引查詢語義不同，尚無移除依據。 |

## 後續判定門檻

只有取得可解釋的統計觀察窗、代表性高低頻負載、相依約束與替代查詢計畫，才能再評估移除。新增索引也必須先有缺失查詢的計畫證據；本次沒有足够證據支持新增。任何未來正式調整需另附適合的 migration、鎖定成本與 rollback，不能直接套用本報告作為刪除指令。
