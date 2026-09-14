import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAppDialog } from "./dialog/AppDialog";
import { isPwaDisplayMode, PWA_DISPLAY_QUERIES } from './pwa-display-mode';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type PwaInstallResult = "accepted" | "dismissed" | "ios-instructions" | "unavailable";

type PwaLifecycleValue = {
  isInstalled: boolean;
  showInstallAction: boolean;
  requestInstall: () => Promise<PwaInstallResult>;
};

const unavailableLifecycle: PwaLifecycleValue = {
  isInstalled: false,
  showInstallAction: false,
  requestInstall: async () => "unavailable",
};

const PwaLifecycleContext = createContext<PwaLifecycleValue>(unavailableLifecycle);

function isStandalone() {
  return isPwaDisplayMode();
}

function reloadCurrentPage() {
  window.location.reload();
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent ?? "";
  const platform = navigator.platform ?? "";
  return /iPad|iPhone|iPod/i.test(userAgent)
    || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function PwaLifecycleProvider({
  children,
  reloadPage = reloadCurrentPage,
}: {
  children: ReactNode;
  reloadPage?: () => void;
}) {
  const { confirm } = useAppDialog();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const updatePromptedRef = useRef(false);

  useEffect(() => {
    let active = true;
    const mediaQueries = PWA_DISPLAY_QUERIES.map((query) => window.matchMedia?.(query));
    const refreshInstalledState = () => setInstalled(isStandalone());
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    for (const media of mediaQueries) {
      if (typeof media?.addEventListener === "function") media.addEventListener("change", refreshInstalledState);
      else media?.addListener?.(refreshInstalledState);
    }

    const serviceWorker = navigator.serviceWorker;
    let hadController = Boolean(serviceWorker?.controller);
    const handleControllerChange = () => {
      if (!hadController) {
        // The first claim is installation; subsequent claims update this page.
        hadController = Boolean(serviceWorker?.controller);
        return;
      }
      if (updatePromptedRef.current) return;
      updatePromptedRef.current = true;
      void confirm({
        title: "發現新版本",
        description: "重新載入後即可使用最新版本。",
        confirmLabel: "立即更新",
        cancelLabel: "稍後",
      }).then((confirmed) => {
        if (!active) return;
        if (confirmed) reloadPage();
        else updatePromptedRef.current = false;
      });
    };

    serviceWorker?.addEventListener("controllerchange", handleControllerChange);
    return () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      for (const media of mediaQueries) {
        if (typeof media?.removeEventListener === "function") media.removeEventListener("change", refreshInstalledState);
        else media?.removeListener?.(refreshInstalledState);
      }
      serviceWorker?.removeEventListener("controllerchange", handleControllerChange);
    };
  }, [confirm, reloadPage]);

  const requestInstall = useCallback(async (): Promise<PwaInstallResult> => {
    if (installed) return "unavailable";
    if (!installPrompt) return isIosDevice() ? "ios-instructions" : "unavailable";

    setInstallPrompt(null);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      return choice.outcome;
    } catch {
      return "unavailable";
    }
  }, [installPrompt, installed]);

  const value = useMemo<PwaLifecycleValue>(() => ({
    isInstalled: installed,
    showInstallAction: !installed && (Boolean(installPrompt) || isIosDevice()),
    requestInstall,
  }), [installPrompt, installed, requestInstall]);

  return <PwaLifecycleContext.Provider value={value}>{children}</PwaLifecycleContext.Provider>;
}

export function usePwaLifecycle() {
  return useContext(PwaLifecycleContext);
}
