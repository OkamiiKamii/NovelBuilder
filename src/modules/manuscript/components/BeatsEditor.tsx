import { useCallback, useEffect, useRef, useState } from 'react';
import { createId } from '@/core/id';
import type { PlanBeat } from '../types';

/** An ordered list of plot beats. Saves shortly after typing stops. Key it to the chapter or scene. */
export function BeatsEditor({ beats, onSave }: { beats: PlanBeat[]; onSave: (beats: PlanBeat[]) => void }) {
  const [rows, setRows] = useState(beats);
  const pending = useRef<PlanBeat[] | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const focusNext = useRef<string | null>(null);
  const save = useRef(onSave);
  save.current = onSave;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (!pending.current) return;
    const next = pending.current;
    pending.current = null;
    save.current(next);
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  const change = (next: PlanBeat[], now = false) => {
    setRows(next);
    pending.current = next;
    clearTimeout(timer.current);
    if (now) flush();
    else timer.current = window.setTimeout(flush, 600);
  };

  const insertAfter = (index: number) => {
    const beat = { id: createId(), text: '' };
    focusNext.current = beat.id;
    setRows([...rows.slice(0, index + 1), beat, ...rows.slice(index + 1)]);
  };
  const move = (index: number, delta: -1 | 1) => {
    const next = [...rows];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    change(next, true);
  };

  return (
    <div className="beats">
      <ol>
        {rows.map((beat, index) => (
          <li key={beat.id}>
            <span className="beat-number" aria-hidden="true">
              {index + 1}
            </span>
            <textarea
              value={beat.text}
              rows={Math.min(6, Math.max(1, beat.text.split('\n').length))}
              placeholder="What happens"
              aria-label={`Beat ${index + 1}`}
              ref={(el) => {
                if (el && focusNext.current === beat.id) {
                  focusNext.current = null;
                  el.focus();
                }
              }}
              onChange={(e) => change(rows.map((row) => (row.id === beat.id ? { ...row, text: e.target.value } : row)))}
              onBlur={flush}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  insertAfter(index);
                }
              }}
            />
            <span className="beat-actions">
              <button type="button" className="tool" aria-label={`Move beat ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                ↑
              </button>
              <button type="button" className="tool" aria-label={`Move beat ${index + 1} down`} disabled={index === rows.length - 1} onClick={() => move(index, 1)}>
                ↓
              </button>
              <button type="button" className="tool" aria-label={`Remove beat ${index + 1}`} onClick={() => change(rows.filter((row) => row.id !== beat.id), true)}>
                ✕
              </button>
            </span>
          </li>
        ))}
      </ol>
      <button type="button" className="btn" onClick={() => insertAfter(rows.length - 1)}>
        + Add beat
      </button>
    </div>
  );
}
