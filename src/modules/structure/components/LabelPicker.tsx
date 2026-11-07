import { useLiveQuery } from 'dexie-react-hooks';
import { useId, useState } from 'react';
import { db } from '@/core';
import { cleanLabels, labelOrder, SUGGESTED_LABELS } from '../types';

/** The labels to offer in a novel: the suggestions, and every label already used on its chapters, scenes and events. */
export function useLabelSuggestions(projectId: string): string[] {
  return (
    useLiveQuery(async () => {
      const [plans, events] = await Promise.all([db.chapterPlans.where('projectId').equals(projectId).toArray(), db.timelineEvents.where('projectId').equals(projectId).toArray()]);
      const used = [...plans.flatMap((p) => p.labels ?? []), ...events.flatMap((e) => e.labels ?? [])];
      const seen = new Set<string>();
      return labelOrder([...SUGGESTED_LABELS, ...used].filter((l) => !seen.has(l.toLowerCase()) && seen.add(l.toLowerCase())));
    }, [projectId]) ?? SUGGESTED_LABELS
  );
}

interface LabelPickerProps {
  /** What it labels, for the controls' names: "this scene", "this event". */
  of: string;
  labels: string[];
  suggestions: string[];
  onChange: (labels: string[]) => void;
}

/**
 * The author's labels on a chapter, scene or event: chips to take off, a
 * field for any label of their own, and the ones on offer to add with a
 * click. Labels describe; nothing is worked out from the text.
 */
export function LabelPicker({ of, labels, suggestions, onChange }: LabelPickerProps) {
  const [text, setText] = useState('');
  const listId = useId();
  const has = (l: string) => labels.some((x) => x.toLowerCase() === l.toLowerCase());
  const offered = suggestions.filter((s) => !has(s)).slice(0, 10);
  const add = (value: string) => {
    if (!value.trim()) return;
    onChange(cleanLabels([...labels, value]));
    setText('');
  };
  return (
    <div className="field label-picker" role="group" aria-label={`Labels on ${of}`}>
      <span>Labels</span>
      {labels.length > 0 && (
        <ul className="entity-chips">
          {labels.map((l) => (
            <li key={l}>
              <span className="chip-name">{l}</span>
              <button type="button" aria-label={`Remove the label ${l}`} onClick={() => onChange(labels.filter((x) => x !== l))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="label-add">
        <input
          list={listId}
          value={text}
          aria-label={`A label for ${of}`}
          placeholder="Action, dialogue, a quiet moment, your own…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            add(text);
          }}
        />
        <button type="button" className="btn" disabled={!text.trim()} onClick={() => add(text)}>
          Add label
        </button>
      </div>
      <datalist id={listId}>
        {offered.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {offered.length > 0 && (
        <p className="label-offers small">
          {offered.map((s) => (
            <button key={s} type="button" className="chip-toggle" aria-label={`Label ${of} ${s}`} onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </p>
      )}
    </div>
  );
}
