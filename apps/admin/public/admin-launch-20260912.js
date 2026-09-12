(() => {
    const screen = document.getElementById('admin-launch-screen');
    const root = document.getElementById('root');
    if (!screen || !root) return;
    const image = screen.querySelector('img');
    let visibleUntil = Infinity;
    let closed = false;
    let closeTimer;
    root.inert = true;

    const close = () => {
        if (closed) return;
        closed = true;
        clearTimeout(closeTimer);
        clearTimeout(timeout);
        observer.disconnect();
        image.removeEventListener('load', loaded);
        image.removeEventListener('error', failed);
        root.inert = false;
        screen.remove();
    };
    const finishWhenReady = () => {
        if (closed || !root.childElementCount || !Number.isFinite(visibleUntil)) return;
        clearTimeout(closeTimer);
        closeTimer = setTimeout(close, Math.max(0, visibleUntil - performance.now()));
    };
    const loaded = () => {
        visibleUntil = performance.now() + 1200;
        finishWhenReady();
    };
    const failed = () => {
        visibleUntil = 0;
        finishWhenReady();
    };
    const observer = new MutationObserver(finishWhenReady);
    observer.observe(root, { childList: true });
    const timeout = setTimeout(close, 10000);
    if (image.complete) {
        if (image.naturalWidth > 0) loaded();
        else failed();
    } else {
        image.addEventListener('load', loaded, { once: true });
        image.addEventListener('error', failed, { once: true });
    }
})();
