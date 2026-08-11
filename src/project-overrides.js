const PRIMARY_LOGO = '/assets/lottery/primary-brand-logo.jpg';
const HOME_SHORTCUT_ICONS = {
  'Matrix 同星': '/assets/lottery/functions/同星.png',
  '號碼對照單': '/assets/lottery/functions/對照單.png',
  '連碰立柱計算機': '/assets/lottery/functions/計算機.png',
  'Matrix 牌單': '/assets/lottery/functions/牌單.png',
  'Matrix 指南': '/assets/lottery/functions/指南.png',
};
const QUICK_SETTING_ICONS = {
  'Matrix 同星': '/assets/lottery/functions/快捷同星.png',
  '歷史開獎號碼': '/assets/lottery/functions/快捷歷史號碼.png',
  '號碼對照單': '/assets/lottery/functions/快捷對照單.png',
  '連碰立柱計算機': '/assets/lottery/functions/快捷計算機.png',
  'Matrix 筆記本': '/assets/lottery/functions/快捷筆記本.png',
};
const MATRIX_STATUS_ICONS = {
  green: '/assets/lottery/functions/啟動.png',
  blue: '/assets/lottery/functions/聚合.png',
  purple: '/assets/lottery/functions/共振.png',
  orange: '/assets/lottery/functions/臨界.png',
};
const MATRIX_CORE_IMAGE = '/assets/lottery/functions/matrixcore.png';
const LATEST_DRAW_CARD_IMAGE = '/assets/lottery/functions/開獎資訊卡.png';

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

function syncQuickSettingIcons() {
  document.querySelectorAll('.quick-settings-dialog button').forEach((button) => {
    const label = button.querySelector('strong')?.textContent?.trim();
    if (!label) return;
    const src = QUICK_SETTING_ICONS[label];
    if (!src) return;
    const image = button.querySelector('img');
    if (!(image instanceof HTMLImageElement)) return;
    const target = new URL(src, location.href).href;
    if (image.src !== target) image.src = src;
  });
}

function syncMatrixStatusIcons() {
  document.querySelectorAll('.matrix-status-card').forEach((card) => {
    const tone = card.getAttribute('data-tone');
    if (!tone) return;
    const src = MATRIX_STATUS_ICONS[tone];
    if (!src) return;
    const image = card.querySelector('.matrix-status-artwork');
    if (!(image instanceof HTMLImageElement)) return;
    const target = new URL(src, location.href).href;
    if (image.src !== target) image.src = src;
  });
}

function syncMatrixCoreImage() {
  const image = document.querySelector('.matrix-core-banner img');
  if (!(image instanceof HTMLImageElement)) return;
  const target = new URL(MATRIX_CORE_IMAGE, location.href).href;
  if (image.src !== target) image.src = MATRIX_CORE_IMAGE;
}

function syncLatestDrawCardImage() {
  const card = document.querySelector('.latest-draw-card');
  if (!(card instanceof HTMLElement)) return;
  card.style.setProperty(
    'background',
    `linear-gradient(rgba(2, 7, 12, .08), rgba(2, 7, 12, .08)), url('${LATEST_DRAW_CARD_IMAGE}') center / 100% 100% no-repeat`,
    'important'
  );
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
  syncQuickSettingIcons();
  syncMatrixStatusIcons();
  syncMatrixCoreImage();
  syncLatestDrawCardImage();

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