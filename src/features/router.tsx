import { lazy } from "react";
import { type LotteryId } from "../Prototype";
import { ScreenId, Navigate } from "./navigation";
const MatrixExplorePage = lazy(() => import("./MatrixExplorePage").then(module => ({ default: module.MatrixExplorePage })));
const MatrixTiangongPage = lazy(() => import("./MatrixTiangongPage").then(module => ({ default: module.MatrixTiangongPage })));
const TongXingPage = lazy(() => import("./LegacyTongXingPage").then(module => ({ default: module.TongXingPage })));
const DrawHistoryPage = lazy(() => import("./LegacyHistoryPage").then(module => ({ default: module.DrawHistoryPage })));
const NumberReferencePage = lazy(() => import("./NumberReferencePage").then(module => ({ default: module.NumberReferencePage })));
const CalculatorPage = lazy(() => import("./CalculatorPage").then(module => ({ default: module.CalculatorPage })));
const MatrixCardPage = lazy(() => import("./MatrixCardPage").then(module => ({ default: module.MatrixCardPage })));
const MatrixGuidePage = lazy(() => import("./MatrixGuidePage").then(module => ({ default: module.MatrixGuidePage })));
const NotesPage = lazy(() => import("./NotebookPages").then(module => ({ default: module.NotesPage })));
const MatrixNotebookPage = lazy(() => import("./NotebookPages").then(module => ({ default: module.MatrixNotebookPage })));
const NotificationsPage = lazy(() => import("./LegacyNotificationsPage").then(module => ({ default: module.NotificationsPage })));
const ProfilePage = lazy(() => import("./MemberPages").then(module => ({ default: module.ProfilePage })));
const SubscriptionManagementPage = lazy(() => import("./MemberPages").then(module => ({ default: module.SubscriptionManagementPage })));
const PaymentHistoryPage = lazy(() => import("./MemberPages").then(module => ({ default: module.PaymentHistoryPage })));
const ProPlansPage = lazy(() => import("./MemberPages").then(module => ({ default: module.ProPlansPage })));
const ManualTransferPage = lazy(() => import("./MemberPages").then(module => ({ default: module.ManualTransferPage })));
const AboutMatrixPage = lazy(() => import("./MemberPages").then(module => ({ default: module.AboutMatrixPage })));
const ActivationCodePage = lazy(() => import("./MemberPages").then(module => ({ default: module.ActivationCodePage })));
const ServiceInfoPage = lazy(() => import("./MemberPages").then(module => ({ default: module.ServiceInfoPage })));
const RefundPolicyPage = lazy(() => import("./MemberPages").then(module => ({ default: module.RefundPolicyPage })));
const ContactSupportPage = lazy(() => import("./MemberPages").then(module => ({ default: module.ContactSupportPage })));
const InviteFriendsPage = lazy(() => import("./MemberPages").then(module => ({ default: module.InviteFriendsPage })));
const PromotionsPage = lazy(() => import("./MemberPages").then(module => ({ default: module.PromotionsPage })));
const VersionInfoPage = lazy(() => import("./MemberPages").then(module => ({ default: module.VersionInfoPage })));
const MemberTermsPage = lazy(() => import("./MemberPages").then(module => ({ default: module.MemberTermsPage })));
const PrivacyPolicyPage = lazy(() => import("./MemberPages").then(module => ({ default: module.PrivacyPolicyPage })));
const DisclaimerPage = lazy(() => import("./MemberPages").then(module => ({ default: module.DisclaimerPage })));
const MatrixCustomStatusPage = lazy(() => import("./MatrixStatusPages").then(module => ({ default: module.MatrixCustomStatusPage })));
const MatrixStatusPage = lazy(() => import("./MatrixStatusPages").then(module => ({ default: module.MatrixStatusPage })));

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
  if (screen === "tianyan") return <MatrixExplorePage onNavigate={onNavigate} title="Matrix 天衍" roadTypes={["複合版路"]} />;
  if (screen === "tiangong") return <MatrixTiangongPage onNavigate={onNavigate} />;
  if (screen === "tongxing") return <TongXingPage onNavigate={onNavigate} />;
  if (screen === "history") return <DrawHistoryPage onNavigate={onNavigate} backTarget={historyReturnScreen} />;
  if (screen === "reference") return <NumberReferencePage onNavigate={onNavigate} />;
  if (screen === "calculator") return <CalculatorPage onNavigate={onNavigate} />;
  if (screen === "matrix-card") return <MatrixCardPage onNavigate={onNavigate} />;
  if (screen === "guide") return <MatrixGuidePage onNavigate={onNavigate} />;
  if (screen === "notes") return <NotesPage onNavigate={onNavigate} />;
  if (screen === "notebook") return <MatrixNotebookPage onNavigate={onNavigate} />;
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
  if (screen === "status-settings") return <MatrixCustomStatusPage onNavigate={onNavigate} />;
  return <MatrixStatusPage onNavigate={onNavigate} initialLottery={statusLottery} />;
}
