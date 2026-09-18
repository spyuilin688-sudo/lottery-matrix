// Compatibility exports for direct component consumers. Runtime navigation imports features/router.
export { type ScreenId, QuickNavigationProvider, useQuickNavigation } from "./features/navigation";
export { DrawHistoryPage } from "./features/LegacyHistoryPage";
export { MatrixExplorePage } from "./features/MatrixExplorePage";
export { MatrixTiangongPage } from "./features/MatrixTiangongPage";
export { TongXingPage } from "./features/LegacyTongXingPage";
export { NumberReferencePage } from "./features/NumberReferencePage";
export { CalculatorPage } from "./features/CalculatorPage";
export { MatrixCardPage } from "./features/MatrixCardPage";
export { MatrixGuidePage } from "./features/MatrixGuidePage";
export { MatrixNotebookPage } from "./features/NotebookPages";
export { NotificationsPage } from "./features/LegacyNotificationsPage";
export { ProfilePage, PaymentHistoryPage, ProPlansPage, ManualTransferPage } from "./features/MemberPages";
export { MatrixStatusPage, MatrixCustomStatusPage } from "./features/MatrixStatusPages";
export { FeaturePageRouter } from "./features/router";
