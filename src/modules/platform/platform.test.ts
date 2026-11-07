import { describe, expect, it } from 'vitest';
import { prefsKey } from '@/modules/manuscript/preferences';
import { MODES, SLOTS, createStudioStore, standardLayout, studioKeys } from '@/modules/studio/store';
import { isSyncedSetting, syncedSettingKeys } from '@/modules/sync/account';
import { FORMS, classify, createDeviceStore, inputOf, type Form } from './device';
import { readSwipe } from './shell';

function memory() {
  const data = new Map<string, string>();
  return { data, storage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) } };
}

describe('recognising the device', () => {
  it('goes by width first, and treats a wide screen driven by a finger as a tablet', () => {
    expect(classify({ width: 390, coarse: true })).toBe('phone');
    expect(classify({ width: 390, coarse: false })).toBe('phone');
    expect(classify({ width: 719, coarse: false })).toBe('phone');
    expect(classify({ width: 720, coarse: false })).toBe('tablet');
    expect(classify({ width: 820, coarse: true })).toBe('tablet');
    expect(classify({ width: 1099, coarse: false })).toBe('tablet');
    expect(classify({ width: 1100, coarse: false })).toBe('desktop');
    expect(classify({ width: 1180, coarse: true })).toBe('tablet');
    expect(classify({ width: 1366, coarse: true })).toBe('tablet');
    expect(classify({ width: 1400, coarse: true })).toBe('desktop');
    expect(classify({ width: 2560, coarse: false })).toBe('desktop');
  });

  it('reads the input from the pointer in use', () => {
    expect([inputOf('mouse'), inputOf('touch'), inputOf('pen'), inputOf('')]).toEqual(['mouse', 'touch', 'stylus', null]);
  });

  it('follows the device as it changes, and tells listeners only when something that matters did', () => {
    const env = { width: 1280, coarse: false };
    const { storage } = memory();
    const store = createDeviceStore({ width: () => env.width, coarse: () => env.coarse, storage });
    let told = 0;
    store.subscribe(() => told++);
    expect(store.get()).toMatchObject({ form: 'desktop', input: 'mouse', drawers: false });

    env.width = 1200;
    store.measure();
    expect(told).toBe(0);
    expect(store.get().width).toBe(1200);

    env.width = 820;
    store.measure();
    expect(store.get()).toMatchObject({ form: 'tablet', drawers: true });
    env.width = 1024;
    store.measure();
    expect(store.get()).toMatchObject({ form: 'tablet', drawers: false });
    env.width = 390;
    store.measure();
    expect(store.get()).toMatchObject({ form: 'phone', drawers: true });
    expect(told).toBe(3);

    store.pointer('touch');
    expect(store.get().input).toBe('touch');
    store.pointer('touch');
    store.pointer('pen');
    expect(store.get().input).toBe('stylus');
    store.pointer('mouse');
    expect(store.get().input).toBe('mouse');
    expect(told).toBe(6);
  });

  it('lets the author choose the interface for a device, and remembers it there', () => {
    const { storage, data } = memory();
    const env = { width: () => 390, coarse: () => true, storage };
    const store = createDeviceStore(env);
    expect(store.get()).toMatchObject({ form: 'phone', input: 'touch' });
    store.setOverride('desktop');
    expect(store.get()).toMatchObject({ form: 'desktop', detected: 'phone', override: 'desktop' });
    expect(createDeviceStore(env).get().form).toBe('desktop');
    store.setOverride(null);
    expect(store.get()).toMatchObject({ form: 'phone', override: null });
    expect(data.size).toBe(0);
    data.set('novel-builder:device', 'toaster');
    expect(createDeviceStore(env).get().form).toBe('phone');
  });
});

describe('edge swipes', () => {
  const swipe = (startX: number, endX: number, dy = 0) => ({ startX, startY: 300, endX, endY: 300 + dy, width: 800 });
  it('opens a panel only for a sideways swipe that starts at that edge', () => {
    expect(readSwipe(swipe(10, 140), null)).toEqual({ open: 'left' });
    expect(readSwipe(swipe(790, 640), null)).toEqual({ open: 'right' });
    // From the middle of the page: that is selecting text or scrolling, not asking for a panel.
    expect(readSwipe(swipe(200, 400), null)).toBeNull();
    expect(readSwipe(swipe(10, 40), null)).toBeNull();
    expect(readSwipe(swipe(10, 140, 200), null)).toBeNull();
    expect(readSwipe(swipe(10, -80), null)).toBeNull();
  });
  it('puts an open panel away when it is swiped back the way it came', () => {
    expect(readSwipe(swipe(300, 120), 'left')).toBe('close');
    expect(readSwipe(swipe(300, 480), 'left')).toBeNull();
    expect(readSwipe(swipe(500, 700), 'right')).toBe('close');
    expect(readSwipe(swipe(10, 140), 'right')).toBe('close');
  });
});

