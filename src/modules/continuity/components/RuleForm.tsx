import { useState, type FormEvent } from 'react';
import { EntryOptions } from '@/modules/codex/categories';
import type { LoreEntry } from '@/modules/codex/types';
import { buildTree, flatten } from '@/modules/manuscript/tree';
import type { StoryNode } from '@/modules/manuscript/types';
import { formatDuration } from '../text';
import { KIND_HINTS, POSSESSION_STATES, STATE_LABELS, STATUS_STATES, TIME_UNITS, type ContinuityRule, type RuleInput, type RuleKind, type RuleState, type TimeUnit } from '../types';

/** A tracked rule as one line: "Mira: deceased from Chapter 2". */
export function describeRule(rule: ContinuityRule, entries: LoreEntry[], nodes: StoryNode[]): { subject: string; detail: string; broken: boolean } {
  const name = (id: string | null) => entries.find((e) => e.id === id)?.name;
  const title = (id: string | null) => nodes.find((n) => n.id === id)?.title;
  const span = `${title(rule.fromNodeId) ? `from ${title(rule.fromNodeId)}` : 'from the start'}${title(rule.untilNodeId) ? ` until ${title(rule.untilNodeId)}` : ''}`;
  const subject = name(rule.entryId) ?? 'An entry that was removed';
  if (rule.kind === 'travel') {
    return { subject: `${subject} ↔ ${name(rule.toEntryId) ?? 'a place that was removed'}`, detail: rule.amount ? formatDuration(rule.amount, rule.unit) : 'No time recorded', broken: !name(rule.entryId) || !name(rule.toEntryId) || !rule.amount };
  }
  if (rule.kind === 'power') {
    return { subject, detail: `${rule.label || 'Rule'} · blocked by: ${rule.words.join(', ') || 'nothing yet'} (${rule.scope === 'paragraph' ? 'same paragraph' : 'anywhere in the scene'})`, broken: !name(rule.entryId) || !rule.words.length };
  }
  if (rule.kind === 'possession') {
    const state = rule.state === 'held' ? `held by ${name(rule.holderId) ?? 'someone who was removed'}` : (rule.state ?? 'lost');
    return { subject, detail: `${state} ${span}`, broken: !name(rule.entryId) || (rule.state === 'held' && !name(rule.holderId)) };
  }
  const state = rule.state === 'deceased' ? 'deceased' : rule.label || STATE_LABELS[rule.state ?? 'absent'].toLowerCase();
  return { subject, detail: `${state} ${span}${rule.state === 'condition' ? ` · would not fit: ${rule.words.join(', ') || 'nothing yet'}` : ''}`, broken: !name(rule.entryId) || (rule.state === 'condition' && !rule.words.length) };
}

interface RuleFormProps {
  kind: RuleKind;
  rule?: ContinuityRule;
  entries: LoreEntry[];
  nodes: StoryNode[];
  onSubmit: (input: RuleInput) => Promise<unknown>;
  onCancel: () => void;
}

