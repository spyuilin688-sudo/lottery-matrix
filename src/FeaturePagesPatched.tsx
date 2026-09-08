import {
  FeaturePageRouter as CoreFeaturePageRouter,
  QuickNavigationProvider,
  type ScreenId,
} from "./FeaturePagesCore";
import type { LotteryId } from "./Prototype";
import { NotificationsPagePatched } from "./NotificationsPagePatched";
import { TianyanExpandedLayoutPatch } from "./TianyanExpandedLayoutPatch";
import { FeaturePageLoadBoundary } from "./FeaturePageLoadBoundary";

export { QuickNavigationProvider };
export type { ScreenId };

type Navigate = (screen: ScreenId) => void;
type BottomNavCallbacks = {
  onQuickOpen?: () => void;
  onQuickConfigure?: () => void;
  quickActive?: boolean;
};

export function FeaturePageRouter({
  screen,
  onNavigate,
  historyReturnScreen = "home",
  statusLottery,
  onQuickOpen,
  onQuickConfigure,
  quickActive,
}: {
  screen: ScreenId;
  onNavigate: Navigate;
  historyReturnScreen?: ScreenId;
  statusLottery?: LotteryId;
} & BottomNavCallbacks) {
  if (screen === "notifications") {
    return (
      <NotificationsPagePatched
        onNavigate={onNavigate}
        onQuickOpen={onQuickOpen}
        onQuickConfigure={onQuickConfigure}
        quickActive={quickActive}
      />
    );
  }

  return (
    <FeaturePageLoadBoundary resetKey={screen} onHome={() => onNavigate("home")}>
      <CoreFeaturePageRouter
        screen={screen}
        onNavigate={onNavigate}
        historyReturnScreen={historyReturnScreen}
        statusLottery={statusLottery}
        onQuickOpen={onQuickOpen}
        onQuickConfigure={onQuickConfigure}
        quickActive={quickActive}
      />
      <TianyanExpandedLayoutPatch active={screen === "tianyan"} />
    </FeaturePageLoadBoundary>
  );
}
