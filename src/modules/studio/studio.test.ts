import { describe, expect, it } from 'vitest';
import { parsePrefs } from '@/modules/manuscript/preferences';
import { ACTIONS, DEFAULT_SHORTCUTS, actionFor, comboOf, isUsable, parseShortcuts, rebind } from './shortcuts';
import { CENTERS, MODES, PANELS, PRESETS, createStudioStore, parseLayout, standardLayout } from './store';

/** Storage that outlives a store, like a browser's does an app launch. */
function device() {
  const data = new Map<string, string>();
  return { data, storage: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), removeItem: (key: string) => void data.delete(key) } };
}
const key = (code: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ code, key: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });

describe('layouts', () => {
  it('starts as the app always was: navigation beside pages, chapters beside the manuscript, tools closed', () => {
    const { drafting, planning, worldbuilding, editing } = standardLayout();
    expect(drafting).toMatchObject({ center: 'manuscript', left: { kind: 'auto', open: true }, right: { open: false }, writeLeft: { kind: 'auto', open: true, width: 264 }, writeRight: { kind: 'auto', open: false }, focus: false, goalBar: true });
    expect([planning.center, worldbuilding.center, editing.center]).toEqual(['organizer', 'codex', 'manuscript']);
    expect(editing.writeRight).toMatchObject({ kind: 'continuity', open: true });
  });

  it('reads anything stored or imported without trusting it', () => {
    expect(parseLayout(null)).toEqual(standardLayout());
    expect(parseLayout('nonsense')).toEqual(standardLayout());
    const odd = parseLayout({ drafting: { center: 'moon', left: { kind: 'threads', open: 'yes', width: 99999 }, writeRight: { kind: 'nope', width: -5 }, focus: 1, goalBar: false }, extra: {} });
    expect(odd.drafting).toMatchObject({ center: 'manuscript', left: { kind: 'threads', open: true, width: 560 }, writeRight: { kind: 'auto', width: 200 }, focus: false, goalBar: false });
    expect(odd.planning).toEqual(standardLayout().planning);
  });

  it('offers the five presets, each a complete and valid layout', () => {
    expect(PRESETS.map((p) => p.name)).toEqual(['Pure Writer', 'Worldbuilder', 'Outliner', 'Revision Editor', 'Progression Fantasy']);
    for (const preset of PRESETS) {
      expect(parseLayout(preset.layout), preset.name).toEqual(preset.layout);
      expect(MODES.includes(preset.start), preset.name).toBe(true);
      for (const mode of MODES) {
        expect(CENTERS.includes(preset.layout[mode].center)).toBe(true);
        for (const slot of ['left', 'right', 'writeLeft', 'writeRight'] as const) expect(PANELS.includes(preset.layout[mode][slot].kind)).toBe(true);
      }
    }
    const pure = PRESETS[0].layout.drafting;
    expect([pure.writeLeft.open, pure.writeRight.open, pure.focus, pure.goalBar]).toEqual([false, false, true, true]);
    expect(PRESETS[4].layout).toMatchObject({ worldbuilding: { center: 'systems' }, planning: { center: 'progression' } });
  });
});

