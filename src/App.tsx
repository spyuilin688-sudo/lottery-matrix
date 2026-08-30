import { MemberSessionBridge } from "./auth/MemberSessionBridge";
import { MobileDeviceProvider } from "./mobile/Device";
import { KeyboardProvider } from "./mobile/Keyboard";
import Prototype from "./Prototype";
import { AppDialogProvider } from "./dialog/AppDialog";

export default function App() {
  return (
    <AppDialogProvider>
      <div className="app-mobile-canvas" data-testid="app-mobile-canvas">
        <MemberSessionBridge />
        <MobileDeviceProvider>
          <KeyboardProvider>
            <Prototype />
          </KeyboardProvider>
        </MobileDeviceProvider>
      </div>
    </AppDialogProvider>
  );
}
