// Pinch to zoom and drag to move, for the drawings that zoom (the knowledge graph, the ability tree, the maps), on
// React Native's own touch system: no gesture library. A drawing shows its content at `screen = t + k · p`; two fingers
// zoom around the point between them (the point under them stays under them) and move with them, one finger moves
// (when `pan` allows), a tap still reaches what is under it. Taps go first to the marks drawn (they take the touch as it
// starts); a touch on the bare drawing, two fingers anywhere, or a finger that has moved a little, comes here. While
// a gesture runs the page around is held still (scrollLock.tsx), so Android's ScrollView does not take the finger.
//
// Each move calls `onChange` with the new {k, tx, ty}: a drawing keeps its layout (positions in its own units) and only
// draws it again at the new zoom and offset, or, as the tree and the maps do, moves and scales the drawn content as a
// whole (see `liveTransform`) and redraws it only when the gesture ends.

import { type ComponentRef, useLayoutEffect, useMemo, useRef } from 'react';
import { type GestureResponderEvent, type LayoutChangeEvent, PanResponder, type PanResponderInstance, type View } from 'react-native';

import { useScrollHost } from '../scrollLock';

export type PanZoom = { k: number; tx: number; ty: number };

type Options = {
  /** The zoom and offset now. */
  view: PanZoom;
  /** Called on every move with the new zoom and offset. */
  onChange: (v: PanZoom) => void;
  /** Called once when the fingers lift. */
  onEnd?: (v: PanZoom) => void;
  /** The zoom's bounds. */
  min: number;
  max: number;
  /** Whether one finger moves the drawing (a map at its whole size leaves one finger to the page). */
  pan: boolean;
  /** Whether a touch starting on the bare drawing is taken at once (the graph and the tree: yes; a map: only zoomed). */
  takeBare?: boolean;
  /** Keeps the offset within bounds, given the new zoom. */
  clamp?: (v: PanZoom) => PanZoom;
};

type Touch = { pageX: number; pageY: number };

const between = (t: readonly Touch[]) =>
  t.length >= 2 ? { x: (t[0].pageX + t[1].pageX) / 2, y: (t[0].pageY + t[1].pageY) / 2 } : { x: t[0].pageX, y: t[0].pageY };
const apart = (t: readonly Touch[]) => (t.length >= 2 ? Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY) : 0);

export function usePinchPan(options: Options): {
  panHandlers: PanResponderInstance['panHandlers'];
  /** For the drawing's box: attach as its ref and onLayout, so the pinch point is found within it. */
  ref: React.RefObject<ComponentRef<typeof View> | null>;
  onLayout: (e: LayoutChangeEvent) => void;
} {
  const latest = useRef(options);
  const host = useScrollHost();
  const hostRef = useRef(host);
  // The newest options and page, for the touch handlers (which are made once).
  useLayoutEffect(() => {
    latest.current = options;
    hostRef.current = host;
  });
  const ref = useRef<ComponentRef<typeof View>>(null);
  /** Where the box stands in the window. */
  const origin = useRef({ x: 0, y: 0 });
  const measure = () => {
    ref.current?.measureInWindow((x, y) => {
      origin.current = { x, y };
    });
  };
  /** The gesture under way: how many fingers, where they started, and the view then. */
  const g = useRef<{ n: number; at: { x: number; y: number }; d: number; start: PanZoom; held: boolean } | null>(null);

  const responder = useMemo(() => {
    const touchesOf = (e: GestureResponderEvent): Touch[] => (e.nativeEvent.touches as unknown as Touch[]).slice(0, 2);
    const begin = (touches: readonly Touch[]) => {
      const was = g.current;
      g.current = { n: touches.length, at: between(touches), d: apart(touches), start: latest.current.view, held: was?.held ?? false };
    };
    const hold = (on: boolean) => {
      const now = g.current;
      if (now === null || now.held === on) return;
      now.held = on;
      hostRef.current?.hold(on);
    };
    const end = () => {
      hold(false);
      g.current = null;
      latest.current.onEnd?.(latest.current.view);
    };
    const wants = (e: GestureResponderEvent, moved: number) => {
      const n = e.nativeEvent.touches.length;
      return n >= 2 || (latest.current.pan && moved > 6);
    };
    return PanResponder.create({
      // Two fingers are taken from whatever had the first (a mark's press gives way); so is a finger that has moved.
      onStartShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length >= 2,
      onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length >= 2 || (latest.current.takeBare ?? false),
      onMoveShouldSetPanResponderCapture: (e, s) => wants(e, Math.abs(s.dx) + Math.abs(s.dy)),
      onMoveShouldSetPanResponder: (e, s) => wants(e, Math.abs(s.dx) + Math.abs(s.dy)),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        measure();
        begin(touchesOf(e));
        hold(true);
      },
      onPanResponderMove: (e) => {
        const touches = touchesOf(e);
        if (touches.length === 0) return;
        const now = g.current;
        // A finger added or lifted: carry on from here, so the drawing does not jump.
        if (now === null || touches.length !== now.n) {
          begin(touches);
          return;
        }
        const o = latest.current;
        if (touches.length < 2 && !o.pan) return;
        const at = between(touches);
        const ratio = touches.length >= 2 && now.d > 0 ? apart(touches) / now.d : 1;
        const k = Math.max(o.min, Math.min(o.max, now.start.k * ratio));
        const r = k / now.start.k;
        // The point that was under the fingers stays under them: in the box, f' − (f − t)·r.
        const fx = now.at.x - origin.current.x;
        const fy = now.at.y - origin.current.y;
        let next: PanZoom = {
          k,
          tx: at.x - origin.current.x - (fx - now.start.tx) * r,
          ty: at.y - origin.current.y - (fy - now.start.ty) * r,
        };
        if (o.clamp) next = o.clamp(next);
        o.onChange(next);
      },
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
    });
  }, []);

  return {
    panHandlers: responder.panHandlers,
    ref,
    onLayout: () => measure(),
  };
}

/** For content drawn at a scale `drawnK` and moved by `view`: the transform that shows it at `view.k` with its top left
 * corner at (tx, ty), for a box `width` × `height` (React Native scales around the middle of what it scales). */
export function liveTransform(view: PanZoom, drawnK: number, width: number, height: number) {
  const r = view.k / drawnK;
  return [{ translateX: view.tx - (width / 2) * (1 - r) }, { translateY: view.ty - (height / 2) * (1 - r) }, { scale: r }];
}
