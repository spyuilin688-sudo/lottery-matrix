import { Component, Suspense, type ReactNode } from 'react';

export class AdminPanelLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <div className="error" role="alert">頁面載入失敗 <button type="button" onClick={() => window.location.reload()}>重新載入</button></div>;
    }
    return <Suspense fallback={<div className="loading" role="status">頁面載入中…</div>}>
      {this.props.children}
    </Suspense>;
  }
}
