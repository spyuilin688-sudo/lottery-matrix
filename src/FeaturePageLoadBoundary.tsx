import { Component, Suspense, type ReactNode } from 'react';
import './feature-page-load-state.css';

type FeaturePageLoadBoundaryProps = {
  children: ReactNode;
  onHome: () => void;
  reloadPage?: () => void;
  resetKey?: string;
};

type FeaturePageLoadBoundaryState = { failed: boolean; resetKey?: string };

function reloadCurrentPage() {
  window.location.reload();
}

function FeaturePageLoadState({
  failed = false,
  onHome,
  reloadPage = reloadCurrentPage,
}: Omit<FeaturePageLoadBoundaryProps, 'children'> & { failed?: boolean }) {
  return (
    <section className="feature-page-load-state" role={failed ? 'alert' : 'status'}>
      <div className="feature-page-load-state__message">
        {failed ? '頁面載入失敗' : '載入中…'}
      </div>
      <div className="feature-page-load-state__actions">
        {failed ? <button type="button" onClick={reloadPage}>重新載入</button> : null}
        <button type="button" onClick={onHome}>返回首頁</button>
      </div>
    </section>
  );
}

// Suspense handles pending modules; this boundary also retains recovery controls
// when an import rejects or the page throws during rendering. Navigation clears
// failure state without remounting a healthy page shared by multiple screens.
export class FeaturePageLoadBoundary extends Component<FeaturePageLoadBoundaryProps, FeaturePageLoadBoundaryState> {
  state: FeaturePageLoadBoundaryState = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromProps(props: FeaturePageLoadBoundaryProps, state: FeaturePageLoadBoundaryState) {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    const { children, onHome, reloadPage } = this.props;
    if (this.state.failed) {
      // A rejected React.lazy import remains cached for this document. A real
      // reload is required to obtain the current deployment's module URLs.
      return <FeaturePageLoadState failed onHome={onHome} reloadPage={reloadPage} />;
    }
    return (
      <Suspense fallback={<FeaturePageLoadState onHome={onHome} />}>
        {children}
      </Suspense>
    );
  }
}
