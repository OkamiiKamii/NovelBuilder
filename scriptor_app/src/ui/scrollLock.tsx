// A page's scroll, as a gesture inside it needs it: held still while a card is dragged or a drawing is pinched or
// panned (Android's ScrollView takes a moving finger for itself unless its scrolling is off), and moved by the gesture
// when a dragged card nears the page's top or bottom. The scroll views of the pages that hold such gestures (Plan, a
// Plan page, a Visualize view) provide it; anything else gets null and does without.

import { type ComponentRef, createContext, type ReactNode, useContext, useMemo, useRef, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';

export type ScrollHost = {
  /** Holds the page still (true) or lets it scroll again (false). Several holders may hold at once. */
  hold: (on: boolean) => void;
  /** Scrolls the page by `dy`, within its content; returns how far it moved. */
  scrollBy: (dy: number) => number;
  /** Where the page's scroll view stands in the window (top and height), as last measured; null before it is. */
  frame: () => { y: number; height: number } | null;
};

const Context = createContext<ScrollHost | null>(null);

/** The scroll host of the page around, or null. */
export function useScrollHost(): ScrollHost | null {
  return useContext(Context);
}

/** For a page's ScrollView: the props to spread on it, and the provider to wrap its content in. */
export function useLockableScroll(): {
  scrollProps: {
    ref: React.RefObject<ComponentRef<typeof ScrollView> | null>;
    scrollEnabled: boolean;
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
    scrollEventThrottle: number;
    onLayout: () => void;
  };
  Provider: (props: { children: ReactNode }) => ReactNode;
} {
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const [holders, setHolders] = useState(0);
  const offset = useRef({ y: 0, max: Number.POSITIVE_INFINITY });
  const frame = useRef<{ y: number; height: number } | null>(null);
  const measure = () => {
    const node = ref.current as unknown as { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;
    node?.measureInWindow?.((_x, y, _w, height) => {
      frame.current = { y, height };
    });
  };
  const host = useMemo<ScrollHost>(
    () => ({
      hold: (on) => {
        if (on) measure();
        setHolders((n) => Math.max(0, n + (on ? 1 : -1)));
      },
      scrollBy: (dy) => {
        const y = Math.max(0, Math.min(offset.current.max, offset.current.y + dy));
        const moved = y - offset.current.y;
        if (moved === 0) return 0;
        offset.current.y = y;
        ref.current?.scrollTo({ y, animated: false });
        return moved;
      },
      frame: () => frame.current,
    }),
    [],
  );
  const Provider = useMemo(() => {
    const P = ({ children }: { children: ReactNode }) => <Context.Provider value={host}>{children}</Context.Provider>;
    return P;
  }, [host]);
  return {
    scrollProps: {
      ref,
      scrollEnabled: holders === 0,
      onScroll: (e) => {
        const n = e.nativeEvent;
        offset.current = { y: n.contentOffset.y, max: Math.max(0, n.contentSize.height - n.layoutMeasurement.height) };
      },
      scrollEventThrottle: 16,
      onLayout: measure,
    },
    Provider,
  };
}
