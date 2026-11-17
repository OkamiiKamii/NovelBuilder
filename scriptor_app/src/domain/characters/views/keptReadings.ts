// READINGS KEPT: what the profile's panels read from the whole book away from the screen (where a character is in the
// pages, what they say, how they talk, how they look), kept by what each is made of, so a panel shows it in its first
// frame when it was read already (for this page before, or for another of the cast where the reading is the same), and
// reads again only when what it is made of changes. A port of flutter_app/lib/shared/data/kept_readings.dart and the
// pure part of widgets/kept_reader.dart (its key).
//
// A panel says what its reading is made of (`inputs`: a string, or null when there is nothing to read; its reading is
// then `nothing` at once), and is kept by that and the store's count of writes to the chapters' text
// (NovelStore.versionOf(novelId, ['chapterContents'])). The cache holds the last 64 readings, the least recently used
// going first; one being read is shared by everyone who asks for it meanwhile.

/** The key a reading is kept by: its inputs and the count of writes to the text; null when there is nothing to read. */
export function readingKey(inputs: string | null, textVersion: number): string | null {
  return inputs === null ? null : `${inputs}\u0000${textVersion}`;
}

export class KeptReadings {
  static readonly capacity = 64;

  private readonly kept = new Map<string, unknown>();
  private readonly running = new Map<string, Promise<unknown>>();

  /** How many readings were started (for tests). */
  runs = 0;

  has(key: string): boolean {
    return this.kept.has(key);
  }

  /** The reading kept under `key`, made the most recently used; undefined when there is none. */
  done<T>(key: string): T | undefined {
    if (!this.kept.has(key)) return undefined;
    const value = this.kept.get(key);
    this.kept.delete(key);
    this.kept.set(key, value);
    return value as T;
  }

  /** The reading under `key`: kept, or being read, or read now with `run` (and kept when it is done; a reading that
   * fails is not kept, and is read again the next time). */
  read<T>(key: string, run: () => Promise<T>): Promise<T> {
    if (this.kept.has(key)) return Promise.resolve(this.done<T>(key) as T);
    const running = this.running.get(key);
    if (running !== undefined) return running as Promise<T>;
    this.runs++;
    const future = run();
    this.running.set(key, future);
    future.then(
      (value) => {
        this.running.delete(key);
        this.kept.set(key, value);
        while (this.kept.size > KeptReadings.capacity) this.kept.delete(this.kept.keys().next().value as string);
      },
      () => {
        this.running.delete(key);
      },
    );
    return future;
  }
}

/** The panel's reading in its first frame: `nothing` when there is nothing to read; the kept one when there is one;
 * else undefined (read it after the frame, with KeptReadings.read). */
export function firstReading<T>(keep: KeptReadings, key: string | null, nothing: T): T | undefined {
  if (key === null) return nothing;
  return keep.done<T>(key);
}
