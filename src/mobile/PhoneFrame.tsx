import {
  createContext,
  type PropsWithChildren,
  type RefObject,
  useContext,
  useMemo,
  useRef,
} from "react";

type ScreenPortalContextValue = {
  screenRef: RefObject<HTMLDivElement | null>;
};

const ScreenPortalContext = createContext<ScreenPortalContextValue | null>(null);

export function useScreenPortal() {
  const context = useContext(ScreenPortalContext);

  if (!context) {
    throw new Error("useScreenPortal must be used inside PhoneFrame");
  }

  return context;
}

export function PhoneFrame({ children }: PropsWithChildren) {
  const screenRef = useRef<HTMLDivElement | null>(null);
  const contextValue = useMemo(() => ({ screenRef }), []);

  return (
    <ScreenPortalContext.Provider value={contextValue}>
      <div
        ref={screenRef}
        className="device-screen"
        data-phone-screen
        data-testid="device-screen"
      >
        {children}
      </div>
    </ScreenPortalContext.Provider>
  );
}
