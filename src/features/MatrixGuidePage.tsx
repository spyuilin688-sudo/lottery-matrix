import { useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Navigate } from "./navigation";
import { FeatureShell } from "./shared";

export const GUIDE_LOOP_GROUPS = ["leading", "canonical", "trailing"] as const;

export const GUIDE_LOOP_IDLE_MS = 200;

export function MatrixGuidePage({ onNavigate }: { onNavigate: Navigate }) {
  type GuideSection = { title: string; summary: string; blocks: Array<{ title: string; items: string[] }> };
  const sections: GuideSection[] = [
    {
      title: "新手入門",
      summary: "樂彩 Matrix 提供公開的開獎資料查詢、整理、比對、驗證及探索功能，支援今彩539、天天樂、六合彩及大樂透。",
      blocks: [
        { title: "開始使用", items: ["使用 LINE 登入之後進入首頁。", "切換彩種，查看最新開獎資訊、下次開獎時間與 Matrix 狀態。", "依需求使用 Matrix 探索、Matrix 同星、號碼對照單、連碰立柱計算機、Matrix 牌單及 Matrix 指南。"] },
        { title: "基本導覽", items: ["首頁：查看四彩種最新的資訊與主要功能入口。", "Matrix 狀態：查看四彩種目前觸發的狀態與相關資訊。", "快捷：開啟已設定的功能；在首頁連續點擊左下角設定按鈕兩下可變更快捷設定。", "通知：設定各類型的推播通知。", "我的：查看 Matrix Pro 訂閱、推薦、系統及法律資訊。"] },
        { title: "Matrix Pro", items: ["Matrix Pro 提供更多探索功能及會員權限。", "功能開放內容依目前會員狀態顯示。"] },
        { title: "結果說明", items: ["探索結果依歷史資料與所選條件產生，僅供參考，不代表中獎、獲利或任何結果之保證。"] },
      ],
    },
    {
      title: "Matrix 首頁",
      summary: "集中顯示目前彩種的最新開獎資訊、下次開獎時間、剩餘時間、Matrix 狀態及主要功能入口。",
      blocks: [
        { title: "四彩種切換", items: ["固定顯示今彩539、天天樂、六合彩及大樂透。", "切換後，最新開獎資訊卡顯示該彩種的期數、日期與開獎號碼。"] },
        { title: "Matrix 狀態", items: ["四個彩種固定顯示。", "狀態卡依資料呈現啟動、聚合、共振或臨界；同一彩種同時符合多種狀態時，只顯示最高等級狀態。", "點擊狀態卡可進入該彩種的 Matrix 狀態頁。"] },
        { title: "功能入口", items: ["Matrix Core 為 Matrix 探索、Matrix 天衍及 Matrix 天工的核心入口。"] },
      ],
    },
    {
      title: "歷史開獎紀錄",
      summary: "依彩種、號碼順序、日期或探索範圍查詢歷史開獎資料。",
      blocks: [
        { title: "查詢方式", items: ["選擇彩種與號碼順序。", "可依年、月、日設定日期條件，或選擇1000期、3000期、5000期、所有期數的探索範圍。", "按下「開始探索」後顯示符合條件的歷史開獎紀錄。"] },
        { title: "條件優先順序", items: ["最後變更日期時，以日期條件為主；最後變更探索範圍時，以探索範圍為主。"] },
      ],
    },
    {
      title: "Matrix 探索",
      summary: "依彩種、探索期數、版路類型、命中條件與進階設定，篩選符合條件的版路結果。",
      blocks: [
        { title: "探索設定", items: ["彩種：今彩539、天天樂、六合彩、大樂透。", "探索期數：二期、七期、十三期 (Matrix Pro)。", "版路類型：加減版路、合值版路、拖牌版路。", "命中條件：準4+ (鎖定1碼)或準5+ (鎖定2碼) 單選。"] },
        { title: "近十三期：今彩539、天天樂", items: ["今彩539：依號碼由小到大排序65個；依實際開獎順序排序65個鎖定條件。", "天天樂：依號碼由小到大排序65個鎖定條件。", "加減版路驗證球位：每種排序合計6,760個。", "合值版路驗證球位：每種排序合計6,760個。", "拖牌版路驗證球位：每種排序合計65個。", "今彩539兩種排序合計27,170個比對球位；天天樂合計13,585個。"] },
        { title: "近十三期：六合彩、大樂透", items: ["六合彩、大樂透：依號碼由小到大排序91個；依實際開獎順序排序91個鎖定條件。", "加減版路驗證球位：每種排序合計13,286個。", "合值版路驗證球位：每種排序合計13,286個。", "拖牌版路驗證球位：每種排序合計91個。", "六合彩兩種排序合計53,326個比對球位；大樂透兩種排序合計53,326個比對球位。", "四彩種近十三期合計147,407個比對球位。"] },
        { title: "進階探索設定", items: ["號碼順序：今彩539、六合彩、大樂透可選依號碼由小到大排序或依實際開獎順序排序；天天樂固定依號碼由小到大排序。", "探索日期：可選本日 (最新)、昨日 (上1期)、前日 (上2期)。", "標準範圍：上1～7、當期、下N至結果期前一期；不包含結果期。", "完整範圍：上1～14、當期、下N至結果期前一期；不包含結果期。", "完整範圍為 Matrix Pro 功能。"] },
        { title: "查看結果", items: ["按下「開始探索」後，查看重複號碼統計與探索結果。", "結果顯示位置、號碼、預測期、連準次數、預測及版路類型。", "可使用同碼與連準篩選，並展開每條版路查看驗證過程。"] },
      ],
    },
    {
      title: "Matrix 天衍",
      summary: "使用複合版路進行探索，命中條件固定為準5+ (鎖定2碼)。",
      blocks: [
        { title: "探索設定", items: ["彩種：今彩539、天天樂、六合彩、大樂透。", "版路類型使用複合版路。", "命中條件固定為準5+ (鎖定2碼)。"] },
        { title: "複合版路", items: ["複合版路每組使用1個鎖定條件與2條規則。", "每條規則各驗證1個球位；同一球位時，兩條規則必須使用不同演算法。"] },
        { title: "查看結果", items: ["按下「開始探索」後顯示符合條件的結果。", "可使用連準篩選，並展開版路查看驗證過程。"] },
      ],
    },
    {
      title: "Matrix 天工",
      summary: "固定以二段式與準2進3，依探索期數、球位與兩段版路類型進行探索。",
      blocks: [
        { title: "探索設定", items: ["彩種：今彩539、天天樂、六合彩、大樂透。", "探索期數：五十期或八十期。", "流程固定為二段式。", "命中條件固定為準2進3。"] },
        { title: "定位版路", items: ["定位版路不使用鎖定條件；探索、第一段與第二段各使用1個球位路徑。", "第一段驗證3個球位；第二段驗證前2個球位，第3個球位產生預測。"] },
        { title: "球位與版路", items: ["探索球位、第一段球位與第二段球位可選固定、依序遞增或依序遞減。", "第一段與第二段的版路類型皆可選加減版路或合值版路。"] },
        { title: "查看結果", items: ["按下「開始探索」後顯示間距期數、預測位置、預測及版路類型。", "可展開版路查看驗證過程。"] },
      ],
    },
    {
      title: "Matrix 狀態",
      summary: "顯示符合條件的版路結果，依規則分為啟動、聚合、共振及臨界。",
      blocks: [
        { title: "狀態層級", items: ["啟動 ACTIVE。", "聚合 FOCUS。", "共振 RESONANCE。", "臨界 CRITICAL。"] },
        { title: "查看方式", items: ["切換彩種查看各自狀態。", "點擊狀態下拉可展開符合觸發條件的版路。", "每條版路顯示位置、號碼、預測期、連準次數及版路類型。", "符合一組以上觸發條件時，各組內容以間隔區分。"] },
        { title: "自訂觸發條件", items: ["各彩種的自訂觸發條件分開設定。", "在 Matrix 狀態頁面，連續點擊右下角設定按鈕兩下，即可開啟「Matrix 自訂觸發狀態」。", "可重置或儲存目前設定。"] },
        { title: "四狀態條件設定", items: ["啟動、聚合、共振、臨界四個狀態分別設定。", "每組條件包含命中條件、連準次數、版路類型、號碼順序與同碼數量。", "同一組內有多列條件時，需全部符合。"] },
      ],
    },
    {
      title: "Matrix 同星",
      summary: "輸入指定號碼後，查詢指定期數的開獎結果。",
      blocks: [
        { title: "設定條件", items: ["選擇彩種及號碼順序。", "輸入1至3個號碼，號碼不可重複。", "「之後下」可選擇1至30期，再按「開始探索」。"] },
        { title: "結果內容", items: ["結果左側顯示期數與日期，右側顯示開獎號碼。", "今彩539與天天樂顯示5個號碼；六合彩與大樂透顯示6個號碼及特別號。"] },
      ],
    },
    {
      title: "號碼對照單",
      summary: "瀏覽完整歷史開獎紀錄，並以探索號碼與手動標記比對歷史資料。",
      blocks: [
        { title: "查詢設定", items: ["選擇彩種、歷史範圍 (1000／3000／5000期) 及號碼順序。", "可輸入0至3個探索號碼；空白格不參與探索，號碼不可重複。"] },
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
      summary: "依最新一期資料顯示牌單，並提供 PNG 下載。",
      blocks: [
        { title: "使用方式", items: ["選擇今彩539、天天樂、六合彩或大樂透。", "查看所選彩種的最新一期牌單。", "按下「下載 PNG」下載目前牌單。"] },
      ],
    },
    {
      title: "快捷與 Matrix 筆記本",
      summary: "快捷可快速開啟已設定的功能；Matrix 筆記本提供筆記與紀錄兩種模式。",
      blocks: [
        { title: "快捷", items: ["點擊快捷開啟目前設定的功能。", "在首頁連續點擊左下角設定按鈕兩下可設定快捷功能。"] },
        { title: "筆記模式", items: ["新增筆記後輸入標題與內容，再按「寫入筆記」。", "返回列表前若內容尚未寫入，將提醒是否儲存。", "只顯示筆記功能，不顯示損益與紀錄統計。"] },
        { title: "紀錄模式", items: ["可建立單號、連碰或立柱紀錄，號碼由彈窗選取。", "玩法可複選，各玩法分別設定碰數、1碰成本、成本與玩法獎金。", "摘要顯示玩法成本、已確認獎金及金額差額；統計提供本日、本週與自訂日期。", "每筆紀錄保存建立當下的設定快照，後續修改設定不影響歷史紀錄。"] },
      ],
    },
    {
      title: "通知",
      summary: "可設定選號提醒、開獎結果、中獎通知、Matrix 牌單、Matrix 狀態、系統通知。",
      blocks: [
        { title: "通知設定", items: ["各通知可個別開啟或關閉。", "選號提醒可依彩種設定提醒時間。", "開獎結果可依彩種設定。", "中獎通知可選擇彩種通知或中獎金額通知。", "Matrix 牌單可依彩種設定。", "Matrix 狀態與系統通知可個別設定。"] },
      ],
    },
    {
      title: "Matrix Pro",
      summary: "Matrix Pro 為樂彩 Matrix 的付費訂閱方案。",
      blocks: [
        { title: "方案與期間", items: ["提供月方案、季方案與年方案。", "實際價格、期間及權限請至「Matrix Pro 訂閱方案與收費標準」查看。"] },
        { title: "權限內容", items: ["Matrix 狀態進階資訊。", "Matrix 探索期數十三期。", "Matrix 探索完整範圍。", "Matrix Pro 專屬推播通知。", "依訂閱方案顯示 Matrix 天衍、Matrix 天工權限。"] },
      ],
    },
    {
      title: "帳號與安全",
      summary: "使用 LINE 官方授權登入，會員資料、記事、通知、設定與 Matrix Pro 權益會同步。",
      blocks: [
        { title: "登入規則", items: ["一個帳號僅允許一個有效 Session。", "新裝置登入時，舊裝置會自動登出。", "系統將定期驗證登入狀態。", "會員資料與權益依 LINE 帳號同步。"] },
        { title: "安全機制", items: ["使用裝置驗證與資料加密保護。", "若帳號在其他裝置登入，目前裝置會自動登出。"] },
      ],
    },
    {
      title: "常見問題",
      summary: "依目前功能整理操作時常見的查詢方式。",
      blocks: [
        { title: "條件變更後結果沒有更新", items: ["Matrix 探索需按「開始探索」產生結果。", "號碼對照單修改條件後，也需再次按「開始探索」。"] },
        { title: "查看更多開獎紀錄", items: ["近10期開獎號碼，點選查看更多紀錄，可查閱歷史開獎號碼。", "號碼對照單可選擇1000期、3000期或5000期。"] },
        { title: "設定常用功能", items: ["在首頁連續點擊底部左下角設定按鈕兩下後，選擇要指定的功能。"] },
        { title: "查看 Matrix Pro 權限", items: ["前往「我的」中的「Matrix Pro 訂閱方案與收費標準」。"] },
      ],
    },
    {
      title: "關於 樂彩 Matrix",
      summary: "樂彩 Matrix 提供開獎資料查詢與分析服務，協助查閱公開資訊、整理歷史數據與使用各項分析工具。",
      blocks: [
        { title: "服務內容", items: ["支援今彩539、天天樂、六合彩及大樂透。", "提供 Matrix 分析、歷史資料查詢、號碼紀錄、計算工具、牌單及通知等功能。"] },
        { title: "品牌資訊", items: ["品牌名稱：樂彩 Matrix。", "Copyright © 2026 樂彩 Matrix. All Rights Reserved."] },
      ],
    },
  ];
  const [selected, setSelected] = useState(0);
  const stripRef = useRef<HTMLElement | null>(null);
  const current = sections[selected];

  const selectGuideCategory = (event: ReactMouseEvent<HTMLElement>) => {
    const card = (event.target as Element).closest<HTMLElement>("[data-guide-index]");
    if (!card || !event.currentTarget.contains(card)) return;
    const index = Number(card.dataset.guideIndex);
    if (Number.isInteger(index) && index >= 0 && index < sections.length) setSelected(index);
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
  }, []);

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
              {sections.map((section, index) => isClone ? (
                <span className="guide-category-card" data-guide-index={index} data-selected={selected === index} key={`${group}-${section.title}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>{section.title}
                </span>
              ) : (
                <button
                  className="guide-category-card"
                  type="button"
                  data-guide-index={index}
                  data-selected={selected === index}
                  onClick={(event) => selectCanonicalGuideCategory(event, index)}
                  aria-pressed={selected === index}
                  key={`${group}-${section.title}`}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>{section.title}
                </button>
              ))}
            </div>
          );
        })}
      </nav>
      <section className="panel guide-preview">
        <header><span>{String(selected + 1).padStart(2, "0")}</span><h2>{current.title}</h2></header>
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
