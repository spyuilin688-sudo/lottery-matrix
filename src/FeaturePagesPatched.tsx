import "./pro-plans-carousel-peek.css";
import {
  FeaturePageRouter as CoreFeaturePageRouter,
  QuickNavigationProvider,
  type ScreenId,
} from "./FeaturePagesCore";
import { NotificationsPagePatched } from "./NotificationsPagePatched";

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
  onQuickOpen,
  onQuickConfigure,
  quickActive,
}: {
  screen: ScreenId;
  onNavigate: Navigate;
  historyReturnScreen?: ScreenId;
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
    <CoreFeaturePageRouter
      screen={screen}
      onNavigate={onNavigate}
      historyReturnScreen={historyReturnScreen}
      onQuickOpen={onQuickOpen}
      onQuickConfigure={onQuickConfigure}
      quickActive={quickActive}
    />
  );
}
