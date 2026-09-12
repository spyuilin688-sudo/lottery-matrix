import type { ReactNode } from "react";
import { ChevronDownIcon, ChevronLeftIcon } from "@radix-ui/react-icons";

const CORE_HEADER_TITLES = new Set(["Matrix 探索", "Matrix 天衡", "Matrix 天衍", "Matrix 天工"]);

const PAGE_SUBTITLES: Readonly<Record<string, string>> = {
  "Matrix 探索": "EXPLORE",
  "Matrix 天衡": "TIANHENG",
  "Matrix 天衍": "TIANYAN",
  "Matrix 天工": "TIANGONG",
  "Matrix 指南": "GUIDE",
  "Matrix 同星": "TONGXING",
  "Matrix 牌單": "DRAW SHEETS",
  "Matrix 狀態": "STATUS",
  "Matrix 筆記本": "NOTEBOOK",
  "號碼對照單": "NUMBER REFERENCE",
  "歷史開獎號碼": "DRAW HISTORY",
  "連碰計算機": "COMBINATIONS",
  "立柱計算機": "COLUMNS",
  "Matrix 自訂觸發狀態": "CUSTOM TRIGGERS",
  "自訂觸發條件": "CUSTOM TRIGGERS",
  "通知": "NOTIFICATIONS",
  "我的": "MY ACCOUNT",
  "記事": "NOTES",
  "記事詳細": "NOTE DETAILS",
  "管理訂閱": "SUBSCRIPTION",
  "付款紀錄": "PAYMENT HISTORY",
  "Matrix Pro 訂閱方案與收費標準": "MATRIX PRO",
  "銀行轉帳付款": "BANK TRANSFER",
  "關於 樂彩 Matrix": "ABOUT MATRIX",
  "我的推薦碼/啟動碼": "REFERRAL & ACTIVATION",
  "服務內容與使用說明": "SERVICE GUIDE",
  "退款規範": "REFUND POLICY",
  "聯絡客服/問題回報/商務合作": "CONTACT & SUPPORT",
  "邀請好友": "INVITE FRIENDS",
  "優惠活動": "PROMOTIONS",
  "版本資訊/更新紀錄": "VERSION & UPDATES",
  "會員服務條例": "MEMBER TERMS",
  "隱私權政策": "PRIVACY POLICY",
  "聲明與免責事項": "DISCLAIMER",
};

export type HeaderSettings = {
  id: string;
  expanded: boolean;
  floating: boolean;
  content: ReactNode;
  onClose: () => void;
};

export function HeaderSettingsButton({ expanded, controls, onClick, label = "探索設定", accessibleLabel = label }: {
  expanded: boolean;
  controls: string;
  onClick: () => void;
  label?: string;
  accessibleLabel?: string;
}) {
  return (
    <button type="button" className="product-header__settings-toggle" aria-label={`${expanded ? "收合" : "展開"}${accessibleLabel}`} aria-expanded={expanded} aria-controls={controls} onClick={onClick}>
      <span>{label}</span>
      <ChevronDownIcon aria-hidden="true" data-open={expanded} />
    </button>
  );
}

export function BrandHeader({ title, onBack, backHref, action, settings, showBack = true }: {
  title: string;
  onBack?: () => void;
  backHref?: string;
  action?: ReactNode;
  settings?: HeaderSettings;
  showBack?: boolean;
}) {
  const hasBack = showBack && Boolean(onBack || backHref);
  const displayTitle = title.replace(/^Matrix\b/, "MATRIX");
  // Conservative glyph widths select one shared fit range without inline styles.
  const titleWidth = Array.from(displayTitle).reduce((width, character) =>
    width + (/[^\u0000-\u007f]/.test(character) ? 1 : /[A-Z]/.test(character) ? .75 : .6), 0);
  const titleFit = titleWidth <= 6 ? "short" : titleWidth <= 8 ? "regular" : titleWidth <= 11 ? "medium" : "long";
  const frame = (
    <div className="product-header__frame" data-back={hasBack} data-actions={Boolean(action)}>
      {hasBack ? backHref ? (
        <a className="product-header__back" href={backHref} aria-label="返回">
          <ChevronLeftIcon aria-hidden="true" />
        </a>
      ) : (
        <button type="button" className="product-header__back" onClick={onBack} aria-label="返回">
          <ChevronLeftIcon aria-hidden="true" />
        </button>
      ) : null}
      <img className="product-header__mark" src="/assets/lottery/matrixYY.png" alt="" aria-hidden="true" draggable={false} />
      <div className="product-header__copy">
        <h1 data-title-fit={titleFit}>{displayTitle}</h1>
        <span>{PAGE_SUBTITLES[title] ?? "LOTTERY MATRIX"}</span>
      </div>
      {action ? <div className="product-header__actions">{action}</div> : null}
    </div>
  );
  return (
    <header className="feature-brand-header product-header" data-product-header={title} data-header-style={CORE_HEADER_TITLES.has(title) ? "flow" : "geometric"} data-settings-floating={Boolean(settings?.expanded && settings.floating)} onKeyDown={(event) => {
      if (event.key !== "Escape" || !settings?.expanded) return;
      event.preventDefault();
      event.stopPropagation();
      settings.onClose();
      event.currentTarget.querySelector<HTMLButtonElement>(".product-header__settings-toggle")?.focus();
    }}>
      {settings ? (
        <div className="product-header__settings-card" data-floating={settings.expanded && settings.floating}>
          {frame}
          <div className="product-header__settings-content" id={settings.id} hidden={!settings.expanded}>
            {settings.content}
          </div>
        </div>
      ) : frame}
    </header>
  );
}
