// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppDialogProvider } from "./dialog/AppDialog";
import {
  PwaLifecycleProvider,
  usePwaLifecycle,
  type PwaInstallResult,
} from "./pwa-lifecycle";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

class ServiceWorkerContainerStub extends EventTarget {
  controller: object | null = null;
  register = vi.fn(async () => ({}));
}

function InstallProbe({ onResult = () => undefined }: { onResult?: (result: PwaInstallResult) => void }) {
  const lifecycle = usePwaLifecycle();
  return lifecycle.showInstallAction ? (
    <button type="button" onClick={() => void lifecycle.requestInstall().then(onResult)}>
      安裝 樂彩 Matrix
    </button>
  ) : null;
}

function dispatchInstallPrompt(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt") as BeforeInstallPromptEvent;
  const prompt = vi.fn(async () => undefined);
  Object.defineProperties(event, {
    prompt: { value: prompt },
    userChoice: { value: Promise.resolve({ outcome }) },
  });
  window.dispatchEvent(event);
  return prompt;
}

function installNavigator(
  serviceWorker: ServiceWorkerContainerStub,
  { userAgent = "Mozilla/5.0", maxTouchPoints = 0, standalone = false } = {},
) {
  Object.defineProperties(window.navigator, {
    serviceWorker: { configurable: true, value: serviceWorker },
    userAgent: { configurable: true, value: userAgent },
    maxTouchPoints: { configurable: true, value: maxTouchPoints },
    standalone: { configurable: true, value: standalone },
  });
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      media: "(display-mode: standalone)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PWA install lifecycle", () => {
  it("captures the browser install prompt and reports the accepted choice", async () => {
    const serviceWorker = new ServiceWorkerContainerStub();
    installNavigator(serviceWorker);
    const onResult = vi.fn();
    render(
      <AppDialogProvider>
        <PwaLifecycleProvider>
          <InstallProbe onResult={onResult} />
        </PwaLifecycleProvider>
      </AppDialogProvider>,
    );

    const prompt = dispatchInstallPrompt("accepted");
    fireEvent.click(await screen.findByRole("button", { name: "安裝 樂彩 Matrix" }));

    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    expect(onResult).toHaveBeenCalledWith("accepted");
    expect(serviceWorker.register).not.toHaveBeenCalled();
  });

  it("offers iOS add-to-home-screen instructions when no native prompt exists", async () => {
    const serviceWorker = new ServiceWorkerContainerStub();
    installNavigator(serviceWorker, {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      maxTouchPoints: 5,
    });
    const onResult = vi.fn();
    render(
      <AppDialogProvider>
        <PwaLifecycleProvider>
          <InstallProbe onResult={onResult} />
        </PwaLifecycleProvider>
      </AppDialogProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "安裝 樂彩 Matrix" }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith("ios-instructions"));
  });

  it("hides the install action after the appinstalled event", async () => {
    const serviceWorker = new ServiceWorkerContainerStub();
    installNavigator(serviceWorker);
    render(
      <AppDialogProvider>
        <PwaLifecycleProvider>
          <InstallProbe />
        </PwaLifecycleProvider>
      </AppDialogProvider>,
    );

    dispatchInstallPrompt();
    expect(await screen.findByRole("button", { name: "安裝 樂彩 Matrix" })).toBeInTheDocument();

    window.dispatchEvent(new Event("appinstalled"));

    await waitFor(() => expect(screen.queryByRole("button", { name: "安裝 樂彩 Matrix" })).not.toBeInTheDocument());
  });
});

describe("PWA update lifecycle", () => {
  it("offers an update after an existing service worker controller changes and reloads after confirmation", async () => {
    const serviceWorker = new ServiceWorkerContainerStub();
    serviceWorker.controller = {};
    installNavigator(serviceWorker);
    const reloadPage = vi.fn();
    render(
      <AppDialogProvider>
        <PwaLifecycleProvider reloadPage={reloadPage}>
          <div>Matrix</div>
        </PwaLifecycleProvider>
      </AppDialogProvider>,
    );

    serviceWorker.dispatchEvent(new Event("controllerchange"));

    const dialog = await screen.findByRole("dialog", { name: "發現新版本" });
    fireEvent.click(screen.getByRole("button", { name: "立即更新" }));

    await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
    expect(dialog).not.toBeInTheDocument();
  });

  it("does not report the first service worker activation as an update", async () => {
    const serviceWorker = new ServiceWorkerContainerStub();
    installNavigator(serviceWorker);
    render(
      <AppDialogProvider>
        <PwaLifecycleProvider>
          <div>Matrix</div>
        </PwaLifecycleProvider>
      </AppDialogProvider>,
    );

    serviceWorker.dispatchEvent(new Event("controllerchange"));

    expect(serviceWorker.register).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "發現新版本" })).not.toBeInTheDocument();
  });

  it("offers a later update after the first controller claims an already open page", async () => {
    const serviceWorker = new ServiceWorkerContainerStub();
    installNavigator(serviceWorker);
    const reloadPage = vi.fn();
    render(
      <AppDialogProvider>
        <PwaLifecycleProvider reloadPage={reloadPage}>
          <div>Matrix</div>
        </PwaLifecycleProvider>
      </AppDialogProvider>,
    );

    serviceWorker.controller = {};
    serviceWorker.dispatchEvent(new Event("controllerchange"));
    expect(screen.queryByRole("dialog", { name: "發現新版本" })).not.toBeInTheDocument();

    serviceWorker.controller = {};
    serviceWorker.dispatchEvent(new Event("controllerchange"));
    expect(await screen.findByRole("dialog", { name: "發現新版本" })).toBeInTheDocument();
    expect(reloadPage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "立即更新" }));

    await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1));
  });

  it("offers a later service worker update after the current prompt is postponed", async () => {
    const serviceWorker = new ServiceWorkerContainerStub();
    serviceWorker.controller = {};
    installNavigator(serviceWorker);
    render(
      <AppDialogProvider>
        <PwaLifecycleProvider>
          <div>Matrix</div>
        </PwaLifecycleProvider>
      </AppDialogProvider>,
    );

    serviceWorker.dispatchEvent(new Event("controllerchange"));
    fireEvent.click(await screen.findByRole("button", { name: "稍後" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "發現新版本" })).not.toBeInTheDocument());

    serviceWorker.dispatchEvent(new Event("controllerchange"));

    expect(await screen.findByRole("dialog", { name: "發現新版本" })).toBeInTheDocument();
  });
});
