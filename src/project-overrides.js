const PRIMARY_LOGO = '/assets/lottery/primary-brand-logo.jpg';
const HOME_SHORTCUT_ICONS = {
  'Matrix 同星': '/assets/lottery/functions/matrix-tongxing.png',
  '號碼對照單': '/assets/lottery/functions/number-reference.png',
  '連碰立柱計算機': '/assets/lottery/functions/collision-column-calculator.png',
  'Matrix 牌單': '/assets/lottery/functions/matrix-card.png',
  'Matrix 指南': '/assets/lottery/functions/matrix-guide.png',
};

function findProfileNavButton() {
  return [...document.querySelectorAll('.bottom-navigation-item')].find((button) =>
    button.querySelector('.bottom-navigation-label')?.textContent?.trim() === '我的'
  );
}

function syncLogo(image) {
  if (!(image instanceof HTMLImageElement)) return;
  const target = new URL(PRIMARY_LOGO, location.href).href;
  if (image.src !== target) image.src = PRIMARY_LOGO;
}

function syncHomeShortcutIcons() {
  Object.entries(HOME_SHORTCUT_ICONS).forEach(([label, src]) => {
    const image = document.querySelector(`.home-shortcut[aria-label="${label}"] img`);
    if (!(image instanceof HTMLImageElement)) return;
    const target = new URL(src, location.href).href;
    if (image.src !== target) image.src = src;
  });
}

function syncFeatureHeaders() {
  document.querySelectorAll('.feature-brand-header .feature-brand-logo').forEach(syncLogo);

  document.querySelectorAll('.profile-detail-screen .feature-brand-header[data-compact="true"]').forEach((compactHeader) => {
    compactHeader.classList.add('profile-subpage-header');
    syncLogo(compactHeader.querySelector('.feature-brand-logo'));

    if (!compactHeader.querySelector('.profile-subpage-back')) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'icon-button back-button profile-subpage-back';
      back.setAttribute('aria-label', '返回');
      back.setAttribute('data-scroll-drag', 'ignore');
      back.textContent = '‹';
      back.addEventListener('click', () => findProfileNavButton()?.click());
      compactHeader.prepend(back);
    }
  });

  syncHomeShortcutIcons();

  document.querySelectorAll('.mobile-page.notifications-scroll-lock').forEach((page) =>
    page.classList.remove('notifications-scroll-lock')
  );

  const notifications = document.querySelector('.notifications-screen');
  const notificationsPage = notifications?.closest('.mobile-page');
  if (notificationsPage) {
    notificationsPage.classList.add('notifications-scroll-lock');
    const scroll = notificationsPage.querySelector('.mobile-scroll');
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
    if (!target.closest('.mobile-page.notifications-scroll-lock')) return;
    if (target.scrollTop !== 0) target.scrollTop = 0;
  },
  true
);

window.addEventListener('DOMContentLoaded', syncFeatureHeaders);
syncFeatureHeaders();
