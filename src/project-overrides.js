const PRIMARY_LOGO = '/assets/lottery/primary-brand-logo.jpg';

function findProfileNavButton() {
  return [...document.querySelectorAll('.bottom-navigation-item')].find((button) =>
    button.querySelector('.bottom-navigation-label')?.textContent?.trim() === '我的'
  );
}

function syncFeatureHeaders() {
  document.querySelectorAll('.feature-brand-header:not([data-compact="true"]) .feature-brand-logo').forEach((img) => {
    if (img instanceof HTMLImageElement && img.src !== new URL(PRIMARY_LOGO, location.href).href) img.src = PRIMARY_LOGO;
  });

  const profileDetail = document.querySelector('.profile-detail-screen');
  const compactHeader = profileDetail?.querySelector('.feature-brand-header[data-compact="true"]');
  if (compactHeader) {
    compactHeader.classList.add('profile-subpage-header');
    const logo = compactHeader.querySelector('.feature-brand-logo');
    if (logo instanceof HTMLImageElement && logo.src !== new URL(PRIMARY_LOGO, location.href).href) logo.src = PRIMARY_LOGO;
    if (!compactHeader.querySelector('.profile-subpage-back')) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'profile-subpage-back';
      back.setAttribute('aria-label', '返回');
      back.textContent = '‹';
      back.addEventListener('click', () => findProfileNavButton()?.click());
      compactHeader.prepend(back);
    }
  }

  document.querySelectorAll('.mobile-scroll-content').forEach((node) => node.classList.remove('notifications-scroll-lock'));
  const notifications = document.querySelector('.notifications-screen');
  notifications?.closest('.mobile-scroll-content')?.classList.add('notifications-scroll-lock');
}

const observer = new MutationObserver(syncFeatureHeaders);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('DOMContentLoaded', syncFeatureHeaders);
syncFeatureHeaders();
