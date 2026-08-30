export type SubscriptionPlanCode = "month" | "quarter" | "year";

export function subscriptionPlanCode(planName: string | null | undefined): SubscriptionPlanCode | null {
  switch (planName?.trim()) {
    case "月費方案":
      return "month";
    case "季費方案":
      return "quarter";
    case "年費方案":
      return "year";
    default:
      return null;
  }
}

function syncSubscriptionPlanCrown() {
  document.querySelectorAll<HTMLElement>(".subscription-status-content").forEach((status) => {
    const crown = status.querySelector<HTMLElement>(".subscription-crown");
    if (!crown) return;

    const planName = status.children.item(1)?.querySelector("strong")?.textContent ?? null;
    const planCode = subscriptionPlanCode(planName);

    if (planCode) crown.dataset.subscriptionPlan = planCode;
    else delete crown.dataset.subscriptionPlan;
  });
}

export function installSubscriptionPlanCrown() {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return () => undefined;

  let queued = false;
  const scheduleSync = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      syncSubscriptionPlanCrown();
    });
  };

  syncSubscriptionPlanCrown();
  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  return () => observer.disconnect();
}
