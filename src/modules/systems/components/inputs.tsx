import { useEffect, useState } from 'react';
import { checkFormula } from '../compute';
import { toKey, type BlueprintContent, type SystemBlueprint } from '../types';

export type Change = (edit: (current: SystemBlueprint) => Partial<BlueprintContent>) => void;

interface CommitProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  type?: 'text' | 'number';
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  /** Called as the author types, before anything is saved. */
  onDraft?: (value: string) => void;
}

/** A field that saves when the author leaves it or presses Enter, so a blueprint is not rewritten on every keystroke. */
export function Commit({ label, value, onCommit, type = 'text', placeholder, className = '', multiline, onDraft }: CommitProps) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const props = {
    value: text,
    placeholder,
    className,
    'aria-label': label,
    title: label,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setText(e.target.value);
      onDraft?.(e.target.value);
    },
    onBlur: () => text !== value && onCommit(text),
  };
  return multiline ? <textarea rows={2} {...props} /> : <input type={type} step="any" {...props} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />;
}

interface FormulaProps extends Omit<CommitProps, 'type' | 'multiline' | 'onDraft'> {
  system: BlueprintContent;
  kind: 'number' | 'condition';
  /** Names that stand for something only here, such as the level a curve is being worked out for. */
  extra?: Record<string, number>;
}

/** A formula or condition field that says, as it is typed, whether it can be worked out and what it comes to. */
export function Formula({ system, kind, extra, ...commit }: FormulaProps) {
  const [draft, setDraft] = useState(commit.value);
  useEffect(() => setDraft(commit.value), [commit.value]);
  const check = checkFormula(system, draft, kind, extra);
  return (
    <span className="formula">
      <Commit {...commit} className={`mono ${check.ok ? '' : 'invalid'}`} onDraft={setDraft} />
      {check.error ? (
        <span className="formula-note error" role="alert">
          {check.error}
        </span>
      ) : (
        check.preview !== null && <span className="formula-note muted">= {check.preview} with starting values</span>
      )}
    </span>
  );
}

export const remove = <T extends { id: string }>(list: T[], id: string): T[] => list.filter((x) => x.id !== id);
export const patch = <T extends { id: string }>(list: T[], id: string, changes: Partial<T>): T[] => list.map((x) => (x.id === id ? { ...x, ...changes } : x));
export const move = <T extends { id: string }>(list: T[], id: string, by: number): T[] => {
  const from = list.findIndex((x) => x.id === id);
  const to = from + by;
  if (from === -1 || to < 0 || to >= list.length) return list;
  const next = [...list];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
};
/** "a, b ,c" as the author types a list. */
export const split = (text: string): string[] => text.split(',').map((x) => x.trim()).filter(Boolean);

/**
 * The short name to use after a rename. It follows the new name while the
 * short name was never chosen by hand and nothing refers to it yet; once a
 * formula uses it, it stays put, so renaming never breaks a formula.
 */
export function keyAfterRename(system: BlueprintContent, key: string, oldName: string, newName: string): string {
  if (key !== toKey(oldName)) return key;
  const word = new RegExp(`(?<![\\p{L}\\p{N}_])${key}(?![\\p{L}\\p{N}_])`, 'iu');
  const formulas = [
    ...system.variables.map((v) => v.formula),
    ...system.tracks.flatMap((t) => [t.curve, ...t.stages.map((s) => s.requires)]),
    ...system.items.flatMap((i) => [i.requires, ...i.modifiers.flatMap((m) => [m.value, m.target]), ...i.costs.flatMap((c) => [c.amount, c.target])]),
  ];
  return formulas.some((text) => word.test(text)) ? key : toKey(newName);
}
