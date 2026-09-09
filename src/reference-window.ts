import { useLayoutEffect, useRef, useState } from 'react';

// Keep the existing page scroller and reserve the full list height. Only the
// viewport plus overscan is mounted, including a focused row for keyboard users.
export function useReferenceWindow(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [windowState, setWindowState] = useState({ start: 0, end: 40, rowHeight: 32 });
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const measureRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    let scroller: HTMLElement | null = list.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    let frame: number | null = null;
    const measure = () => {
      const row = list.querySelector<HTMLElement>('[data-reference-index]');
      const rowHeight = row?.offsetHeight || 32;
      const scale = scroller && scroller.offsetHeight ? scroller.getBoundingClientRect().height / scroller.offsetHeight : 1;
      const safeScale = scale || 1;
      const viewportTop = scroller ? scroller.getBoundingClientRect().top + scroller.clientTop * safeScale : 0;
      const viewportHeight = scroller?.clientHeight || window.innerHeight || 800;
      const top = (viewportTop - list.getBoundingClientRect().top) / safeScale;
      const start = Math.max(0, Math.min(count - 1, Math.floor(top / rowHeight) - 10));
      const end = Math.min(count, Math.max(start + 1, Math.ceil((top + viewportHeight) / rowHeight) + 10));
      setWindowState(previous => previous.start === start && previous.end === end && previous.rowHeight === rowHeight
        ? previous : { start, end, rowHeight });
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => { frame = null; measure(); });
    };
    measureRef.current = measure;
    measure();
    document.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(list);
    if (scroller) observer?.observe(scroller);
    return () => {
      document.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [count]);
  // Query panels can collapse without resizing the viewport.
  useLayoutEffect(() => { measureRef.current(); });

  const indices = Array.from({ length: Math.max(0, Math.min(count, windowState.end) - windowState.start) }, (_, i) => windowState.start + i);
  if (focusedIndex !== null && focusedIndex < count && !indices.includes(focusedIndex)) indices.push(focusedIndex);
  indices.sort((a, b) => a - b);
  return { ref, indices, rowHeight: windowState.rowHeight, setFocusedIndex };
}
