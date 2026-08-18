const DEBUG_PARAM = 'layoutDebug';
const DEBUG_ROOT_ID = 'matrix-layout-debug-overlay';
const DEBUG_STYLE_ID = 'matrix-layout-debug-style';

const TARGET_SELECTORS = [
  '.feature-body',
  '.matrix-title-banner',
  '.explore-settings',
  '.explore-settings .section-title',
  '.explore-settings .setting-grid',
  '.explore-settings .setting-grid > label',
  '.explore-settings .setting-grid > label > span',
  '.explore-settings .setting-label-icon',
  '.explore-settings .select-box',
  '.explore-settings .segmented',
  '.explore-settings .segmented button',
  '.hit-advanced-panel',
  '.history-panel',
  '.repeat-stats-panel',
  '.result-panel',
  '.primary-action',
];

function px(value: string) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : 0;
}

function boxValues(style: CSSStyleDeclaration, prefix: 'margin' | 'padding') {
  return [
    px(style[`${prefix}Top`]),
    px(style[`${prefix}Right`]),
    px(style[`${prefix}Bottom`]),
    px(style[`${prefix}Left`]),
  ].join('/');
}

function shortName(element: Element) {
  const className = Array.from(element.classList).slice(0, 2).join('.');
  return className ? `.${className}` : element.tagName.toLowerCase();
}

function describeElement(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  const gap = style.gap && style.gap !== 'normal' ? `${px(style.gap)}px` : '0px';
  return `${shortName(element)}  ${Math.round(rect.width)}×${Math.round(rect.height)}  m:${boxValues(style, 'margin')}  p:${boxValues(style, 'padding')}  gap:${gap}`;
}

function ensureStyle() {
  if (document.getElementById(DEBUG_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = DEBUG_STYLE_ID;
  style.textContent = `
#${DEBUG_ROOT_ID}{position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
#${DEBUG_ROOT_ID} .layout-debug-box{position:fixed;box-sizing:border-box;border:1px dashed rgba(255,88,88,.92);background:rgba(255,88,88,.025)}
#${DEBUG_ROOT_ID} .layout-debug-label{position:absolute;left:0;top:0;max-width:min(330px,88vw);padding:2px 4px;transform:translateY(-100%);border-radius:3px;background:rgba(8,10,14,.94);color:#fff;font-size:9px;font-weight:600;line-height:1.25;white-space:normal;box-shadow:0 0 0 1px rgba(255,88,88,.7)}
`;
  document.head.appendChild(style);
}

function ensureOverlayRoot() {
  let root = document.getElementById(DEBUG_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = DEBUG_ROOT_ID;
    root.setAttribute('aria-hidden', 'true');
    document.body.appendChild(root);
  }
  return root;
}

function collectTargets(screen: HTMLElement) {
  const seen = new Set<HTMLElement>();
  const targets: HTMLElement[] = [];
  for (const selector of TARGET_SELECTORS) {
    for (const element of screen.querySelectorAll<HTMLElement>(selector)) {
      if (seen.has(element)) continue;
      seen.add(element);
      targets.push(element);
    }
  }
  return targets;
}

function renderOverlay() {
  const root = ensureOverlayRoot();
  root.replaceChildren();
  const screen = document.querySelector<HTMLElement>('.matrix-explore-main-screen');
  if (!screen) return;

  for (const element of collectTargets(screen)) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom < 0 || rect.top > window.innerHeight) continue;
    const box = document.createElement('div');
    box.className = 'layout-debug-box';
    box.style.left = `${Math.round(rect.left)}px`;
    box.style.top = `${Math.round(rect.top)}px`;
    box.style.width = `${Math.round(rect.width)}px`;
    box.style.height = `${Math.round(rect.height)}px`;
    const label = document.createElement('span');
    label.className = 'layout-debug-label';
    label.textContent = describeElement(element);
    box.appendChild(label);
    root.appendChild(box);
  }
}

export function installLayoutDebugMode() {
  const enabled = new URLSearchParams(window.location.search).get(DEBUG_PARAM) === '1';
  if (!enabled) return;

  ensureStyle();
  let frame = 0;
  const schedule = () => {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(renderOverlay);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('scroll', schedule, { passive: true });
  schedule();
}
