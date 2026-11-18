// Dragging cards on the scene board (FEATURES.md #258, "drag and drop, or buttons"), on React Native's own touch
// system. A long press on a card's title lifts it (a short press still opens its plan); it follows the finger as a
// small card, the place it would land is marked (in front of a card of its kind: a scene in front of a scene, a
// chapter in front of a chapter; or the "Drop here" ends: a scene at the end of a chapter, a chapter at the end of its
// part), and letting go moves it there by the board's own move (the same as its buttons: asked first when a chapter
// takes its scenes into another part, kept for Undo). Near the page's top or bottom, or a row of columns' sides, the
// board scrolls. Only a place the board allows (dropOf, src/domain/plot/board.ts) is marked or taken; while the board
// is filtered nothing lifts, as with the buttons. A port of the drag in flutter_app/lib/features/plot/board_page.dart
// (LongPressDraggable, DragTarget and _DropZone).

import { type ComponentRef, createContext, type ReactNode, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { type Place, dropOf } from '../../domain/plot/board';
import type { StoryNode } from '../../domain/records/storyNode';
import { useScrollHost } from '../scrollLock';
import { colors, fonts, space } from '../theme';

type Kind = 'chapter' | 'scene';
type Rect = { x: number; y: number; w: number; h: number };
type Target = { kind: Kind; place: Place; part: string | null; view: ComponentRef<typeof View> | null; rect: Rect | null };
export type Dragging = { id: string; kind: Kind; title: string };

/** How close to an edge (in the window) a dragged card makes the board scroll, and how far each frame. */
const edge = 72;
const step = 14;
/** How long a press lifts a card. */
const liftAfter = 420;

type Api = {
  register: (key: string, target: Omit<Target, 'rect'>) => void;
  unregister: (key: string) => void;
  lift: (node: StoryNode, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  drop: () => void;
  cancel: () => void;
  /** A row of columns (one part's), so the board can scroll it sideways while a card is dragged. */
  row: (part: string) => {
    ref: (r: ComponentRef<typeof ScrollView> | null) => void;
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
    scrollEventThrottle: number;
  };
};

export type State = { dragging: Dragging | null; over: string | null; movable: boolean; api: Api };
const Context = createContext<State | null>(null);

const titleOf = (n: StoryNode) => (n.title.length === 0 ? 'Untitled' : n.title);

/** The board's drag: give it the chapters and scenes as they stand, whether moving is on, and the board's move. */
export function useBoardDrag({
  nodes,
  movable,
  moveTo,
}: {
  nodes: readonly StoryNode[];
  movable: boolean;
  moveTo: (node: StoryNode, to: Place) => void;
}): {
  /** Give to DragScope around the board. */
  state: State;
  dragging: Dragging | null;
  /** For the board's outer view: the feedback card is drawn within it. */
  boardRef: React.RefObject<ComponentRef<typeof View> | null>;
  feedback: ReactNode;
} {
  const host = useScrollHost();
  const { width: screenW } = useWindowDimensions();
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const targets = useRef(new Map<string, Target>());
  const rows = useRef(new Map<string, { ref: ComponentRef<typeof ScrollView> | null; x: number; rect: Rect | null }>());
  const boardRef = useRef<ComponentRef<typeof View>>(null);
  const board = useRef({ x: 0, y: 0 });
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const latest = useRef({ nodes, moveTo, host, screenW, dragging, over, node: null as StoryNode | null, at: { x: 0, y: 0 } });
  // The newest of these, for the touch handlers and the scrolling timer (which are made once).
  useLayoutEffect(() => {
    latest.current = { ...latest.current, nodes, moveTo, host, screenW, dragging, over };
  });
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const ticks = useRef(0);

  const api = useMemo<Api>(() => {
    const measureAll = () => {
      boardRef.current?.measureInWindow((x, y) => {
        board.current = { x, y };
        place(latest.current.at.x, latest.current.at.y);
      });
      for (const t of targets.current.values()) {
        t.view?.measureInWindow((x, y, w, h) => {
          t.rect = { x, y, w, h };
        });
      }
      for (const r of rows.current.values()) {
        (r.ref as unknown as ComponentRef<typeof View> | null)?.measureInWindow?.((x, y, w, h) => {
          r.rect = { x, y, w, h };
        });
      }
    };
    /** The feedback card under the finger, above it a little so the finger does not hide where it lands. */
    const place = (x: number, y: number) => pos.setValue({ x: x - board.current.x - 90, y: y - board.current.y - 64 });
    /** The place under the finger that would take the card, or null. */
    const hit = (x: number, y: number): string | null => {
      const d = latest.current.dragging;
      if (d === null) return null;
      let best: string | null = null;
      let bestArea = Number.POSITIVE_INFINITY;
      for (const [key, t] of targets.current) {
        const r = t.rect;
        if (t.kind !== d.kind || r === null) continue;
        if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
        const area = r.w * r.h;
        if (area < bestArea) {
          best = key;
          bestArea = area;
        }
      }
      if (best === null) return null;
      return dropOf(latest.current.nodes, d.id, targets.current.get(best)!.place) === null ? null : best;
    };
    const mark = () => {
      const now = hit(latest.current.at.x, latest.current.at.y);
      if (now !== latest.current.over) setOver(now);
    };
    /** Everything drawn in the window moved by (dx, dy): the board, and the places (those in one row, if `part`). */
    const shift = (dx: number, dy: number, part: string | null) => {
      if (part === null) board.current = { x: board.current.x - dx, y: board.current.y - dy };
      for (const t of targets.current.values()) {
        if (t.rect !== null && (part === null || t.part === part)) t.rect = { ...t.rect, x: t.rect.x - dx, y: t.rect.y - dy };
      }
      if (part === null) for (const r of rows.current.values()) if (r.rect !== null) r.rect = { ...r.rect, y: r.rect.y - dy };
    };
    /** Near an edge: scroll the page (up or down) or the row under the finger (sideways). */
    const tick = () => {
      const { at, host: h, screenW: sw } = latest.current;
      let moved = false;
      const f = h?.frame();
      if (h && f) {
        const dir = at.y < f.y + edge ? -1 : at.y > f.y + f.height - edge ? 1 : 0;
        if (dir !== 0) {
          const dy = h.scrollBy(dir * step);
          if (dy !== 0) {
            shift(0, dy, null);
            moved = true;
          }
        }
      }
      for (const [part, r] of rows.current) {
        if (r.rect === null || r.ref === null || at.y < r.rect.y || at.y > r.rect.y + r.rect.h) continue;
        const left = Math.max(r.rect.x, 0);
        const right = Math.min(r.rect.x + r.rect.w, sw);
        const dir = at.x < left + edge ? -1 : at.x > right - edge ? 1 : 0;
        if (dir === 0) continue;
        const x = Math.max(0, r.x + dir * step);
        if (x === r.x) continue;
        const dx = x - r.x;
        r.x = x;
        r.ref.scrollTo({ x, animated: false });
        shift(dx, 0, part);
        moved = true;
      }
      if (moved) {
        place(at.x, at.y);
        mark();
        // Measured again now and then, as scrolling sideways past the end does not move what is drawn.
        if (++ticks.current % 12 === 0) measureAll();
      }
    };
    const stopTicking = () => {
      if (ticker.current !== null) clearInterval(ticker.current);
      ticker.current = null;
    };
    const finish = () => {
      stopTicking();
      latest.current.host?.hold(false);
      latest.current.node = null;
      setDragging(null);
      setOver(null);
    };
    return {
      register: (key, t) => {
        const was = targets.current.get(key);
        targets.current.set(key, { ...t, rect: was?.rect ?? null });
      },
      unregister: (key) => {
        targets.current.delete(key);
      },
      lift: (node, x, y) => {
        const kind: Kind = node.kind === 'chapter' ? 'chapter' : 'scene';
        latest.current.node = node;
        latest.current.at = { x, y };
        latest.current.dragging = { id: node.id, kind, title: titleOf(node) };
        latest.current.host?.hold(true);
        setDragging(latest.current.dragging);
        measureAll();
        // Again once the ends ("Drop here") have been drawn.
        setTimeout(measureAll, 90);
        stopTicking();
        ticker.current = setInterval(tick, 16);
      },
      move: (x, y) => {
        latest.current.at = { x, y };
        place(x, y);
        mark();
      },
      drop: () => {
        const node = latest.current.node;
        const key = hit(latest.current.at.x, latest.current.at.y);
        const target = key === null ? null : targets.current.get(key);
        finish();
        if (node !== null && target) latest.current.moveTo(node, target.place);
      },
      cancel: finish,
      row: (part) => ({
        ref: (r) => {
          const was = rows.current.get(part);
          if (r === null) rows.current.delete(part);
          else rows.current.set(part, { ref: r, x: was?.x ?? 0, rect: was?.rect ?? null });
        },
        onScroll: (e) => {
          const r = rows.current.get(part);
          if (r) r.x = e.nativeEvent.contentOffset.x;
        },
        scrollEventThrottle: 16,
      }),
    };
  }, [pos]);

  useEffect(() => () => {
    if (ticker.current !== null) clearInterval(ticker.current);
  }, []);

  const state = useMemo<State>(() => ({ dragging, over, movable, api }), [dragging, over, movable, api]);

  const feedback = dragging ? (
    <Animated.View pointerEvents="none" style={[styles.feedback, { transform: pos.getTranslateTransform() }]}>
      <Text style={styles.feedbackText} numberOfLines={2}>
        {dragging.title}
      </Text>
    </Animated.View>
  ) : null;

  return { state, dragging, boardRef, feedback };
}

/** Around the board: what its cards, places and rows read of the drag. */
export function DragScope({ state, children }: { state: State; children: ReactNode }) {
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

function useDrag(): State | null {
  return useContext(Context);
}

/** A card's title: a short press opens it, a long press lifts the card (when moving is on). */
export function DragHandle({ node, label, onTap, children }: { node: StoryNode; label: string; onTap: () => void; children: ReactNode }) {
  const drag = useDrag();
  const [pressed, setPressed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const st = useRef({ x0: 0, y0: 0, x: 0, y: 0, lifted: false, moved: false });
  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const at = (e: GestureResponderEvent) => ({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={drag?.movable ? 'Long press and drag to move it, or use its move buttons' : undefined}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate') onTap();
      }}
      onStartShouldSetResponder={() => true}
      // Before it is lifted, the page may take the finger to scroll; once lifted, the card keeps it.
      onResponderTerminationRequest={() => !st.current.lifted}
      onResponderGrant={(e) => {
        const p = at(e);
        st.current = { x0: p.x, y0: p.y, x: p.x, y: p.y, lifted: false, moved: false };
        setPressed(true);
        clear();
        if (drag?.movable) {
          timer.current = setTimeout(() => {
            st.current.lifted = true;
            setPressed(false);
            drag.api.lift(node, st.current.x, st.current.y);
          }, liftAfter);
        }
      }}
      onResponderMove={(e) => {
        const p = at(e);
        st.current.x = p.x;
        st.current.y = p.y;
        if (st.current.lifted) {
          drag?.api.move(p.x, p.y);
        } else if (!st.current.moved && Math.hypot(p.x - st.current.x0, p.y - st.current.y0) > 10) {
          st.current.moved = true;
          clear();
          setPressed(false);
        }
      }}
      onResponderRelease={() => {
        clear();
        setPressed(false);
        if (st.current.lifted) drag?.api.drop();
        else if (!st.current.moved) onTap();
        st.current.lifted = false;
      }}
      onResponderTerminate={() => {
        clear();
        setPressed(false);
        if (st.current.lifted) drag?.api.cancel();
        st.current.lifted = false;
      }}
      style={[styles.handle, pressed && styles.pressed]}
    >
      {children}
    </View>
  );
}

/** A card that takes a dragged card of its kind: it lands in front of this one. Marked while one is over it. */
export function DropTarget({
  id,
  kind,
  place,
  part,
  lanes,
  style,
  children,
}: {
  id: string;
  kind: Kind;
  place: Place;
  part: string | null;
  lanes: boolean;
  style?: object;
  children: ReactNode;
}) {
  const drag = useDrag();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const key = `${kind}:${id}`;
  useEffect(() => {
    drag?.api.register(key, { kind, place, part, view: ref.current });
  });
  useEffect(() => () => drag?.api.unregister(key), [drag?.api, key]);
  const on = drag?.over === key;
  const lifted = drag?.dragging?.id === id;
  return (
    <View
      ref={ref}
      collapsable={false}
      style={[
        style,
        lifted && styles.lifted,
        on && (kind === 'scene' || lanes ? styles.markTop : styles.markStart),
      ]}
    >
      {children}
    </View>
  );
}

/** Where a dragged card lands at the end of a chapter (a scene) or a part (a chapter): shown only while one is lifted. */
export function DropZone({ id, kind, place, part, label, style }: { id: string; kind: Kind; place: Place; part: string | null; label: string; style?: object }) {
  const drag = useDrag();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const key = `end:${kind}:${id}`;
  const shown = drag?.dragging?.kind === kind;
  useEffect(() => {
    if (shown) drag?.api.register(key, { kind, place, part, view: ref.current });
    else drag?.api.unregister(key);
  });
  useEffect(() => () => drag?.api.unregister(key), [drag?.api, key]);
  if (!shown) return null;
  const on = drag?.over === key;
  return (
    <View ref={ref} collapsable={false} style={[styles.zone, on && styles.zoneOn, style]} accessibilityLabel={label}>
      <Text style={styles.zoneText}>{label}</Text>
    </View>
  );
}

/** For a part's row of columns: the ScrollView props that let the board scroll it while a card is dragged. */
export function useRowScroll(part: string) {
  const drag = useDrag();
  return useMemo(() => (drag ? drag.api.row(part) : null), [drag, part]);
}

/** Whether a card is being dragged now (scroll views hold still). */
export function useDragging(): boolean {
  return useDrag()?.dragging != null;
}

const styles = StyleSheet.create({
  handle: { flex: 1, borderRadius: 6 },
  pressed: { backgroundColor: colors.border },
  lifted: { opacity: 0.4 },
  markTop: { borderTopWidth: 3, borderTopColor: colors.gold },
  markStart: { borderLeftWidth: 3, borderLeftColor: colors.gold },
  zone: { marginTop: 4, padding: space.md, borderRadius: 8, borderWidth: 1, borderColor: colors.gold },
  zoneOn: { backgroundColor: 'rgba(243, 182, 58, 0.18)' },
  zoneText: { fontFamily: fonts.ui, fontSize: 13, color: colors.text },
  feedback: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 180,
    zIndex: 50,
    elevation: 12,
    padding: space.md,
    borderRadius: 8,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  feedbackText: { fontFamily: fonts.ui, fontSize: 14, fontWeight: '700', color: colors.text },
});
