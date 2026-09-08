import { type LotteryId } from "../Prototype";
import { ScreenId, Navigate } from "./navigation";
import { MatrixExplorePage } from "./MatrixExplorePage";
import { MatrixTiangongPage } from "./MatrixTiangongPage";
import { TongXingPage } from "./LegacyTongXingPage";
import { DrawHistoryPage } from "./LegacyHistoryPage";
import { NumberReferencePage } from "./NumberReferencePage";
import { CalculatorPage } from "./CalculatorPage";
import { MatrixCardPage } from "./MatrixCardPage";
import { MatrixGuidePage } from "./MatrixGuidePage";
import { NotesPage, MatrixNotebookPage } from "./NotebookPages";
import { NotificationsPage } from "./LegacyNotificationsPage";
import {
  ProfilePage,
  SubscriptionManagementPage,
  PaymentHistoryPage,
  ProPlansPage,
  ManualTransferPage,
  AboutMatrixPage,
  ActivationCodePage,
  ServiceInfoPage,
  RefundPolicyPage,
  ContactSupportPage,
  InviteFriendsPage,
  PromotionsPage,
  VersionInfoPage,
  MemberTermsPage,
  PrivacyPolicyPage,
  DisclaimerPage,
} from "./MemberPages";
import { MatrixCustomStatusPage, MatrixStatusPage } from "./MatrixStatusPages";
import { LinePageGuard } from "../auth/LinePageGuard";

export function FeaturePageRouter({
  screen,
  onNavigate,
  historyReturnScreen = "home",
  statusLottery,
}: {
  screen: ScreenId;
  onNavigate: Navigate;
  historyReturnScreen?: ScreenId;
  statusLottery?: LotteryId;
}) {
  if (screen === "matrix-core") return <MatrixExplorePage onNavigate={onNavigate} />;
  if (screen === "explore") return <MatrixExplorePage onNavigate={onNavigate} />;
  if (screen === "tianyan") return <MatrixExplorePage key="tianyan" onNavigate={onNavigate} title="Matrix 天衍" roadTypes={["複合版路"]} />;
  if (screen === "tiangong") return <MatrixTiangongPage onNavigate={onNavigate} />;
  if (screen === "tongxing") return <TongXingPage onNavigate={onNavigate} />;
  if (screen === "history") return <DrawHistoryPage onNavigate={onNavigate} backTarget={historyReturnScreen} />;
  if (screen === "reference") return <NumberReferencePage onNavigate={onNavigate} />;
  if (screen === "calculator") return <CalculatorPage onNavigate={onNavigate} />;
  if (screen === "matrix-card") return <MatrixCardPage onNavigate={onNavigate} />;
  if (screen === "guide") return <MatrixGuidePage onNavigate={onNavigate} />;
  if (screen === "notes") return <NotesPage onNavigate={onNavigate} />;
  if (screen === "notebook") return <LinePageGuard key={screen} title="Matrix 筆記本" onNavigate={onNavigate}><MatrixNotebookPage onNavigate={onNavigate} /></LinePageGuard>;
  if (screen === "notifications") return <NotificationsPage onNavigate={onNavigate} />;
  if (screen === "profile") return <ProfilePage onNavigate={onNavigate} />;
  if (screen === "subscription-management") return <SubscriptionManagementPage onNavigate={onNavigate} />;
  if (screen === "payment-history") return <PaymentHistoryPage onNavigate={onNavigate} />;
  if (screen === "pro-plans") return <ProPlansPage onNavigate={onNavigate} />;
  if (screen === "manual-transfer") return <ManualTransferPage onNavigate={onNavigate} />;
  if (screen === "about-matrix") return <AboutMatrixPage onNavigate={onNavigate} />;
  if (screen === "activation-code") return <ActivationCodePage onNavigate={onNavigate} />;
  if (screen === "service-info") return <ServiceInfoPage onNavigate={onNavigate} />;
  if (screen === "refund-policy") return <RefundPolicyPage onNavigate={onNavigate} />;
  if (screen === "merchant-info" || screen === "problem-report" || screen === "business-cooperation") return <ContactSupportPage onNavigate={onNavigate} />;
  if (screen === "invite-friends") return <InviteFriendsPage onNavigate={onNavigate} />;
  if (screen === "promotions") return <PromotionsPage onNavigate={onNavigate} />;
  if (screen === "version-info") return <VersionInfoPage onNavigate={onNavigate} />;
  if (screen === "member-terms") return <MemberTermsPage onNavigate={onNavigate} />;
  if (screen === "privacy-policy") return <PrivacyPolicyPage onNavigate={onNavigate} />;
  if (screen === "disclaimer") return <DisclaimerPage onNavigate={onNavigate} />;
  if (screen === "status-settings") return <LinePageGuard key={screen} title="自訂觸發條件" onNavigate={onNavigate}><MatrixCustomStatusPage onNavigate={onNavigate} /></LinePageGuard>;
  return <MatrixStatusPage onNavigate={onNavigate} initialLottery={statusLottery} />;
}
