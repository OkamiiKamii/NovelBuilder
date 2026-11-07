export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict';

export interface AutosaverOptions<T> {
  /** The durable save. Resolves once the value is safely stored. */
  save: (value: T) => Promise<void>;
  /** A cheap crash-recovery copy, written while the durable save is still waiting. */
  stash?: (value: T) => Promise<void>;
  /** True when a save failed because the stored value changed elsewhere. */
  isConflict?: (error: unknown) => boolean;
  onState: (state: SaveState) => void;
  /** Save this long after typing stops… */
  delay?: number;
  /** …but never let unsaved work get older than this while typing continues. */
  maxWait?: number;
  stashEvery?: number;
  retryDelays?: number[];
}

/**
 * Decides when to save. It is independent of the editor and the database so
 * its guarantees can be tested directly:
 *
 *  - One write at a time. Writes run through a single queue, and each reads
 *    the newest value at the moment it starts, so an older save can never
 *    land after, or overwrite, a newer one.
 *  - Bursts of typing produce one save, not one per keystroke.
 *  - Nothing is dropped: a change made during a save triggers another save.
 *  - Failures are retried with backoff; conflicts pause saving until resolved.
 */
export function createAutosaver<T>(options: AutosaverOptions<T>) {
  const { save, stash, isConflict, onState, delay = 800, maxWait = 5000, stashEvery = 250, retryDelays = [2000, 5000, 15000, 30000] } = options;

  let read: (() => T) | null = null;
  let version = 0;
  let savedVersion = 0;
  let stashedVersion = 0;
  let dirtySince: number | null = null;
  let saving = false;
  let failures = 0;
  let conflict = false;
  let disposed = false;
  let state: SaveState = 'saved';
  let queue: Promise<void> = Promise.resolve();
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let stashTimer: ReturnType<typeof setTimeout> | undefined;

  function report(): void {
    const next: SaveState = conflict ? 'conflict' : saving ? 'saving' : failures ? 'error' : version > savedVersion ? 'unsaved' : 'saved';
    if (next !== state && !disposed) onState((state = next));
  }

  function schedule(wait: number): void {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void runSave(), wait);
  }

  function runSave(): Promise<void> {
    clearTimeout(saveTimer);
    queue = queue.then(async () => {
      if (disposed || conflict || !read || version === savedVersion) return;
      const attempt = version;
      saving = true;
      report();
      try {
        await save(read());
        savedVersion = attempt;
        failures = 0;
        dirtySince = version > attempt ? Date.now() : null;
      } catch (error) {
        if (isConflict?.(error)) conflict = true;
        else failures++;
      }
      saving = false;
      report();
      if (disposed || conflict || version === savedVersion) return;
      schedule(failures ? retryDelays[Math.min(failures, retryDelays.length) - 1] : delay);
    });
    return queue;
  }

  function runStash(): void {
    stashTimer = undefined;
    queue = queue.then(async () => {
      if (disposed || !stash || !read || version === savedVersion || version === stashedVersion) return;
      const attempt = version;
      try {
        await stash(read());
        stashedVersion = attempt;
      } catch {
        // Best effort: the durable save is still coming.
      }
    });
  }

  return {
    /** Call on every edit. `get` must return the newest value whenever it is called. */
    changed(get: () => T): void {
      if (disposed) return;
      read = get;
      version++;
      dirtySince ??= Date.now();
      report();
      if (!conflict) schedule(Math.max(0, Math.min(delay, dirtySince + maxWait - Date.now())));
      if (stash && stashTimer === undefined) stashTimer = setTimeout(runStash, stashEvery);
    },

    /** Saves now if anything is unsaved. Resolves when the queue is idle. */
    flush: (): Promise<void> => runSave(),

    /** Continues after a conflict has been resolved by the caller. */
    resume(): Promise<void> {
      conflict = false;
      report();
      return runSave();
    },

    get state(): SaveState {
      return state;
    },

    /** Stops all timers and further writes. Unsaved changes are abandoned; flush first to keep them. */
    dispose(): void {
      disposed = true;
      clearTimeout(saveTimer);
      clearTimeout(stashTimer);
    },
  };
}

export type Autosaver<T> = ReturnType<typeof createAutosaver<T>>;