/** Records or edits one thing the manuscript is checked against. */
export function RuleForm({ kind, rule, entries, nodes, onSubmit, onCancel }: RuleFormProps) {
  const [entryId, setEntryId] = useState(rule?.entryId ?? '');
  const [state, setState] = useState<RuleState>(rule?.state ?? (kind === 'possession' ? 'lost' : 'deceased'));
  const [label, setLabel] = useState(rule?.label ?? '');
  const [wordList, setWordList] = useState((rule?.words ?? []).join(', '));
  const [aliases, setAliases] = useState((rule?.aliases ?? []).join(', '));
  const [scope, setScope] = useState(rule?.scope ?? 'scene');
  const [holderId, setHolderId] = useState(rule?.holderId ?? '');
  const [toEntryId, setToEntryId] = useState(rule?.toEntryId ?? '');
  const [amount, setAmount] = useState(rule?.amount ? String(rule.amount) : '');
  const [unit, setUnit] = useState<TimeUnit>(rule?.unit ?? 'days');
  const [fromNodeId, setFromNodeId] = useState(rule?.fromNodeId ?? '');
  const [untilNodeId, setUntilNodeId] = useState(rule?.untilNodeId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const tree = flatten(buildTree(nodes));
  const preferred = { status: 'character', possession: 'item', travel: 'location', power: 'power' }[kind];
  // Offer the fitting category when the Codex has it; otherwise everything, so custom categories work too.
  const pool = entries.some((e) => e.category === preferred) && kind !== 'power' ? entries.filter((e) => e.category === preferred || e.id === entryId || e.id === toEntryId) : entries;
  const characters = entries.filter((e) => e.category === 'character');
  const subjectLabel = { status: 'Character', possession: 'Item', travel: 'From', power: 'Ability or power' }[kind];
  const chapters = (value: string, set: (id: string) => void, aria: string, none: string) => (
    <select value={nodes.some((n) => n.id === value) ? value : ''} aria-label={aria} onChange={(e) => set(e.target.value)}>
      <option value="">{none}</option>
      {tree.map(({ node, depth }) => (
        <option key={node.id} value={node.id}>
          {'  '.repeat(depth) + node.title}
        </option>
      ))}
    </select>
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = !entryId ? `Choose ${kind === 'travel' ? 'where the journey starts' : `the ${subjectLabel.toLowerCase()}`}.`
      : kind === 'travel' && (!toEntryId || toEntryId === entryId) ? 'Choose a different place for the journey to end.'
      : kind === 'travel' && !(Number(amount) > 0) ? 'Say how long the journey takes.'
      : kind === 'possession' && state === 'held' && !holderId ? 'Choose who holds it.'
      : (kind === 'power' || (kind === 'status' && state === 'condition')) && !wordList.trim() ? 'Add at least one word to look for.'
      : null;
    if (problem) return setError(problem);
    setSaving(true);
    try {
      await onSubmit({ entryId, state, label, words: wordList, aliases, scope, holderId: holderId || null, toEntryId: toEntryId || null, amount: Number(amount) || null, unit, fromNodeId: fromNodeId || null, untilNodeId: untilNodeId || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <p className="muted small">{KIND_HINTS[kind]}</p>
      <label className="field">
        <span>{subjectLabel}</span>
        <select value={entryId} aria-label={subjectLabel} onChange={(e) => setEntryId(e.target.value)}>
          <option value="">Choose…</option>
          <EntryOptions entries={pool} />
        </select>
      </label>

      {kind === 'travel' && (
        <>
          <label className="field">
            <span>To</span>
            <select value={toEntryId} aria-label="To" onChange={(e) => setToEntryId(e.target.value)}>
              <option value="">Choose…</option>
              <EntryOptions entries={pool.filter((e) => e.id !== entryId)} />
            </select>
          </label>
          <div className="grid-2 tight">
            <label className="field">
              <span>The journey takes</span>
              <input type="number" min={0} step="any" value={amount} aria-label="The journey takes" onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="field">
              <span>Unit</span>
              <select value={unit} aria-label="Unit" onChange={(e) => setUnit(e.target.value as TimeUnit)}>
                {TIME_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}

      {(kind === 'status' || kind === 'possession') && (
        <>
          <label className="field">
            <span>What is true</span>
            <select value={state} aria-label="What is true" onChange={(e) => setState(e.target.value as RuleState)}>
              {(kind === 'status' ? STATUS_STATES : POSSESSION_STATES).map((s) => (
                <option key={s} value={s}>
                  {STATE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          {kind === 'possession' && state === 'held' && (
            <label className="field">
              <span>Held by</span>
              <select value={holderId} aria-label="Held by" onChange={(e) => setHolderId(e.target.value)}>
                <option value="">Choose a character…</option>
                <EntryOptions entries={characters.length ? characters : entries} />
              </select>
            </label>
          )}
          {kind === 'status' && state !== 'deceased' && (
            <label className="field">
              <span>In your words</span>
              <input value={label} aria-label="In your words" placeholder={state === 'absent' ? 'imprisoned in the Keep' : 'lost his right hand'} onChange={(e) => setLabel(e.target.value)} />
            </label>
          )}
          {kind === 'status' && state === 'condition' && (
            <label className="field">
              <span>Words that would not fit (comma separated)</span>
              <input value={wordList} aria-label="Words that would not fit" placeholder="both hands, right hand" onChange={(e) => setWordList(e.target.value)} />
            </label>
          )}
          <div className="grid-2 tight">
            <label className="field">
              <span>Happens in</span>
              {chapters(fromNodeId, setFromNodeId, 'Happens in', 'Before the story starts')}
            </label>
            <label className="field">
              <span>Stops being true from</span>
              {chapters(untilNodeId, setUntilNodeId, 'Stops being true from', 'Still true at the end')}
            </label>
          </div>
          <p className="muted small">Everything after the chapter it happens in is checked. The chapter itself is not: that is where it happens.</p>
        </>
      )}

      {kind === 'power' && (
        <>
          <label className="field">
            <span>The rule, in your words</span>
            <input value={label} aria-label="The rule, in your words" placeholder="Needs direct sunlight" onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="field">
            <span>Cannot be used where the text mentions (comma separated)</span>
            <input value={wordList} aria-label="Cannot be used where the text mentions" placeholder="underground, night, sealed room" onChange={(e) => setWordList(e.target.value)} />
          </label>
          <label className="field">
            <span>Look for those words</span>
            <select value={scope} aria-label="Look for those words" onChange={(e) => setScope(e.target.value === 'paragraph' ? 'paragraph' : 'scene')}>
              <option value="scene">Anywhere in the same chapter or scene</option>
              <option value="paragraph">Only in the same paragraph</option>
            </select>
          </label>
        </>
      )}

      {kind !== 'travel' && (
        <label className="field">
          <span>Also written as (comma separated)</span>
          <input value={aliases} aria-label="Also written as" placeholder="the prince, Dawnbreaker" onChange={(e) => setAliases(e.target.value)} />
        </label>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={saving}>
          {rule ? 'Save changes' : 'Start tracking'}
        </button>
      </div>
    </form>
  );
}
