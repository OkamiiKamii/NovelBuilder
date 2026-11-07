import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosaver, type SaveState } from './autosave';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(overrides: { saveMs?: number; fail?: () => unknown } = {}) {
  let value = '';
  const saved: string[] = [];
  const stashed: string[] = [];
  const states: SaveState[] = [];
  let running = 0;
  let maxRunning = 0;
  const control = { saveMs: overrides.saveMs ?? 0, fail: overrides.fail ?? (() => null) };

  const saver = createAutosaver<string>({
    save: async (v) => {
      maxRunning = Math.max(maxRunning, ++running);
      await new Promise((r) => setTimeout(r, control.saveMs));
      running--;
      const error = control.fail();
      if (error) throw error;
      saved.push(v);
    },
    stash: async (v) => void stashed.push(v),
    isConflict: (e) => e === 'conflict',
    onState: (s) => states.push(s),
  });
  const type = (v: string) => {
    value = v;
    saver.changed(() => value);
  };
  return { saver, type, saved, stashed, states, control, maxRunning: () => maxRunning };
}

describe('autosaver', () => {
  it('saves once after typing stops, with the latest text', async () => {
    const t = setup();
    for (const v of ['a', 'ab', 'abc']) {
      t.type(v);
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(t.saved).toEqual([]);
    expect(t.saver.state).toBe('unsaved');
    await vi.advanceTimersByTimeAsync(800);
    expect(t.saved).toEqual(['abc']);
    expect(t.states).toEqual(['unsaved', 'saving', 'saved']);
  });

  it('still saves during non-stop typing', async () => {
    const t = setup();
    for (let i = 1; i <= 24; i++) {
      t.type(`v${i}`);
      await vi.advanceTimersByTimeAsync(500); // never idle for 800ms
    }
    expect(t.saved.length).toBeGreaterThanOrEqual(2);
    expect(t.saved[0]).toBe('v10'); // 5s after the first keystroke
  });

  it('never lets an older save overwrite a newer one', async () => {
    const t = setup({ saveMs: 1000 });
    t.type('old');
    void t.saver.flush(); // starts saving "old" (takes 1s)
    await vi.advanceTimersByTimeAsync(100);
    t.type('new');
    const done = t.saver.flush(); // asked to save while the first is in flight
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    expect(t.saved).toEqual(['old', 'new']);
    expect(t.maxRunning()).toBe(1); // strictly one at a time
    expect(t.saver.state).toBe('saved');
  });

  it('does not lose a change made while a save is running', async () => {
    const t = setup({ saveMs: 1000 });
    t.type('one');
    await vi.advanceTimersByTimeAsync(900); // save of "one" in flight
    t.type('two');
    expect(t.saver.state).toBe('saving');
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.saved).toEqual(['one']);
    expect(t.saver.state).toBe('saving'); // straight on to the newer text
    await vi.advanceTimersByTimeAsync(3000);
    expect(t.saved).toEqual(['one', 'two']);
  });

  it('writes recovery copies while typing, never behind a completed save', async () => {
    const t = setup();
    t.type('a');
    await vi.advanceTimersByTimeAsync(300);
    t.type('ab');
    await vi.advanceTimersByTimeAsync(300);
    expect(t.stashed).toEqual(['a', 'ab']);
    expect(t.saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(t.saved).toEqual(['ab']);
    expect(t.stashed).toEqual(['a', 'ab']); // nothing stashed after the real save
  });

  it('reports failures and retries until it succeeds', async () => {
    let broken = true;
    const t = setup({ fail: () => (broken ? new Error('disk full') : null) });
    t.type('text');
    await vi.advanceTimersByTimeAsync(900);
    expect(t.saver.state).toBe('error');
    await vi.advanceTimersByTimeAsync(2100); // first retry also fails
    expect(t.saver.state).toBe('error');
    broken = false;
    await vi.advanceTimersByTimeAsync(5100);
    expect(t.saved).toEqual(['text']);
    expect(t.saver.state).toBe('saved');
  });

  it('stops saving on a conflict until the caller resolves it', async () => {
    let conflicted = true;
    const t = setup({ fail: () => (conflicted ? 'conflict' : null) });
    t.type('mine');
    await vi.advanceTimersByTimeAsync(900);
    expect(t.saver.state).toBe('conflict');
    t.type('mine, edited');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.saved).toEqual([]); // no blind overwrite
    expect(t.stashed.at(-1)).toBe('mine, edited'); // but still protected against a crash
    conflicted = false;
    const resumed = t.saver.resume();
    await vi.advanceTimersByTimeAsync(10);
    await resumed;
    expect(t.saved).toEqual(['mine, edited']);
    expect(t.saver.state).toBe('saved');
  });

  it('flush is a no-op when nothing changed, and dispose stops everything', async () => {
    const t = setup();
    await t.saver.flush();
    t.type('x');
    t.saver.dispose();
    await vi.advanceTimersByTimeAsync(10_000);
    await t.saver.flush();
    expect(t.saved).toEqual([]);
  });
});
