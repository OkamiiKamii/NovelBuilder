import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createId } from '@/core/id';
import { FIELD_TYPE_LABELS, FIELD_TYPES, type FieldType, type LoreEntry, type LoreField } from '../types';
import { TypedInput } from './TypedInput';

interface FieldsEditorProps {
  fields: LoreField[];
  suggestions: string[];
  entries: LoreEntry[];
  onSave: (fields: LoreField[]) => void;
}

/** Fields that belong to one entry alone: any name, any type. Saves shortly after typing stops. Key it to the entry. */
export function FieldsEditor({ fields, suggestions, entries, onSave }: FieldsEditorProps) {
  const [rows, setRows] = useState(fields);
  const pending = useRef<LoreField[] | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const save = useRef(onSave);
  save.current = onSave;
  const listId = useId();

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

  const change = (next: LoreField[], now = false) => {
    setRows(next);
    pending.current = next;
    clearTimeout(timer.current);
    if (now) flush();
    else timer.current = window.setTimeout(flush, 600);
  };
  const edit = (id: string, patch: Partial<LoreField>, now = false) => change(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)), now);

  return (
    <div className="fields">
      {rows.map((row, index) => {
        const type = row.type ?? 'longtext';
        const choice = type === 'select' || type === 'multiselect';
        return (
          <div className="field-row" key={row.id}>
            <div className="field-name">
              <input value={row.key} list={listId} placeholder="Field name" aria-label={`Field ${index + 1} name`} onChange={(e) => edit(row.id, { key: e.target.value })} onBlur={flush} />
              <select value={type} aria-label={`Field ${index + 1} type`} onChange={(e) => edit(row.id, { type: e.target.value as FieldType }, true)}>
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-value">
              {choice && (
                <input
                  defaultValue={(row.options ?? []).join(', ')}
                  placeholder="Choices, separated by commas"
                  aria-label={`Field ${index + 1} choices`}
                  onBlur={(e) => edit(row.id, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) }, true)}
                />
              )}
              <TypedInput label={row.key ? `${row.key} value` : `Field ${index + 1} value`} type={type} options={row.options ?? []} value={row.value} entries={entries} onSave={(value) => edit(row.id, { value }, true)} />
            </div>
            <button type="button" className="btn ghost icon" aria-label={`Remove field ${row.key || index + 1}`} onClick={() => change(rows.filter((r) => r.id !== row.id), true)}>
              ✕
            </button>
          </div>
        );
      })}
      <datalist id={listId}>
        {suggestions.filter((key) => !rows.some((row) => row.key === key)).map((key) => (
          <option key={key} value={key} />
        ))}
      </datalist>
      <button type="button" className="btn" onClick={() => setRows([...rows, { id: createId(), key: '', value: '', type: 'text' }])}>
        + Add field
      </button>
    </div>
  );
}
