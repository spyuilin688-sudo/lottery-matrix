import { createContext, useContext, type ReactNode } from "react";

export type ScreenId =
  | "home"
  | "matrix-core"
  | "explore"
  | "tianheng"
  | "tianyan"
  | "tiangong"
  | "tongxing"
  | "history"
  | "reference"
  | "calculator"
  | "matrix-card"
  | "guide"
  | "notes"
  | "notebook"
  | "notifications"
  | "profile"
  | "subscription-management"
  | "pro-plans"
  | "manual-transfer"
  | "about-matrix"
  | "activation-code"
  | "service-info"
  | "refund-policy"
  | "merchant-info"
  | "member-terms"
  | "privacy-policy"
  | "payment-history"
  | "problem-report"
  | "business-cooperation"
  | "invite-friends"
  | "promotions"
  | "version-info"
  | "disclaimer"
  | "status"
  | "status-settings";

export type Navigate = (screen: ScreenId) => void;

export type QuickNavigationContextValue = {
  onQuickOpen?: () => void;
  onQuickConfigure?: () => void;
  onQuickBack?: () => void;
  currentScreen?: ScreenId;
  quickTarget?: ScreenId | null;
  quickActive?: boolean;
};

export const QuickNavigationContext = createContext<QuickNavigationContextValue>({});

export function QuickNavigationProvider({
  children,
  onQuickOpen,
  onQuickConfigure,
  onQuickBack,
  currentScreen,
  quickTarget,
  quickActive,
}: QuickNavigationContextValue & { children: React.ReactNode }) {
  return (
    <QuickNavigationContext.Provider value={{ onQuickOpen, onQuickConfigure, onQuickBack, currentScreen, quickTarget, quickActive }}>
      {children}
    </QuickNavigationContext.Provider>
  );
}

export function useQuickNavigation() {
  return useContext(QuickNavigationContext);
}