describe('DEVICE-AWARE LAYOUT ISOLATION RULE', () => {
  it('starts each kind of device from a layout that suits it', () => {
    const open = (form: Form) => MODES.flatMap((mode) => SLOTS.filter((slot) => standardLayout(form)[mode][slot].open).map((slot) => `${mode}.${slot}`));
    expect(open('phone')).toEqual([]);
    expect(open('tablet')).toEqual(MODES.map((mode) => `${mode}.left`));
    expect(open('desktop')).toEqual(['drafting.left', 'drafting.writeLeft', 'planning.left', 'planning.writeLeft', 'worldbuilding.left', 'worldbuilding.writeLeft', 'editing.left', 'editing.writeLeft', 'editing.writeRight']);
  });

  it('keeps a separate layout for each kind of device in the same storage', () => {
    const { storage, data } = memory();
    let form: Form = 'desktop';
    const store = createStudioStore(storage, () => form);

    // A three-column desktop: threads on the left, the Codex reference open on the right, in Editing.
    store.updateDock('p', 'drafting', 'writeLeft', { kind: 'threads', width: 300 });
    store.updateDock('p', 'drafting', 'writeRight', { kind: 'reference', open: true, width: 420 });
    store.updateMode('p', 'drafting', { center: 'graph' });
    store.setMode('p', 'editing');
    const desktop = JSON.stringify(store.layout('p'));
    const stored = new Map(data);

    // The same project is opened on a phone, and everything is rearranged there.
    form = 'phone';
    store.refresh();
    expect(store.layout('p')).toEqual(standardLayout('phone'));
    expect(store.session('p').mode).toBe('drafting');
    store.updateDock('p', 'drafting', 'writeLeft', { kind: 'chapters', open: false, width: 220 });
    store.updateDock('p', 'drafting', 'writeRight', { kind: 'notes', open: false });
    store.updateMode('p', 'drafting', { center: 'manuscript', focus: true });
    store.applyPreset('p', 'pure-writer');
    store.setScope('p', 'project');
    store.updateDock('p', 'editing', 'right', { kind: 'timeline', open: true });
    store.setMode('p', 'planning');
    store.importConfig('p', store.exportConfig('p'));

    // Not one byte of what the desktop saved has changed.
    for (const [key, value] of stored) expect(data.get(key)).toBe(value);
    form = 'desktop';
    store.refresh();
    expect(JSON.stringify(store.layout('p'))).toBe(desktop);
    expect(store.layout('p').drafting.writeRight).toEqual({ kind: 'reference', open: true, width: 420 });
    expect(store.session('p').mode).toBe('editing');
    expect(store.hasOwn('p')).toBe(false);

    // And the tablet has yet another, untouched by either.
    form = 'tablet';
    store.refresh();
    expect(store.layout('p')).toEqual(standardLayout('tablet'));
  });

  it('copies a layout from one kind of device to another only when asked, and leaves the source alone', () => {
    const { storage } = memory();
    let form: Form = 'desktop';
    const store = createStudioStore(storage, () => form);
    store.updateDock('p', 'planning', 'right', { kind: 'timeline', open: true, width: 300 });
    const desktop = JSON.stringify(store.layout('p'));
    form = 'tablet';
    store.refresh();
    expect(store.layout('p').planning.right.open).toBe(false);
    expect(JSON.stringify(store.layoutFor('p', 'desktop'))).toBe(desktop);
    store.copyFrom('p', 'desktop');
    expect(JSON.stringify(store.layout('p'))).toBe(desktop);
    store.updateDock('p', 'planning', 'right', { open: false });
    expect(JSON.stringify(store.layoutFor('p', 'desktop'))).toBe(desktop);
  });

  it('uses the keys the app always used for the desktop, so nothing saved before this is lost', () => {
    expect(studioKeys('desktop')).toMatchObject({ global: 'novel-builder:studio:layout' });
    expect(studioKeys('desktop').project('p')).toBe('novel-builder:studio:layout:p');
    expect(studioKeys('desktop').session('p')).toBe('novel-builder:studio:session:p');
    expect(prefsKey('desktop')).toBe('novel-builder:writing-prefs');
    const keys = FORMS.flatMap((form) => [studioKeys(form).global, studioKeys(form).project('p'), studioKeys(form).session('p'), prefsKey(form)]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('syncs every kind of device’s settings side by side, each under its own key', () => {
    const keys = syncedSettingKeys('3f2a-proj');
    for (const form of FORMS) {
      for (const key of [studioKeys(form).global, studioKeys(form).project('3f2a-proj'), studioKeys(form).session('3f2a-proj'), prefsKey(form)]) {
        expect(keys).toContain(key);
        expect(isSyncedSetting(key)).toBe(true);
      }
    }
    expect(new Set(keys).size).toBe(keys.length);
    // Nothing private rides along, and nothing unknown is accepted from the cloud.
    expect(keys.some((key) => /assistant|sync-account|device$/.test(key))).toBe(false);
    for (const key of ['novel-builder:assistant', 'novel-builder:sync-account', 'novel-builder:device', 'novel-builder:studio:watch:layout:p', 'other']) expect(isSyncedSetting(key)).toBe(false);
  });
});