describe('the workspace store', () => {
  it('saves every change at once and reads it back on the next launch', () => {
    const { storage } = device();
    const first = createStudioStore(storage);
    first.setMode('p1', 'editing');
    first.updateDock('p1', 'editing', 'writeRight', { width: 412, kind: 'timeline' });
    first.updateDock('p1', 'drafting', 'writeLeft', { open: false });
    first.updateMode('p1', 'planning', { center: 'plot', focus: true });
    first.setShortcut('search', 'Mod+Shift+P');

    const relaunched = createStudioStore(storage);
    expect(relaunched.session('p1').mode).toBe('editing');
    expect(relaunched.layout('p1').editing.writeRight).toEqual({ kind: 'timeline', open: true, width: 412 });
    expect(relaunched.layout('p1').drafting.writeLeft.open).toBe(false);
    expect(relaunched.layout('p1').planning).toMatchObject({ center: 'plot', focus: true });
    expect(relaunched.shortcuts().search).toBe('Mod+Shift+P');
    // The active workspace is each project's own.
    expect(relaunched.session('p2').mode).toBe('drafting');
  });

  it('keeps panel widths within bounds and each pair of panels separate', () => {
    const store = createStudioStore(device().storage);
    store.updateDock('p', 'drafting', 'left', { width: 5 });
    store.updateDock('p', 'drafting', 'right', { width: 5000, open: true });
    const { drafting } = store.layout('p');
    expect([drafting.left.width, drafting.right.width]).toEqual([200, 560]);
    // Opening the panel beside the pages does not open the one beside the manuscript.
    expect([drafting.right.open, drafting.writeRight.open, drafting.writeLeft.open]).toEqual([true, false, true]);
    store.swapDocks('p', 'drafting', 'pages');
    // Standard on the left is the navigation; moved to the right it is named as such.
    expect([store.layout('p').drafting.left.width, store.layout('p').drafting.right.kind, store.layout('p').drafting.writeLeft.kind]).toEqual([560, 'nav', 'auto']);
  });

  it('uses one layout for every project until a project is given its own', () => {
    const { storage } = device();
    const store = createStudioStore(storage);
    store.updateMode('a', 'drafting', { goalBar: false });
    expect([store.layout('b').drafting.goalBar, store.hasOwn('a')]).toEqual([false, false]);

    store.setScope('a', 'project');
    expect(store.hasOwn('a')).toBe(true);
    // It starts as a copy of what was there, then goes its own way.
    expect(store.layout('a').drafting.goalBar).toBe(false);
    store.updateMode('a', 'drafting', { center: 'graph' });
    store.updateMode('b', 'planning', { center: 'timeline' });
    expect([store.layout('a').drafting.center, store.layout('b').drafting.center]).toEqual(['graph', 'manuscript']);
    expect([store.layout('a').planning.center, store.layout('b').planning.center]).toEqual(['organizer', 'timeline']);
    expect(createStudioStore(storage).layout('a').drafting.center).toBe('graph');

    store.setScope('a', 'global');
    expect([store.hasOwn('a'), store.layout('a').drafting.center, store.layout('a').planning.center]).toEqual([false, 'manuscript', 'timeline']);
  });

  it('applies a preset, and returns to the standard layout', () => {
    const store = createStudioStore(device().storage);
    expect(store.applyPreset('p', 'outliner')?.name).toBe('Outliner');
    expect([store.session('p').mode, store.layout('p').planning.left.kind, store.layout('p').planning.right]).toEqual(['planning', 'threads', { kind: 'timeline', open: true, width: 300 }]);
    expect(store.applyPreset('p', 'nope')).toBeNull();
    store.applyPreset('p', 'standard');
    expect(store.layout('p')).toEqual(standardLayout());
  });

  it('exports a layout with its shortcuts and imports it elsewhere', () => {
    const mine = createStudioStore(device().storage);
    mine.applyPreset('p', 'worldbuilder');
    mine.updateDock('p', 'worldbuilding', 'left', { width: 300 });
    mine.setShortcut('snapshot', 'Alt+9');
    const file = mine.exportConfig('p');
    expect(JSON.parse(file)).toMatchObject({ format: 'novel-builder-workspace', version: 1 });

    const theirs = createStudioStore(device().storage);
    theirs.importConfig('q', file);
    expect(theirs.layout('q')).toEqual(mine.layout('p'));
    expect(theirs.shortcuts().snapshot).toBe('Alt+9');
    for (const bad of ['not json', '{}', JSON.stringify({ format: 'something-else', layout: {} })]) expect(() => theirs.importConfig('q', bad)).toThrow('not a workspace layout');
    expect(theirs.layout('q')).toEqual(mine.layout('p'));
  });

  it('survives storage that is corrupt or refuses to store', () => {
    const { data, storage } = device();
    data.set('novel-builder:studio:layout', '{broken');
    data.set('novel-builder:studio:shortcuts', '"oops"');
    const store = createStudioStore(storage);
    expect(store.layout('p')).toEqual(standardLayout());
    expect(store.shortcuts()).toEqual(DEFAULT_SHORTCUTS);
    const locked = createStudioStore({ getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => {} });
    locked.setMode('p', 'planning');
    expect(locked.session('p').mode).toBe('planning');
  });

  it('tells its listeners when something changes', () => {
    const store = createStudioStore(device().storage);
    let calls = 0;
    const stop = store.subscribe(() => calls++);
    const before = store.version();
    store.setMode('p', 'planning');
    store.updateDock('p', 'planning', 'right', { open: true });
    stop();
    store.setMode('p', 'drafting');
    expect([calls, store.version() > before]).toEqual([2, true]);
  });
});

