// AUTOSAVE: changes are saved shortly after they stop, without a Save button to forget.
// A port of flutter_app/lib/shared/data/autosave.dart.
//
// Each change is scheduled under a key (what it changes); a newer change to the same key replaces the waiting one. A
// write that throws is kept and tried again after 2, 5, 15 and then every 30 seconds, and `status` says so. The status
// is "saved" only when every write has actually completed.

export type SaveState = 'saved' | 'pending' | 'saving' | 'failed';

export type SaveStatus = {
  state: SaveState;
  lastSaved: number | null;
  /** Why the last attempt failed, in words. */
  error: string | null;
  /** When the failed save will be tried again on its own. */
  nextRetry: number | null;
};

export function saveLabel(state: SaveState): string {
  switch (state) {
    case 'saved':
      return 'Saved on this device';
    case 'pending':
      return 'Unsaved changes';
    case 'saving':
      return 'Saving…';
    case 'failed':
      return 'Not saved';
  }
}

type Write = () => void;

export class SaveController {
  private readonly waiting = new Map<string, Write>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly attempts = new Map<string, number>();
  private readonly errors = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private writing = false;
  private lastSaved: number | null = null;
  private nextRetry: number | null = null;
  private cached: SaveStatus | null = null;

  constructor(
    readonly delayMs = 600,
    readonly retryDelaysMs: readonly number[] = [2000, 5000, 15000, 30000],
    private readonly clock: () => number = Date.now,
  ) {}

  /** For React's useSyncExternalStore: the same object until something changes. */
  get status(): SaveStatus {
    if (this.cached) return this.cached;
    const base = { lastSaved: this.lastSaved, error: null, nextRetry: null };
    let status: SaveStatus;
    if (this.errors.size > 0) {
      status = {
        state: 'failed',
        lastSaved: this.lastSaved,
        error: [...this.errors.values()].pop() ?? null,
        nextRetry: this.nextRetry,
      };
    } else if (this.writing) status = { ...base, state: 'saving' };
    else if (this.waiting.size > 0) status = { ...base, state: 'pending' };
    else status = { ...base, state: 'saved' };
    this.cached = status;
    return status;
  }

  get hasUnsaved(): boolean {
    return this.waiting.size > 0;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify(): void {
    this.cached = null;
    for (const l of [...this.listeners]) l();
  }

  /** Saves `write` after the delay without further changes to `key`. */
  schedule(key: string, write: Write): void {
    this.waiting.set(key, write);
    this.errors.delete(key);
    this.attempts.delete(key);
    this.cancelTimer(key);
    this.timers.set(
      key,
      setTimeout(() => this.run(key), this.delayMs),
    );
    this.notify();
  }

  /** Saves `write` now. Returns whether it was saved; if not, it stays queued and is retried. */
  saveNow(key: string, write: Write): boolean {
    this.waiting.set(key, write);
    this.cancelTimer(key);
    return this.run(key);
  }

  /** Tries every waiting or failed save now (on leaving a screen, or when the app goes to the background). Returns
   * whether everything is saved. */
  flush(): boolean {
    for (const key of [...this.waiting.keys()]) {
      this.cancelTimer(key);
      this.run(key);
    }
    return this.waiting.size === 0;
  }

  /** "Retry" on a failed save. */
  retry(): boolean {
    return this.flush();
  }

  private cancelTimer(key: string): void {
    const t = this.timers.get(key);
    if (t !== undefined) clearTimeout(t);
    this.timers.delete(key);
  }

  private run(key: string): boolean {
    const write = this.waiting.get(key);
    if (!write) return true;
    this.writing = true;
    this.notify();
    try {
      write();
      if (this.waiting.get(key) === write) this.waiting.delete(key);
      this.errors.delete(key);
      this.attempts.delete(key);
      this.lastSaved = this.clock();
      if (this.errors.size === 0) this.nextRetry = null;
      return true;
    } catch (e) {
      const attempt = (this.attempts.get(key) ?? 0) + 1;
      this.attempts.set(key, attempt);
      this.errors.set(key, describeFailure(e));
      const wait = this.retryDelaysMs[Math.min(attempt - 1, this.retryDelaysMs.length - 1)];
      this.nextRetry = this.clock() + wait;
      this.cancelTimer(key);
      this.timers.set(
        key,
        setTimeout(() => this.run(key), wait),
      );
      return false;
    } finally {
      this.writing = false;
      this.notify();
    }
  }

  dispose(): void {
    this.flush();
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}

// Messages can quote story text; keep the reason short and never log it.
function describeFailure(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  return text.length > 200 ? `${text.substring(0, 200)}…` : text;
}
