import { useSyncExternalStore } from 'react';

/** The kind of device the app is being used on. Each has its own interface, and its own saved workspace layout. */
export const FORMS = ['desktop', 'tablet', 'phone'] as const;
export type Form = (typeof FORMS)[number];
export const FORM_LABELS: Record<Form, string> = { desktop: 'Desktop', tablet: 'Tablet', phone: 'Phone' };

/** What the author is pointing with right now. It changes as they change tools: a tablet with a pen and a keyboard is all three. */
export const INPUTS = ['mouse', 'touch', 'stylus'] as const;
export type Input = (typeof INPUTS)[number];
export const INPUT_LABELS: Record<Input, string> = { mouse: 'Mouse and keyboard', touch: 'Touch', stylus: 'Stylus' };

export const BREAKPOINTS = { phone: 720, tablet: 1100, touchTablet: 1400, drawers: 900 };

/**
 * Which interface a screen gets. Width decides first, because a narrow
 * window needs the narrow interface whatever the machine is; a wide screen
 * whose main pointer is a finger is still a tablet.
 */
export function classify({ width, coarse }: { width: number; coarse: boolean }): Form {
  if (width < BREAKPOINTS.phone) return 'phone';
  if (width < BREAKPOINTS.tablet) return 'tablet';
  if (coarse && width < BREAKPOINTS.touchTablet) return 'tablet';
  return 'desktop';
}

/** The input a pointer event came from. Null for anything unrecognised, which changes nothing. */
export const inputOf = (pointerType: string): Input | null => (pointerType === 'mouse' ? 'mouse' : pointerType === 'touch' ? 'touch' : pointerType === 'pen' ? 'stylus' : null);

export interface Device {
  /** The interface in use: the detected one, unless the author chose another for this device. */
  form: Form;
  detected: Form;
  /** The author's choice for this device, if they made one. */
  override: Form | null;
  input: Input;
  width: number;
  /** Side panels slide over the page instead of sitting beside it. */
  drawers: boolean;
}

interface Environment {
  width: () => number;
  coarse: () => boolean;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

const OVERRIDE_KEY = 'novel-builder:device';

/** Tracks the device as it changes (a rotated tablet, a resized window, a pen picked up). The environment is injected so it runs in tests. */
export function createDeviceStore(env: Environment) {
  const listeners = new Set<() => void>();
  const readOverride = (): Form | null => {
    try {
      const value = env.storage?.getItem(OVERRIDE_KEY);
      return FORMS.includes(value as Form) ? (value as Form) : null;
    } catch {
      return null;
    }
  };
  let override = readOverride();
  let input: Input = env.coarse() ? 'touch' : 'mouse';
  const compute = (): Device => {
    const width = env.width();
    const detected = classify({ width, coarse: env.coarse() });
    return { form: override ?? detected, detected, override, input, width, drawers: width <= BREAKPOINTS.drawers };
  };
  let current = compute();
  const update = () => {
    const next = compute();
    if (next.form === current.form && next.input === current.input && next.drawers === current.drawers && next.override === current.override && next.detected === current.detected) {
      current = { ...current, width: next.width };
      return;
    }
    current = next;
    listeners.forEach((listener) => listener());
  };
  return {
    get: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** The screen changed size or the main pointer changed. */
    measure: update,
    /** A pointer was used: the interface follows the tool in hand. */
    pointer(pointerType: string) {
      const next = inputOf(pointerType);
      if (!next || next === input) return;
      input = next;
      update();
    },
    /** Uses one interface on this device whatever its size, or goes back to detecting it. Kept on this device only. */
    setOverride(form: Form | null) {
      override = form;
      try {
        if (form) env.storage?.setItem(OVERRIDE_KEY, form);
        else env.storage?.removeItem(OVERRIDE_KEY);
      } catch {
        // storage unavailable: the choice lasts for this visit
      }
      update();
    },
  };
}

const browser = typeof window !== 'undefined';
const safeLocal = (): Storage | null => {
  try {
    return browser ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** This device. */
export const device = createDeviceStore({
  width: () => (browser ? window.innerWidth : 1280),
  coarse: () => browser && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
  storage: safeLocal(),
});

/** The interface in use on this device, for code that is not a component. */
export const currentForm = (): Form => device.get().form;

let started = false;
/**
 * Starts following the device, and marks the page with what it finds
 * (`data-form`, `data-input`) so the styles can adapt targets and layout.
 */
export function startDevice(): void {
  if (started || !browser) return;
  started = true;
  const mark = () => {
    const { form, input } = device.get();
    document.documentElement.dataset.form = form;
    document.documentElement.dataset.input = input;
  };
  device.subscribe(mark);
  mark();
  window.addEventListener('resize', device.measure);
  // What is left of the screen above an on-screen keyboard, for the writing screen to fit itself to.
  const viewport = window.visualViewport;
  const fit = () => viewport && document.documentElement.style.setProperty('--vvh', `${Math.round(viewport.height)}px`);
  viewport?.addEventListener('resize', fit);
  fit();
  if (typeof matchMedia === 'function') matchMedia('(pointer: coarse)').addEventListener('change', device.measure);
  window.addEventListener('pointerdown', (e) => device.pointer(e.pointerType), { capture: true, passive: true });
}

export const useDevice = (): Device => useSyncExternalStore(device.subscribe, device.get);
