import { createContext, useContext, useEffect, useRef, useState } from 'react';

export type DrawerSide = 'left' | 'right';

/** What the adaptive parts of a workspace share: which side panel is slid over the page, and the things reachable from anywhere. */
export interface Shell {
  /** The side panel showing as a drawer, on a screen too narrow to have it beside the page. Never saved. */
  drawer: DrawerSide | null;
  setDrawer: (side: DrawerSide | null) => void;
  openNote: () => void;
  openSearch: () => void;
}

export const ShellContext = createContext<Shell>({ drawer: null, setDrawer: () => {}, openNote: () => {}, openSearch: () => {} });
export const useShell = (): Shell => useContext(ShellContext);

const EDGE = 28;
const TRAVEL = 56;

/** Decides what a finished swipe means. Only a mostly-horizontal swipe from a screen edge opens a panel, so selecting text and scrolling are never mistaken for one. */
export function readSwipe(swipe: { startX: number; startY: number; endX: number; endY: number; width: number }, drawer: DrawerSide | null): { open: DrawerSide } | 'close' | null {
  const dx = swipe.endX - swipe.startX;
  const dy = swipe.endY - swipe.startY;
  if (Math.abs(dx) < TRAVEL || Math.abs(dy) > Math.abs(dx) * 0.6) return null;
  if (drawer) return (drawer === 'left' && dx < 0) || (drawer === 'right' && dx > 0) ? 'close' : null;
  if (swipe.startX <= EDGE && dx > 0) return { open: 'left' };
  if (swipe.startX >= swipe.width - EDGE && dx < 0) return { open: 'right' };
  return null;
}

/** Swipe in from the left or right edge to bring that side's panel over the page; swipe it back to put it away. */
export function useEdgeSwipe(enabled: boolean, drawer: DrawerSide | null, setDrawer: (side: DrawerSide | null) => void): void {
  const state = useRef({ drawer, setDrawer });
  state.current = { drawer, setDrawer };
  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number } | null = null;
    const onStart = (e: TouchEvent) => {
      start = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    };
    const onEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      if (!start || !touch) return;
      const result = readSwipe({ startX: start.x, startY: start.y, endX: touch.clientX, endY: touch.clientY, width: window.innerWidth }, state.current.drawer);
      start = null;
      if (result === 'close') state.current.setDrawer(null);
      else if (result) state.current.setDrawer(result.open);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [enabled]);
}

interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

const recognitionClass = (): (new () => Recognition) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/**
 * Dictation through the browser's speech recognition, where it has one.
 * Each finished phrase is handed over exactly as recognised; nothing is
 * rewritten here. Where the browser has none, `supported` is false and the
 * keyboard's own microphone remains the way to dictate.
 */
export function useDictation(onText: (text: string) => void): { supported: boolean; listening: boolean; error: string | null; toggle: () => void } {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<Recognition | null>(null);
  const handler = useRef(onText);
  handler.current = onText;
  useEffect(() => () => active.current?.stop(), []);
  const supported = recognitionClass() !== null;
  const toggle = () => {
    if (active.current) return active.current.stop();
    const Class = recognitionClass();
    if (!Class) return;
    const recognition = new Class();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = navigator.language || 'en-US';
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal && event.results[i][0]?.transcript) handler.current(event.results[i][0].transcript);
    };
    recognition.onerror = (event) => setError(event.error === 'not-allowed' ? 'The microphone is not allowed for this site.' : event.error === 'no-speech' ? null : 'Dictation stopped.');
    recognition.onend = () => {
      active.current = null;
      setListening(false);
    };
    setError(null);
    active.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      active.current = null;
      setListening(false);
      setError('Dictation could not start.');
    }
  };
  return { supported, listening, error, toggle };
}
