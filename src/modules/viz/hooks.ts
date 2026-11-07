import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { applyCommand, commandForKey, fitTo, IDENTITY, panBy, pinch, zoomAt, STEP, DEFAULT_LIMITS, type Bounds, type Limits, type Point, type Size, type View, type ZoomCommand } from './zoom';

/**
 * Reading and setting the page address's parameters. Filters replace the
 * current history entry (they are not places to go back to); a selection can
 * add one, so the Back button returns to what was selected before.
 */
export function useAddress() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const set = useCallback(
    (changes: Record<string, string | null>, options: { push?: boolean } = {}) => {
      // Built on the address as it is this moment, not as it was at the last render: two changes in a row
      // (choosing "List", then typing a search) both stay, instead of the second undoing the first.
      const next = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const search = next.toString();
      navigate({ pathname: window.location.pathname, search: search ? `?${search}` : '' }, { replace: !options.push });
    },
    [navigate],
  );
  return { params, set };
}

/** The size of an element as it is laid out now, following it as the window or a panel changes. */
export function useSize<T extends HTMLElement>(): [(element: T | null) => void, Size] {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((element: T | null) => {
    observer.current?.disconnect();
    if (!element) return;
    observer.current = new ResizeObserver(([entry]) => setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) }));
    observer.current.observe(element);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, size];
}

/** Marks of a drawing carry `data-mark`; pressing on one selects it rather than starting a pan. */
const onMark = (target: EventTarget | null) => target instanceof Element && target.closest('[data-mark]') !== null;

/**
 * Zoom and pan for a drawing: drag the background (mouse, pen or one finger),
 * pinch with two fingers, use the wheel, or focus the drawing and use + − 0
 * and the arrow keys. The first time the drawing has a size and something to
 * show, it is fitted to the space; when its space changes (a record's details
 * opening beside it, the window resized), it is fitted again, unless the
 * author has moved or zoomed it since: then it stays as they left it.
 */
export function useZoomPan(bounds: Bounds | null, limits: Limits = DEFAULT_LIMITS) {
  const [sizeRef, size] = useSize<HTMLDivElement>();
  const [view, setView] = useState<View>(IDENTITY);
  const fitted = useRef(false);
  // Moved or zoomed by the author (not by a fit): their view is kept when the space changes.
  const touched = useRef(false);
  const fittedSize = useRef<Size | null>(null);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const latest = useRef({ view, size, bounds, limits });
  latest.current = { view, size, bounds, limits };

  useEffect(() => {
    if (!bounds || !size.width || !size.height) return;
    const resized = fittedSize.current !== null && (fittedSize.current.width !== size.width || fittedSize.current.height !== size.height);
    if (fitted.current && !(resized && !touched.current)) return;
    fitted.current = true;
    fittedSize.current = size;
    setView(fitTo(bounds, size, 24, limits));
  }, [bounds, size, limits]);

  // A wheel listener React would add is passive and cannot stop the page scrolling; this one can.
  useEffect(() => {
    const el = element;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      touched.current = true;
      setView((v) => zoomAt(v, e.deltaY < 0 ? STEP : 1 / STEP, { x: e.clientX - box.left, y: e.clientY - box.top }, latest.current.limits));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [element]);

  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      setElement(el);
      sizeRef(el);
    },
    [sizeRef],
  );

  const command = useCallback((cmd: ZoomCommand) => {
    touched.current = true;
    setView((v) => applyCommand(v, cmd, latest.current.size, latest.current.bounds, latest.current.limits));
  }, []);

  const local = (e: PointerEvent<HTMLDivElement>): Point => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  const handlers = {
    onPointerDown(e: PointerEvent<HTMLDivElement>) {
      if (onMark(e.target) || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, local(e));
    },
    onPointerMove(e: PointerEvent<HTMLDivElement>) {
      const before = pointers.current.get(e.pointerId);
      if (!before) return;
      const now = local(e);
      const others = [...pointers.current].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
      touched.current = true;
      if (others.length === 1) setView((v) => pinch(v, [before, others[0]], [now, others[0]], latest.current.limits));
      else if (!others.length) setView((v) => panBy(v, now.x - before.x, now.y - before.y));
      pointers.current.set(e.pointerId, now);
    },
    onPointerUp(e: PointerEvent<HTMLDivElement>) {
      pointers.current.delete(e.pointerId);
    },
    onPointerCancel(e: PointerEvent<HTMLDivElement>) {
      pointers.current.delete(e.pointerId);
    },
    /** A mark reached by the keyboard outside the part shown is brought into view, so focus is never somewhere unseen. */
    onFocus(e: FocusEvent<HTMLDivElement>) {
      if (e.target === e.currentTarget || !(e.target instanceof Element)) return;
      const [outer, box] = [e.currentTarget.getBoundingClientRect(), e.target.getBoundingClientRect()];
      const margin = 24;
      if (box.width > outer.width - margin * 2 || box.height > outer.height - margin * 2) return;
      const dx = box.left < outer.left + margin ? outer.left + margin - box.left : box.right > outer.right - margin ? outer.right - margin - box.right : 0;
      const dy = box.top < outer.top + margin ? outer.top + margin - box.top : box.bottom > outer.bottom - margin ? outer.bottom - margin - box.bottom : 0;
      if (dx || dy) {
        touched.current = true;
        setView((v) => panBy(v, dx, dy));
      }
    },
    /** Keys move the drawing only while the drawing itself has focus; a focused mark keeps the arrows for moving between marks. */
    onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
      if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
      const cmd = commandForKey(e.key);
      if (!cmd) return;
      e.preventDefault();
      command(cmd);
    },
  };

  return { ref, size, view, setView, command, handlers };
}
