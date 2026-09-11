import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerAdminServiceWorker } from './admin-pwa';
import './index.css';

void registerAdminServiceWorker().catch(() => {
  // Installation remains optional; the admin page must still load if registration fails.
});

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