describe('shortcuts', () => {
  it('reads a key press from the physical key, so layouts and modifiers do not change its name', () => {
    expect(comboOf(key('KeyK', { metaKey: true }))).toBe('Mod+K');
    expect(comboOf(key('KeyK', { ctrlKey: true }))).toBe('Mod+K');
    expect(comboOf(key('Digit1', { altKey: true }))).toBe('Alt+1');
    expect(comboOf(key('KeyS', { metaKey: true, altKey: true, shiftKey: true }))).toBe('Mod+Alt+Shift+S');
    expect(comboOf(key('BracketLeft', { ctrlKey: true, altKey: true }))).toBe('Mod+Alt+[');
    expect(comboOf(key('F6'))).toBe('F6');
    expect(comboOf(key('ShiftLeft', { shiftKey: true }))).toBeNull();
  });

  it('only accepts combinations that cannot be typed by accident', () => {
    expect(['Mod+K', 'Alt+1', 'F6', 'Shift+F6', 'Mod+Alt+S'].map(isUsable)).toEqual([true, true, true, true, true]);
    expect(['K', 'Shift+K', '1', 'Space', 'Enter'].map(isUsable)).toEqual([false, false, false, false, false]);
  });

  it('has a distinct default for every action, and finds the action for a key press', () => {
    expect(new Set(Object.values(DEFAULT_SHORTCUTS)).size).toBe(ACTIONS.length);
    expect(parseShortcuts(DEFAULT_SHORTCUTS)).toEqual(DEFAULT_SHORTCUTS);
    expect(actionFor(DEFAULT_SHORTCUTS, 'Mod+K')).toBe('search');
    expect(actionFor(DEFAULT_SHORTCUTS, 'Alt+3')).toBe('mode-worldbuilding');
    expect([actionFor(DEFAULT_SHORTCUTS, 'Mod+J'), actionFor(DEFAULT_SHORTCUTS, null)]).toEqual([null, null]);
  });

  it('rebinding takes a combination from whatever had it; clearing leaves the action unbound', () => {
    const next = rebind(DEFAULT_SHORTCUTS, 'snapshot', 'Mod+K');
    expect([next.snapshot, next.search]).toEqual(['Mod+K', '']);
    expect(actionFor(next, 'Mod+K')).toBe('snapshot');
    expect(rebind(next, 'snapshot', '').snapshot).toBe('');
    expect(DEFAULT_SHORTCUTS.search).toBe('Mod+K');
  });

  it('cleans up stored shortcuts: unusable and duplicate ones are dropped, missing ones defaulted', () => {
    const parsed = parseShortcuts({ search: 'K', 'toggle-left': 'Alt+1', 'mode-drafting': 'Alt+1', snapshot: '', bogus: 'Mod+B' });
    expect([parsed.search, parsed['toggle-left'], parsed['mode-drafting'], parsed.snapshot, parsed['mode-planning']]).toEqual(['', 'Alt+1', '', '', 'Alt+2']);
    expect('bogus' in parsed).toBe(false);
  });
});

describe('editor appearance', () => {
  it('adds a Focus theme and paragraph spacing to the saved preferences, with safe defaults', () => {
    expect(parsePrefs(JSON.stringify({ theme: 'focus', paragraphSpacing: 0.8 }))).toMatchObject({ theme: 'focus', paragraphSpacing: 0.8 });
    // Preferences saved before this existed still load.
    expect(parsePrefs(JSON.stringify({ theme: 'sepia', fontSize: 20 }))).toMatchObject({ theme: 'sepia', fontSize: 20, paragraphSpacing: 0 });
    expect(parsePrefs(JSON.stringify({ paragraphSpacing: 99, theme: 'neon' })).paragraphSpacing).toBe(2);
  });
});
