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

const SERVICE_WORKER_PATH = "/push-service-worker.js";
const STANDALONE_QUERY = "(display-mode: standalone)";

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
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return Boolean(navigatorWithStandalone.standalone)
    || Boolean(window.matchMedia?.(STANDALONE_QUERY).matches);
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
  reloadPage = () => window.location.reload(),
}: {
  children: ReactNode;
  reloadPage?: () => void;
}) {
  const { confirm } = useAppDialog();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const updatePromptedRef = useRef(false);

  useEffect(() => {
    const media = window.matchMedia?.(STANDALONE_QUERY);
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
    if (typeof media?.addEventListener === "function") media.addEventListener("change", refreshInstalledState);
    else media?.addListener?.(refreshInstalledState);

    const serviceWorker = navigator.serviceWorker;
    const hadController = Boolean(serviceWorker?.controller);
    const handleControllerChange = () => {
      if (!hadController || updatePromptedRef.current) return;
      updatePromptedRef.current = true;
      void confirm({
        title: "發現新版本",
        description: "重新載入後即可使用最新版本。",
        confirmLabel: "立即更新",
        cancelLabel: "稍後",
      }).then((confirmed) => {
        if (confirmed) reloadPage();
        else updatePromptedRef.current = false;
      });
    };

    serviceWorker?.addEventListener("controllerchange", handleControllerChange);
    if (serviceWorker && typeof serviceWorker.register === "function") {
      void serviceWorker.register(SERVICE_WORKER_PATH).catch(() => undefined);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      if (typeof media?.removeEventListener === "function") media.removeEventListener("change", refreshInstalledState);
      else media?.removeListener?.(refreshInstalledState);
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
