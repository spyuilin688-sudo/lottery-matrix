const PRIMARY_LOGO = '/assets/lottery/primary-brand-logo.jpg';
function syncLogo(image) {
  if (!(image instanceof HTMLImageElement)) return;
  const target = new URL(PRIMARY_LOGO, location.href).href;
  if (image.src !== target) image.src = PRIMARY_LOGO;
}

function syncFeatureHeaders() {
  document.querySelectorAll('.feature-brand-header .feature-brand-logo').forEach(syncLogo);

  document.querySelectorAll('.mobile-page.notifications-scroll-lock').forEach((page) =>
    page.classList.remove('notifications-scroll-lock')
  );
  document.querySelectorAll('.mobile-page.history-scroll-lock').forEach((page) =>
    page.classList.remove('history-scroll-lock')
  );

  const notifications = document.querySelector('.notifications-screen');
  const notificationsPage = notifications?.closest('.mobile-page');
  if (notificationsPage) {
    notificationsPage.classList.add('notifications-scroll-lock');
    const scroll = notificationsPage.querySelector('.mobile-scroll');
    if (scroll instanceof HTMLElement && scroll.scrollTop !== 0) scroll.scrollTop = 0;
  }

  const history = document.querySelector('.draw-history-screen');
  const historyPage = history?.closest('.mobile-page');
  if (historyPage) {
    historyPage.classList.add('history-scroll-lock');
    const scroll = historyPage.querySelector('.mobile-scroll');
    if (scroll instanceof HTMLElement && scroll.scrollTop !== 0) scroll.scrollTop = 0;
  }
}

const observer = new MutationObserver(syncFeatureHeaders);
observer.observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener(
  'scroll',
  (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains('mobile-scroll')) return;
    if (!target.closest('.mobile-page.notifications-scroll-lock, .mobile-page.history-scroll-lock')) return;
    if (target.scrollTop !== 0) target.scrollTop = 0;
  },
  true
);

window.addEventListener('DOMContentLoaded', syncFeatureHeaders);
syncFeatureHeaders();
