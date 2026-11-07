import { useEffect, useRef, useState } from 'react';
import { EntryOptions } from '../categories';
import { splitChoices } from '../schema';
import type { FieldType, LoreEntry } from '../types';

interface TypedInputProps {
  label: string;
  type: FieldType;
  options: string[];
  value: string;
  /** Entries a "link to an entry" field can point at. */
  entries: LoreEntry[];
  onSave: (value: string) => void;
}

/**
 * The right control for a field's type. Values are always text underneath
 * (see `LoreField`), so a value that does not fit the control (text in a
 * field that was later made a number, a choice that was later removed) is
 * shown as it is, never thrown away.
 */
export function TypedInput({ label, type, options, value, entries, onSave }: TypedInputProps) {
  const [text, setText] = useState(value);
  const pending = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const save = useRef(onSave);
  save.current = onSave;
  useEffect(() => {
    if (pending.current === null) setText(value);
  }, [value]);
  const flush = () => {
    clearTimeout(timer.current);
    if (pending.current === null) return;
    const next = pending.current;
    pending.current = null;
    save.current(next);
  };
  useEffect(() => flush, []); // save on the way out
  const typing = (next: string) => {
    setText(next);
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 600);
  };
  const text$ = { value: text, 'aria-label': label, onBlur: flush, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => typing(e.target.value) };

  if (type === 'longtext') return <textarea rows={Math.min(10, Math.max(2, text.split('\n').length))} {...text$} />;
  if (type === 'number') {
    const fits = text.trim() === '' || Number.isFinite(Number(text));
    return fits ? <input type="number" step="any" {...text$} /> : <Unfitting {...text$} note="This was written before the field became a number." />;
  }
  if (type === 'date') {
    const fits = text.trim() === '' || /^\d{4}-\d{2}-\d{2}$/.test(text);
    return fits ? <input type="date" value={text} aria-label={label} onChange={(e) => onSave(e.target.value)} /> : <Unfitting {...text$} note="This was written before the field became a date." />;
  }
  if (type === 'toggle') {
    return (
      <select value={value === 'yes' || value === 'no' ? value : ''} aria-label={label} onChange={(e) => onSave(e.target.value)}>
        <option value="">{value && value !== 'yes' && value !== 'no' ? value : 'Not set'}</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    );
  }
  if (type === 'select') {
    return (
      <select value={value} aria-label={label} onChange={(e) => onSave(e.target.value)}>
        <option value="">Not set</option>
        {value && !options.includes(value) && <option value={value}>{value} (no longer a choice)</option>}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (type === 'multiselect') {
    const chosen = splitChoices(value);
    const all = [...options, ...chosen.filter((c) => !options.includes(c))];
    return (
      <div className="choices" role="group" aria-label={label}>
        {all.map((option) => (
          <label key={option} className={chosen.includes(option) ? 'on' : ''}>
            <input type="checkbox" checked={chosen.includes(option)} onChange={(e) => onSave((e.target.checked ? [...chosen, option] : chosen.filter((c) => c !== option)).join('\n'))} />
            {option}
          </label>
        ))}
        {all.length === 0 && <span className="muted small">No choices defined yet.</span>}
      </div>
    );
  }
  if (type === 'tags') return <TagsInput label={label} value={value} onSave={onSave} />;
  if (type === 'reference') {
    const exists = entries.some((e) => e.id === value);
    return (
      <select value={exists ? value : ''} aria-label={label} onChange={(e) => onSave(e.target.value)}>
        <option value="">{value && !exists ? 'Not set (the linked entry was deleted)' : 'Not set'}</option>
        <EntryOptions entries={entries} />
      </select>
    );
  }
  if (type === 'references') return <LinksInput label={label} value={value} entries={entries} onSave={onSave} />;
  return <input {...text$} />;
}

/** Links to several entries: the chosen ones as chips, and a menu to add another. Entries that were deleted since drop out of view, not out of the value, until the author changes it. */
function LinksInput({ label, value, entries, onSave }: { label: string; value: string; entries: LoreEntry[]; onSave: (value: string) => void }) {
  const chosen = splitChoices(value).flatMap((id) => entries.find((e) => e.id === id) ?? []);
  const save = (ids: string[]) => onSave([...new Set(ids)].join('\n'));
  return (
    <div className="links-input" role="group" aria-label={label}>
      {chosen.map((entry) => (
        <span key={entry.id} className="chip">
          {entry.name}
          <button type="button" className="chip-x" aria-label={`Remove ${entry.name} from ${label}`} onClick={() => save(chosen.filter((e) => e.id !== entry.id).map((e) => e.id))}>
            ✕
          </button>
        </span>
      ))}
      <select value="" aria-label={`Add to ${label}`} onChange={(e) => e.target.value && save([...chosen.map((c) => c.id), e.target.value])}>
        <option value="">{chosen.length ? 'Add another…' : 'Choose…'}</option>
        <EntryOptions entries={entries.filter((e) => !chosen.some((c) => c.id === e.id))} />
      </select>
    </div>
  );
}

/** A list of short labels the author types in themselves: traits, fears, titles. One per line underneath. */
function TagsInput({ label, value, onSave }: { label: string; value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState('');
  // The list as the author has made it, kept here so that tags added one straight after another all stay.
  const [items, setItems] = useState(() => splitChoices(value));
  const sent = useRef(value);
  useEffect(() => {
    if (value === sent.current) return;
    sent.current = value;
    setItems(splitChoices(value));
  }, [value]);
  const commit = (next: string[]) => {
    setItems(next);
    sent.current = next.join('\n');
    onSave(sent.current);
  };
  const add = () => {
    const next = draft.split(',').map((t) => t.trim()).filter((t) => t && !items.includes(t));
    setDraft('');
    if (next.length) commit([...items, ...next]);
  };
  return (
    <div className="tags-input" role="group" aria-label={label}>
      {items.map((item) => (
        <span key={item} className="tag-chip">
          {item}
          <button type="button" aria-label={`Remove ${item}`} onClick={() => commit(items.filter((i) => i !== item))}>
            ✕
          </button>
        </span>
      ))}
      <input
        value={draft}
        aria-label={`Add to ${label}`}
        placeholder="Add…"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          }
        }}
      />
    </div>
  );
}

function Unfitting({ note, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { note: string }) {
  return (
    <span className="unfitting">
      <input {...props} />
      <span className="muted small">{note} It is kept as written until you change it.</span>
    </span>
  );
}
