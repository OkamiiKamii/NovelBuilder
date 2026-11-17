// In-memory record of the most recent uncaught errors (FEATURES.md #12). A port of
// flutter_app/lib/core/errors/error_log.dart.
//
// It never writes to disk and never sends anything. Messages are not kept: they can quote story text. Only the kind
// of error and where it was caught.

export type ErrorRecord = { at: number; type: string; context: string; stack: string | null };

export class ErrorLog {
  static readonly instance = new ErrorLog();

  private readonly items: ErrorRecord[] = [];

  constructor(readonly capacity = 50) {}

  get entries(): readonly ErrorRecord[] {
    return [...this.items];
  }

  record(error: unknown, context: string): void {
    this.items.push({
      at: Date.now(),
      type: error instanceof Error ? error.name : typeof error,
      context,
      stack: error instanceof Error ? (error.stack ?? null) : null,
    });
    if (this.items.length > this.capacity) this.items.splice(0, this.items.length - this.capacity);
  }

  clear(): void {
    this.items.length = 0;
  }
}
