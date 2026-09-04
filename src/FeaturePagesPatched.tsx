import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./pro-plans-layout.css";
import "./pro-plans-carousel-peek.css";
import "./activation-code-layout.css";
import {
  FeaturePageRouter as CoreFeaturePageRouter,
  QuickNavigationProvider,
  type ScreenId,
} from "./FeaturePagesCore";
import type { LotteryId } from "./Prototype";
import { NotificationsPagePatched } from "./NotificationsPagePatched";
import { TianyanExpandedLayoutPatch } from "./TianyanExpandedLayoutPatch";

export { QuickNavigationProvider };
export type { ScreenId };

type Navigate = (screen: ScreenId) => void;
type BottomNavCallbacks = {
  onQuickOpen?: () => void;
  onQuickConfigure?: () => void;
  quickActive?: boolean;
};

function ContactSupportPhonePortal({ active }: { active: boolean }) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      setHost(null);
      return;
    }

    const nextHost = document.querySelector<HTMLElement>(
      ".contact-support-screen .feature-body > .detail-card:first-of-type",
    );
    setHost(nextHost);

    return () => setHost(null);
  }, [active]);

  if (!host) return null;

  return createPortal(
    <div className="contact-support-phone-row">
      <a href="tel:+886226861828">(02) 2686-1828</a>
    </div>,
    host,
  );
}

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

  const contactSupportActive = screen === "merchant-info"
    || screen === "problem-report"
    || screen === "business-cooperation";

  return (
    <>
      <CoreFeaturePageRouter
        screen={screen}
        onNavigate={onNavigate}
        historyReturnScreen={historyReturnScreen}
        statusLottery={statusLottery}
        onQuickOpen={onQuickOpen}
        onQuickConfigure={onQuickConfigure}
        quickActive={quickActive}
      />
      <ContactSupportPhonePortal active={contactSupportActive} />
      <TianyanExpandedLayoutPatch active={screen === "tianyan"} />
    </>
  );
}
