// Long work done between frames (FEATURES.md #11, as far as Scriptor goes without a second thread): a job that can be
// run a little at a time (a `Stepped`: advance, done, result) runs in slices of about 12 ms, the screen drawing and
// answering presses between them, instead of holding the screen until it is done (the relationship map of a 400-character
// novel took over a second at once). The result is the same however it is sliced. Small jobs run at once, so a small
// book's map shows as before, without a frame of "Drawing…". Results are kept (the last few, by key), so coming back
// to a screen shows its drawing at once.
//
// React Native has no second thread for plain JavaScript without a native add-on; this keeps the screen answering
// while the work goes on, which is what Android's "not responding" is about.

import { useEffect, useState } from 'react';

export type Stepped<T> = { advance(most: number): void; readonly done: boolean; result(): T };

/** How long one slice may run before the screen gets a turn, in ms. */
const sliceMs = 12;
/** How many finished results are kept. */
const keepMost = 8;

const kept = new Map<string, unknown>();

function keep(key: string, value: unknown): void {
  kept.delete(key);
  kept.set(key, value);
  // Counted: at most one over the limit is dropped each time.
  for (let i = 0; kept.size > keepMost && i < keepMost; i++) kept.delete(kept.keys().next().value!);
}

/** The result of the job for `key` (null for none): at once when kept or `small`, else null until the slices are done.
 * `start` makes the job; it is called again only for a new key. */
export function useInSlices<T>(key: string | null, start: () => Stepped<T>, small: boolean): T | null {
  const [got, setGot] = useState<{ key: string; value: T } | null>(null);
  let ready: T | null = null;
  if (key !== null) {
    if (got !== null && got.key === key) ready = got.value;
    else if (kept.has(key)) ready = kept.get(key) as T;
    else if (small) {
      const job = start();
      job.advance(Number.POSITIVE_INFINITY);
      ready = job.result();
      keep(key, ready);
    }
  }
  const waiting = key !== null && ready === null;
  useEffect(() => {
    if (!waiting || key === null) return;
    const job = start();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let live = true;
    const slice = () => {
      if (!live) return;
      const began = Date.now();
      // Counted by the clock and by the job's own steps: each turn runs at least one step.
      while (!job.done && Date.now() - began < sliceMs) job.advance(1);
      if (job.done) {
        const value = job.result();
        keep(key, value);
        setGot({ key, value });
      } else {
        timer = setTimeout(slice, 0);
      }
    };
    timer = setTimeout(slice, 0);
    return () => {
      live = false;
      if (timer !== null) clearTimeout(timer);
    };
  }, [key, waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  return ready;
}
