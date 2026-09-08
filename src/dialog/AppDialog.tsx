import * as Dialog from "@radix-ui/react-dialog";
import { ExitIcon } from "@radix-ui/react-icons";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type AppDialogTone = "warning" | "danger" | "success";

export type AppDialogOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: AppDialogTone;
  icon?: "logout";
  variant?: "registration-guide";
};

type DialogRequest = AppDialogOptions & {
  kind: "confirm" | "alert";
  resolve: (value: boolean) => void;
  returnFocus: HTMLElement | null;
};

type AppDialogApi = {
  confirm: (options: string | AppDialogOptions) => Promise<boolean>;
  alert: (options: string | AppDialogOptions) => Promise<void>;
};

const AppDialogContext = createContext<AppDialogApi | null>(null);

function normalizeOptions(options: string | AppDialogOptions): AppDialogOptions {
  return typeof options === "string" ? { title: options } : options;
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const requestRef = useRef<DialogRequest | null>(null);
  const queueRef = useRef<DialogRequest[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.resolve(false);
      queueRef.current.splice(0).forEach((item) => item.resolve(false));
    };
  }, []);

  const showNext = useCallback(() => {
    if (!mountedRef.current) return;
    const next = queueRef.current.shift() ?? null;
    requestRef.current = next;
    setRequest(next);
  }, []);

  const enqueue = useCallback((kind: DialogRequest["kind"], options: string | AppDialogOptions) => (
    new Promise<boolean>((resolve) => {
      const item: DialogRequest = {
        ...normalizeOptions(options),
        kind,
        resolve,
        returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      };
      setRequest((current) => {
        if (current) {
          queueRef.current.push(item);
          return current;
        }
        requestRef.current = item;
        return item;
      });
    })
  ), []);

  const settle = useCallback((value: boolean) => {
    const completed = requestRef.current;
    const hasNext = queueRef.current.length > 0;
    setRequest((current) => {
      current?.resolve(value);
      return null;
    });
    requestRef.current = null;
    queueMicrotask(() => {
      showNext();
      if (!hasNext) completed?.returnFocus?.focus();
    });
  }, [showNext]);

  const api: AppDialogApi = {
    confirm: useCallback((options) => enqueue("confirm", options), [enqueue]),
    alert: useCallback(async (options) => { await enqueue("alert", options); }, [enqueue]),
  };

  return (
    <AppDialogContext.Provider value={api}>
      {children}
      <Dialog.Root
        open={Boolean(request)}
        onOpenChange={(open) => {
          if (!open && request) settle(false);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="app-dialog-overlay" />
          {request ? (
            <Dialog.Content
              className="app-dialog-content"
              data-tone={request.tone ?? "warning"}
              data-variant={request.variant}
            >
              <div className="app-dialog-icon" aria-hidden="true">
                {request.icon === "logout"
                  ? <ExitIcon data-dialog-icon="logout" />
                  : request.tone === "danger" ? "×" : request.tone === "success" ? "✓" : "!"}
              </div>
              <Dialog.Title className="app-dialog-title">{request.title}</Dialog.Title>
              {request.description ? (
                <Dialog.Description className="app-dialog-description">
                  {request.description}
                </Dialog.Description>
              ) : null}
              <div className="app-dialog-actions" data-single={request.kind === "alert"}>
                {request.kind === "confirm" ? (
                  <button className="app-dialog-button app-dialog-button--secondary" type="button" onClick={() => settle(false)}>
                    {request.cancelLabel ?? "取消"}
                  </button>
                ) : null}
                <button className="app-dialog-button app-dialog-button--primary" type="button" onClick={() => settle(true)}>
                  {request.confirmLabel ?? (request.kind === "alert" ? "知道了" : "確認")}
                </button>
              </div>
            </Dialog.Content>
          ) : null}
        </Dialog.Portal>
      </Dialog.Root>
    </AppDialogContext.Provider>
  );
}

export function useAppDialog(): AppDialogApi {
  const context = useContext(AppDialogContext);
  if (!context) throw new Error("useAppDialog must be used inside AppDialogProvider");
  return context;
}
