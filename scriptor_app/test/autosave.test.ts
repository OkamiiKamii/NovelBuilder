import { SaveController } from '../src/data/autosave';

describe('autosave', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('saves shortly after changes stop, the newest change for each key', () => {
    const saves = new SaveController();
    const written: string[] = [];
    saves.schedule('title', () => written.push('a'));
    jest.advanceTimersByTime(300);
    saves.schedule('title', () => written.push('ab'));
    expect(saves.status.state).toBe('pending');
    jest.advanceTimersByTime(599);
    expect(written).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(written).toEqual(['ab']);
    expect(saves.status.state).toBe('saved');
  });

  it('keeps a failed save and tries again after 2, 5, 15, then every 30 seconds', () => {
    const saves = new SaveController();
    let failures = 5;
    const tries: number[] = [];
    saves.schedule('x', () => {
      tries.push(Date.now());
      if (failures-- > 0) throw new Error('disk full');
    });
    const start = Date.now();
    jest.advanceTimersByTime(600);
    expect(saves.status).toMatchObject({ state: 'failed', error: 'disk full' });
    jest.advanceTimersByTime(2000 + 5000 + 15000 + 30000 + 30000);
    expect(tries.map((t) => t - start)).toEqual([600, 2600, 7600, 22600, 52600, 82600]);
    expect(saves.status.state).toBe('saved');
  });

  it('flushes everything waiting at once (the app going to the background)', () => {
    const saves = new SaveController();
    const written: string[] = [];
    saves.schedule('a', () => written.push('a'));
    saves.schedule('b', () => written.push('b'));
    expect(saves.flush()).toBe(true);
    expect(written).toEqual(['a', 'b']);
    jest.advanceTimersByTime(1000);
    expect(written).toEqual(['a', 'b']);
  });

  it('says it is saved only when every write has completed', () => {
    const saves = new SaveController();
    saves.schedule('ok', () => {});
    saves.schedule('bad', () => {
      throw new Error('no');
    });
    jest.advanceTimersByTime(600);
    expect(saves.status.state).toBe('failed');
    expect(saves.hasUnsaved).toBe(true);
  });

  it('gives the same status object until something changes, and tells listeners', () => {
    const saves = new SaveController();
    const a = saves.status;
    expect(saves.status).toBe(a);
    let told = 0;
    saves.subscribe(() => told++);
    saves.schedule('k', () => {});
    expect(saves.status).not.toBe(a);
    expect(told).toBeGreaterThan(0);
  });
});
