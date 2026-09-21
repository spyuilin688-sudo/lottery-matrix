import { useSubscriptionPurchaseVisible } from "../subscription-purchase-visibility";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Navigate } from "./navigation";
import { FeatureShell } from "./shared";
import { MATRIX_PRO_COMMON_FEATURES, SUBSCRIPTION_PAYMENT_NOTICE } from "../matrix-pro-copy";
import { usePermissionSettings } from "../permission-settings";

export const GUIDE_LOOP_GROUPS = ["leading", "canonical", "trailing"] as const;

export const GUIDE_LOOP_IDLE_MS = 200;

export function MatrixGuidePage({ onNavigate }: { onNavigate: Navigate }) {
  const subscriptionPurchaseVisible = useSubscriptionPurchaseVisible();
  const registeredMemberFreeAccess = usePermissionSettings()?.registeredMemberFreeAccess === true;
  const exploreAccessCopy = registeredMemberFreeAccess
    ? "登入的有效會員目前可免費使用十三期與完整範圍。"
    : subscriptionPurchaseVisible
      ? "十三期與完整範圍依 Matrix Pro 權限開放。"
      : "十三期與完整範圍依目前系統權限設定開放。";
  const extendedRangeAccessCopy = registeredMemberFreeAccess
    ? "登入的有效會員目前可免費使用十三期與完整範圍。"
    : "十三期與完整範圍依目前帳號權限開放。";
  type GuideSection = { title: string; summary: string; blocks: Array<{ title: string; items: string[] }> };
  const allSections: GuideSection[] = [
    {
      title: "新手入門",
      summary: "樂彩 Matrix 提供公開的開獎資料查詢、整理、比對、驗證及探索功能，支援今彩539、天天樂、六合彩及大樂透。",
      blocks: [
        { title: "開始使用", items: ["使用 LINE 或 Google 登入後進入首頁。", "切換彩種，查看最新開獎資訊、下次開獎時間與 Matrix 狀態。", "依需求使用 Matrix Core (Matrix 探索、Matrix 天衡、Matrix 天樞、Matrix 天衍、Matrix 天工)、Matrix 同星、號碼對照單、連碰立柱計算機、Matrix 牌單及 Matrix 指南。"] },
        { title: "基本導覽", items: ["底部導覽固定為首頁、快捷、計算機、我的。", "首頁：查看四彩種最新資訊與主要功能入口。", "Matrix 狀態：查看四彩種目前觸發的狀態與相關資訊。", "快捷：點擊底部「快捷」開啟目前設定的功能；在首頁設定按鈕連續點擊兩下可變更快捷設定。", "通知設定：前往「我的」的「系統相關」，設定各類型的推播通知。", ...(subscriptionPurchaseVisible ? ["我的：查看 Matrix Pro 訂閱、推薦、系統及法律資訊。"] : [])] },
        ...(subscriptionPurchaseVisible ? [{ title: "Matrix Pro", items: ["Matrix Pro 提供更多探索功能及會員權限。", "功能開放內容依目前會員狀態顯示。"] }] : []),
        { title: "結果說明", items: ["探索結果依歷史資料與所選條件產生，僅供參考，不代表中獎、獲利或任何結果之保證。"] },
      ],
    },
    {
      title: "Matrix 首頁",
      summary: "集中顯示目前彩種的最新開獎資訊、下次開獎時間、剩餘時間、Matrix 狀態及主要功能入口。",
      blocks: [
        { title: "四彩種切換", items: ["固定顯示今彩539、天天樂、六合彩及大樂透。", "切換後，最新開獎資訊卡顯示該彩種的期數、日期與開獎號碼。", "天天樂僅提供順球；其餘彩種可依資料狀態查看順球或落球。"] },
        { title: "Matrix 狀態", items: ["四個彩種固定顯示。", "狀態卡依資料呈現啟動、聚合、共振、臨界或沉寂；同一彩種同時符合多種觸發狀態時，只顯示最高等級狀態。", "沉寂表示本期尚無符合條件的狀態。", "點擊狀態卡可進入該彩種的 Matrix 狀態頁。"] },
        { title: "功能入口", items: ["Matrix Core 為 Matrix 探索、Matrix 天衡、Matrix 天樞、Matrix 天衍及 Matrix 天工的核心入口。"] },
      ],
    },
    {
      title: "歷史開獎號碼",
      summary: "依彩種、號碼順序、日期或探索範圍查詢歷史開獎資料。",
      blocks: [
        { title: "查詢方式", items: ["選擇彩種與號碼順序；天天樂固定使用順球。", "可依年、月、日設定日期條件，或選擇1000期、3000期、5000期、所有期數的探索範圍。", "按下「開始探索」後顯示符合條件的歷史開獎號碼。"] },
        { title: "條件優先順序", items: ["最後變更日期時，以日期條件為主；最後變更探索範圍時，以探索範圍為主。"] },
      ],
    },
    {
      title: "Matrix 探索",
      summary: "依彩種、探索期數、版路類型、命中條件與進階設定，篩選符合條件的版路結果。",
      blocks: [
        { title: "探索設定", items: ["彩種：今彩539、天天樂、六合彩、大樂透。", "探索期數：二期、七期、十三期。", "版路類型：加減版路、合值版路、拖牌版路。", "命中條件：準4+ (鎖定1碼)、準5+ (鎖定2碼)。", exploreAccessCopy] },
        { title: "鎖定條件與驗證", items: ["系統依所選彩種、探索期數、號碼順序與球位建立鎖定條件，再以歷史資料完成版路驗證。", "今彩539與天天樂每期使用 5 個球位；六合彩與大樂透使用 6 個正碼球位及特別號，因此不同彩種的可比對組合數不同。", "加減、合值與拖牌依各自規則進行驗證，實際結果以目前演算法版本運算為準。"] },
        { title: "進階探索設定", items: ["號碼順序：今彩539、六合彩、大樂透可選依號碼由小到大排序或依實際開獎順序排序；天天樂固定依號碼由小到大排序。", "探索日期：可選本日 (最新)、昨日 (上1期)、前日 (上2期)。", "標準範圍：上 1 ~ 7、當期、下 N 至結果期前一期；不包含結果期。", "完整範圍：上 1 ~ 14、當期、下 N 至結果期前一期；不包含結果期。"] },
        { title: "查看結果", items: ["按下「開始探索」後，查看重複號碼統計與探索結果。", "結果顯示位置、號碼、結果期、連準次數、結果及版路類型。", "可使用同碼、結果號碼與連準篩選，並展開每條版路查看驗證過程。"] },
      ],
    },
    {
      title: "Matrix 天衡",
      summary: "以同一期兩個球位及其號碼共同作為條件，比對歷史紀錄，整理符合條件的版路結果。",
      blocks: [
        { title: "天衡設定", items: ["彩種：今彩539、天天樂、六合彩、大樂透。", "天衡期數：三期、十三期。", "版路類型：加減版路、合值版路、拖牌版路。", "天衡條件：準5+ (鎖定1碼)、準6+ (鎖定2碼)。"] },
        { title: "比對方式", items: ["每組以同一期的兩個不同球位與對應號碼作為條件，查找歷史中相同球位及號碼同時出現的紀錄。", "加減版路與合值版路依所選範圍比對參考球位；拖牌版路使用第一個條件球位的號碼進行驗證。", "來源條件固定包含兩個球位；「鎖定 1 碼、鎖定 2 碼」是結果規則的設定，不會改變來源條件的球位數。"] },
        { title: "進階天衡設定", items: ["號碼順序：今彩539、六合彩、大樂透可選依號碼由小到大排序或依實際開獎順序排序；天天樂固定依號碼由小到大排序。", "天衡日期：可選本日 (最新)、昨日 (上1期)、前日 (上2期)。", "標準範圍包含上 1 ~ 7 期、當期及當期之後至結果期前一期的參考球位；完整範圍向上擴大至 14 期，皆不包含結果期。", extendedRangeAccessCopy] },
        { title: "查看結果", items: ["按下「開始天衡」後，查看重複號碼統計與天衡結果。", "結果顯示兩個條件球位、對應號碼、結果期、連準次數、結果及版路類型。", "「結果期」以該組來源期為基準，顯示相隔多少期；「連準次數」表示連續通過驗證的歷史條件組數。", "可使用同碼、結果號碼與連準篩選，或點選重複號碼統計中的號碼篩選版路；展開版路可查看驗證過程與版路結果。"] },
      ],
    },
    {
      title: "Matrix 天樞",
      summary: "以同一期三個球位及其號碼共同作為條件，比對歷史紀錄，整理符合條件的版路結果。",
      blocks: [
        { title: "天樞設定", items: ["彩種：今彩539、天天樂、六合彩、大樂透。", "天樞期數：三期、十三期。", "版路類型：加減版路、合值版路、拖牌版路。", "天樞條件：準5+ (鎖定1碼)、準6+ (鎖定2碼)。"] },
        { title: "比對方式", items: ["每組以同一期的三個不同球位與對應號碼作為條件，查找歷史中相同球位及號碼同時出現的紀錄。", "加減版路與合值版路依所選範圍比對參考球位；拖牌版路使用第一個條件球位的號碼進行驗證。", "來源條件固定包含三個球位；「鎖定 1 碼、鎖定 2 碼」是結果規則的設定，不會改變來源條件的球位數。"] },
        { title: "進階天樞設定", items: ["號碼順序：今彩539、六合彩、大樂透可選依號碼由小到大排序或依實際開獎順序排序；天天樂固定依號碼由小到大排序。", "天樞日期：可選本日 (最新)、昨日 (上1期)、前日 (上2期)。", "標準範圍包含上 1 ~ 7 期、當期及當期之後至結果期前一期的參考球位；完整範圍向上擴大至 14 期，皆不包含結果期。", extendedRangeAccessCopy] },
        { title: "查看結果", items: ["按下「開始天樞」後，查看重複號碼統計與天樞結果。", "結果顯示三個條件球位、對應號碼、結果期、連準次數、結果及版路類型。", "「結果期」以該組來源期為基準，顯示相隔多少期；「連準次數」表示連續通過驗證的歷史條件組數。", "可使用同碼、結果號碼與連準篩選，或點選重複號碼統計中的號碼篩選版路；展開版路可查看驗證過程與版路結果。"] },
      ],
    },
    {
      title: "Matrix 天衍",
      summary: "固定使用十三期與完整範圍，以複合版路進行探索，命中條件固定為準5+ (鎖定 2 碼)。",
      blocks: [
        { title: "天衍設定", items: ["彩種：今彩539、天天樂、六合彩、大樂透。", "天衍期數固定為十三期，天衍範圍固定為完整範圍。", "版路類型固定使用複合版路。", "命中條件固定為準5+ (鎖定 2 碼)。", "進階設定可調整號碼順序與天衍日期；天天樂固定依號碼由小到大排序。"] },
        { title: "複合版路", items: ["複合版路每組使用 1 個鎖定條件與 2 條規則。", "每條規則各驗證 1 個球位；同一球位時，兩條規則必須使用不同演算法。"] },
        { title: "查看結果", items: ["按下「開始天衍」後，查看重複號碼統計與符合條件的版路結果。", "可使用同碼、結果號碼與連準篩選，並展開版路查看驗證過程。"] },
      ],
    },
    {
      title: "Matrix 天工",
      summary: "固定使用五十期、二段式與準 2 進 3，依三組等距來源、球位走向與兩段版路類型定位結果。",
      blocks: [
        { title: "天工設定", items: ["彩種：今彩539、天天樂、六合彩、大樂透。", "天工期數固定為五十期。", "流程固定為二段式，命中條件固定為準 2 進 3。", "天工正式運算使用依號碼由小到大排序的資料。"] },
        { title: "定位版路", items: ["定位版路不使用鎖定條件；來源以 C、B、A 三組等距排列建立版路。", "第一段要求 C、B、A 三組使用相同完整規則成立；第二段使用 C、B 驗證相同完整規則，再由 A 產生下一期結果。", "探索、第一段與第二段各自使用一條球位路徑，球位不可循環越界。"] },
        { title: "準 3 進 4 排除", items: ["系統會沿相同間距向更舊的 D 組回推。", "若 D 組以相同完整規則在第一段與第二段都成立，代表版路可延伸為準 3 進 4，該候選直接排除。", "若歷史資料不足以完成 D 組排除檢查，正式結果不輸出該候選。"] },
        { title: "球位與版路", items: ["探索球位、第一段球位與第二段球位可複選由左至右、固定或由右至左。", "第一段與第二段的版路類型皆可複選加減版路或合值版路。"] },
        { title: "查看結果", items: ["按下「開始天工」後，查看重複號碼統計與天工結果。", "結果顯示間距、位移走向、結果位置、結果及版路類型。", "可使用同碼與結果號碼篩選，並展開版路查看驗證過程與版路結果。"] },
      ],
    },
    {
      title: "Matrix 狀態",
      summary: "顯示符合觸發條件的版路結果，依規則分為啟動、聚合、共振及臨界；無符合條件時為沉寂。",
      blocks: [
        { title: "狀態層級", items: ["啟動 ACTIVE。", "聚合 FOCUS。", "共振 RESONANCE。", "臨界 CRITICAL。", "沉寂 DORMANT：本期尚無符合條件的狀態。"] },
        { title: "查看方式", items: ["切換彩種查看各自狀態。", "點擊狀態下拉可展開符合觸發條件的版路。", "每條版路顯示位置、號碼、結果期、連準次數、結果及版路類型。", "符合一組以上觸發條件時，各組內容以間隔區分。"] },
      ],
    },
    {
      title: "Matrix 同星",
      summary: "輸入 2 至 3 個指定號碼後，查詢這些號碼出現的條件期，以及指定間隔後的開獎結果。",
      blocks: [
        { title: "設定條件", items: ["選擇彩種及號碼順序；天天樂固定使用順球。", "至少輸入 2 個、最多 3 個號碼，號碼不可重複。", "「之後下」可選擇 1 至 30 期，再按「開始探索」。"] },
        { title: "結果內容", items: ["每組結果成對顯示條件期與指定間隔後的結果期，左側顯示期數與日期，右側顯示開獎號碼。", "今彩539與天天樂顯示 5 個號碼；六合彩與大樂透顯示 6 個號碼及特別號。"] },
      ],
    },
    {
      title: "號碼對照單",
      summary: "瀏覽完整歷史開獎紀錄，並以探索號碼與手動標記比對歷史資料。",
      blocks: [
        { title: "查詢設定", items: ["選擇彩種、歷史範圍 (1000/3000/5000期) 及號碼順序；天天樂固定使用順球。", "可輸入 0 至 3 個探索號碼；空白格不參與探索，號碼不可重複。"] },
        { title: "開始探索", items: ["修改條件後，需按「開始探索」才更新歷史資料與標記。", "未輸入探索號碼時，仍可顯示完整歷史表格且不顯示探索標記。", "探索顏色固定依輸入格位置對應。"] },
        { title: "手動標記與刷新", items: ["點擊期數或單一號碼可手動標記，並立即生效。", "刷新後清空探索號碼與所有標記，並重新載入資料。"] },
      ],
    },
    {
      title: "連碰立柱計算機",
      summary: "提供連碰與立柱計算，並顯示二星、三星、四星及五星結果。",
      blocks: [
        { title: "連碰計算", items: ["切換至「連碰計算機」。", "選取號碼後查看已選數量。", "結果依序顯示二星、三星、四星與五星。"] },
        { title: "立柱計算", items: ["切換至「立柱計算機」。", "調整各柱號碼數量，最多計算至五星。", "可使用批次設定或清除後重新輸入。"] },
      ],
    },
    {
      title: "Matrix 牌單",
      summary: "依最新一期資料顯示順球或落球牌單，並提供牌單下載。",
      blocks: [
        { title: "使用方式", items: ["選擇今彩539、天天樂、六合彩或大樂透。", "切換順球或落球牌單；天天樂僅提供順球，落球資料尚未完成時會顯示待公布。", "查看所選彩種目前最新一期牌單。", "按下「下載牌單」後確認，即下載目前牌單的 PNG 圖片。"] },
      ],
    },
    {
      title: "快捷與 Matrix 筆記本",
      summary: "快捷可快速開啟已設定的功能；Matrix 筆記本可新增、編輯與刪除筆記。",
      blocks: [
        { title: "快捷", items: ["點擊底部「快捷」：已設定快捷功能時直接開啟；尚未設定時會先開啟快捷設定。", "在首頁設定按鈕連續點擊兩下可變更快捷功能。"] },
        { title: "筆記", items: ["新增筆記後輸入標題與內容，再按「寫入筆記」。", "返回列表前若內容尚未寫入，會提醒確認是否離開；直接離開將不保留目前修改。"] },
      ],
    },
    {
      title: "通知設定",
      summary: "可設定選號提醒、開獎結果、Matrix 狀態、Matrix 牌單、Matrix Pro 與系統通知；實際可用項目依登入狀態與目前權限顯示。",
      blocks: [
        { title: "推播與通知", items: ["通知設定需登入後同步，裝置或瀏覽器也必須允許推播權限。", "各可用通知可個別開啟或關閉，設定會同步至目前帳號。"] },
        { title: "通知項目", items: ["選號提醒可依彩種設定提醒時間。", "開獎結果與 Matrix 牌單可依彩種設定。", "Matrix 狀態可依彩種及啟動、聚合、共振、臨界分別設定。", "Matrix Pro 可設定到期前提醒；系統通知可設定維護與更新。", "Matrix 摘星通知目前尚未開放。"] },
      ],
    },
    {
      title: "Matrix Pro",
      summary: "Matrix Pro 為樂彩 Matrix 的付費訂閱方案。",
      blocks: [
        { title: "方案與期間", items: ["提供月方案、季方案與年方案。", "實際價格、期間及權限請至「訂閱方案與收費標準」查看。"] },
        { title: "權限內容", items: registeredMemberFreeAccess
          ? ["目前免費開放期間，登入的有效會員可使用 Matrix 探索十三期與完整範圍、天衡、天樞、天衍及天工。", "Matrix 狀態進階資訊仍依訂閱權限開放。", "恢復收費模式時，天衍與天工依訂閱方案開放。"]
          : [...MATRIX_PRO_COMMON_FEATURES, "依訂閱方案顯示 Matrix 天衍、Matrix 天工權限。"] },
        { title: "付款與續訂", items: [SUBSCRIPTION_PAYMENT_NOTICE, "可前往「我的」查看付款紀錄與管理訂閱。"] },
      ],
    },
    {
      title: "帳號與安全",
      summary: "使用 LINE 或 Google 授權登入，會員資料、筆記、通知、設定與 Matrix Pro 權益會依目前登入的帳號同步。",
      blocks: [
        { title: "登入規則", items: ["一個帳號僅允許一個有效 Session。", "新裝置登入時，舊裝置會自動登出。", "系統將定期驗證登入狀態。", "會員資料與權益依目前登入的帳號同步。"] },
        { title: "安全機制", items: ["使用裝置驗證與資料加密保護。", "若帳號在其他裝置登入，目前裝置會自動登出。"] },
      ],
    },
    {
      title: "常見問題",
      summary: "依目前功能整理操作時常見的查詢方式。",
      blocks: [
        { title: "條件變更後結果沒有更新", items: ["Matrix 探索、Matrix 天衡、Matrix 天樞、Matrix 天衍與 Matrix 天工修改條件後，需按各自的開始按鈕重新查詢。", "號碼對照單修改條件後，也需再次按「開始探索」。"] },
        { title: "查看更多開獎紀錄", items: ["首頁點選查看更多紀錄，可查閱歷史開獎號碼。", "號碼對照單可選擇1000期、3000期或5000期。"] },
        { title: "設定常用功能", items: ["在首頁設定按鈕連續點擊兩下後，選擇要指定的快捷功能。"] },
        ...(subscriptionPurchaseVisible ? [{ title: "查看 Matrix Pro 權限", items: ["前往「我的」中的「訂閱方案與收費標準」。"] }] : []),
      ],
    },
    {
      title: "關於 樂彩 Matrix",
      summary: subscriptionPurchaseVisible ? "樂彩 Matrix 提供開獎資料查詢與分析服務，協助查閱公開資訊、整理歷史數據與使用各項分析工具。" : "樂彩 Matrix 提供開獎資料查詢服務，協助查閱公開資訊、整理歷史數據與使用各項查詢工具。",
      blocks: [
        { title: "服務內容", items: ["支援今彩539、天天樂、六合彩及大樂透。", subscriptionPurchaseVisible ? "提供 Matrix 分析、歷史資料查詢、號碼紀錄、計算工具、牌單及通知等功能。" : "提供 Matrix 查詢、歷史資料查詢、號碼紀錄、計算工具、牌單及通知等功能。"] },
        { title: "品牌資訊", items: ["品牌名稱：樂彩 Matrix。", "Copyright © 2026 樂彩 Matrix. All Rights Reserved."] },
      ],
    },
  ];
  const sections = allSections.map((section, index) => ({ ...section, index }))
    .filter((section) => subscriptionPurchaseVisible || section.title !== "Matrix Pro");
  const [selected, setSelected] = useState(0);
  const stripRef = useRef<HTMLElement | null>(null);
  const current = sections.find((section) => section.index === selected) ?? sections[0];
  useEffect(() => {
    if (current.index !== selected) setSelected(current.index);
  }, [current.index, selected]);

  const selectGuideCategory = (event: ReactMouseEvent<HTMLElement>) => {
    const card = (event.target as Element).closest<HTMLElement>("[data-guide-index]");
    if (!card || !event.currentTarget.contains(card)) return;
    const index = Number(card.dataset.guideIndex);
    if (Number.isInteger(index) && sections.some((section) => section.index === index)) setSelected(index);
  };

  const selectCanonicalGuideCategory = (event: ReactMouseEvent<HTMLButtonElement>, index: number) => {
    event.stopPropagation();
    setSelected(index);
  };

  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    let span = 0;
    let initialized = false;
    let correctionTimer: number | null = null;

    const measure = () => {
      const leadingStart = strip.querySelector<HTMLElement>('[data-guide-group="leading"] .guide-category-card');
      const canonicalStart = strip.querySelector<HTMLElement>('[data-guide-group="canonical"] .guide-category-card');
      if (!leadingStart || !canonicalStart) return;

      const nextSpan = canonicalStart.offsetLeft - leadingStart.offsetLeft;
      if (nextSpan <= 0) return;

      if (!initialized) {
        strip.scrollLeft = nextSpan;
        initialized = true;
      } else if (span > 0 && nextSpan !== span) {
        const logicalOffset = strip.scrollLeft - span;
        strip.scrollLeft = nextSpan + logicalOffset;
      }
      span = nextSpan;
    };

    const normalizeLoop = () => {
      correctionTimer = null;
      if (span <= 0) return;
      if (strip.scrollLeft < span * 0.5) strip.scrollLeft += span;
      else if (strip.scrollLeft > span * 1.5) strip.scrollLeft -= span;
    };

    const handleScroll = () => {
      if (correctionTimer !== null) window.clearTimeout(correctionTimer);
      correctionTimer = window.setTimeout(normalizeLoop, GUIDE_LOOP_IDLE_MS);
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(strip);
    strip.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      strip.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
      if (correctionTimer !== null) window.clearTimeout(correctionTimer);
    };
  }, [registeredMemberFreeAccess, subscriptionPurchaseVisible]);

  return (
    <FeatureShell title="Matrix 指南" onNavigate={onNavigate} className="matrix-guide-screen">
      <nav
        ref={stripRef}
        className="guide-category-strip"
        aria-label="Matrix 指南分類"
        onClick={selectGuideCategory}
      >
        {GUIDE_LOOP_GROUPS.map((group) => {
          const isClone = group !== "canonical";
          return (
            <div className="guide-category-loop-group" data-guide-group={group} aria-hidden={isClone} key={group}>
              {sections.map((section) => isClone ? (
                <span className="guide-category-card" data-guide-index={section.index} data-selected={selected === section.index} key={`${group}-${section.title}`}>
                  <span>{String(section.index + 1).padStart(2, "0")}</span>{section.title}
                </span>
              ) : (
                <button
                  className="guide-category-card"
                  type="button"
                  data-guide-index={section.index}
                  data-selected={selected === section.index}
                  onClick={(event) => selectCanonicalGuideCategory(event, section.index)}
                  aria-pressed={selected === section.index}
                  key={`${group}-${section.title}`}
                >
                  <span>{String(section.index + 1).padStart(2, "0")}</span>{section.title}
                </button>
              ))}
            </div>
          );
        })}
      </nav>
      <section className="panel guide-preview">
        <header><span>{String(current.index + 1).padStart(2, "0")}</span><h2>{current.title}</h2></header>
        <p className="guide-summary">{current.summary}</p>
        <div className="guide-detail-list">
          {current.blocks.map((block) => (
            <section className="guide-detail-block" key={block.title}>
              <h3>{block.title}</h3>
              <ul>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          ))}
        </div>
      </section>
    </FeatureShell>
  );
}
