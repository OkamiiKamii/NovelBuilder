import { useState } from 'react';
import { tracker } from '@/core';
import { Check } from '@/modules/codex/components/Check';
import type { StoryModel } from '@/modules/model/types';
import { Modal } from '@/shared/Modal';
import { PROGRESS_PRESETS, PROGRESS_SHAPES, SHAPE_HINTS, SHAPE_LABELS, type ProgressCategory, type ProgressShape } from '../track';

/**
 * What the novel tracks about how its characters change. Nothing is tracked
 * until the author adds it, from the suggestions or of their own; each
 * category can be limited to some characters; one in use is archived, never
 * removed, so no change recorded in it is lost.
 */
export function TrackedCategories({ model, onClose }: { model: StoryModel; onClose: () => void }) {
  const api = tracker.forProject(model.project.id);
  const [name, setName] = useState('');
  const [shape, setShape] = useState<ProgressShape>('held');
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const categories = [...model.progressCategories.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const characters = [...model.entries.values()].filter((e) => e.category === 'character').sort((a, b) => a.name.localeCompare(b.name));
  const used = (c: ProgressCategory) => model.progress.filter((p) => p.categoryId === c.id).length;
  const act = (task: Promise<unknown>, done?: string) => void task.then(() => setNotice(done ? { text: done } : null), (e) => setNotice({ text: e instanceof Error ? e.message : String(e), error: true }));
  const save = (c: ProgressCategory, changes: Parameters<typeof api.saveCategory>[1]) => act(api.saveCategory(c.id, changes));
  const missing = PROGRESS_PRESETS.filter((p) => !categories.some((c) => c.name.toLowerCase() === p.name.toLowerCase()));

  return (
    <Modal title="What is tracked" onClose={onClose}>
      <div className="stack tracked-categories">
        <p className="muted small">What this novel tracks about how its characters change. Nothing is tracked until you add it, and a character shows only what you record for them: no levels or statistics unless you record some.</p>
        {notice && (
          <p className={notice.error ? 'error' : 'notice'} role={notice.error ? 'alert' : 'status'}>
            {notice.text}
          </p>
        )}
        {categories.length === 0 ? (
          <p className="muted">Nothing is tracked yet.</p>
        ) : (
          <ul className="tracked-list" aria-label="Tracked categories">
            {categories.map((c) => (
              <li key={c.id} className={c.archived ? 'archived' : undefined}>
                <div className="tracked-head">
                  <input key={c.name} defaultValue={c.name} aria-label={`Name of ${c.name}`} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.name && save(c, { name: e.target.value })} />
                  <select value={c.shape} aria-label={`Shape of ${c.name}`} disabled={used(c) > 0} title={used(c) ? 'It has changes recorded, so its shape stays as it is.' : undefined} onChange={(e) => save(c, { shape: e.target.value as ProgressShape })}>
                    {PROGRESS_SHAPES.map((s) => (
                      <option key={s} value={s}>
                        {SHAPE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <span className="muted small">
                    {used(c)} {used(c) === 1 ? 'change' : 'changes'}
                    {c.archived && ' · archived'}
                  </span>
                </div>
                {c.shape === 'value' && (
                  <input key={c.ladder.join('|')} className="tracked-ladder" defaultValue={c.ladder.join(', ')} placeholder="Steps in order, lowest first, if it is a ladder (Squire, Knight, Captain)" aria-label={`Steps of ${c.name}, lowest first`} onBlur={(e) => save(c, { ladder: e.target.value.split(',') })} />
                )}
                {characters.length > 0 && (
                  <details className="tracked-who">
                    <summary>{c.characterIds.length ? `For ${characters.filter((p) => c.characterIds.includes(p.id)).map((p) => p.name).join(', ') || 'characters since deleted'}` : 'For every character'}</summary>
                    <div className="tracked-who-list" role="group" aria-label={`Who ${c.name} applies to`}>
                      {characters.map((p) => (
                        <Check key={p.id} label={p.name} name={`${c.name} applies to ${p.name}`} checked={c.characterIds.includes(p.id)} onChange={(on) => save(c, { characterIds: on ? [...c.characterIds, p.id] : c.characterIds.filter((id) => id !== p.id) })} />
                      ))}
                      <small className="muted">None ticked: it applies to every character.</small>
                    </div>
                  </details>
                )}
                <div className="actions start">
                  <button type="button" className="btn ghost" onClick={() => save(c, { archived: !c.archived })}>
                    {c.archived ? `Restore ${c.name}` : `Archive ${c.name}`}
                  </button>
                  {used(c) === 0 && (
                    <button type="button" className="btn ghost" onClick={() => act(api.removeCategory(c.id), `Stopped tracking ${c.name}.`)}>
                      Remove {c.name}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {missing.length > 0 && (
          <div className="stack tight">
            <strong>Start from</strong>
            <div className="chips" role="group" aria-label="Suggested categories">
              {missing.map((p) => (
                <button key={p.name} type="button" className="filter-chip" title={SHAPE_HINTS[p.shape]} onClick={() => act(api.addPreset(p.name), `Now tracking ${p.name}.`)}>
                  + {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <form
          className="stack tight"
          onSubmit={(e) => {
            e.preventDefault();
            act(
              api.saveCategory(null, { name, shape }).then(() => setName('')),
              `Now tracking ${name.trim()}.`,
            );
          }}
        >
          <strong>Your own</strong>
          <div className="toolbar">
            <input value={name} placeholder="Cultivation realm, Oaths, Scars…" aria-label="New category name" onChange={(e) => setName(e.target.value)} />
            <select value={shape} aria-label="Shape of the new category" onChange={(e) => setShape(e.target.value as ProgressShape)}>
              {PROGRESS_SHAPES.map((s) => (
                <option key={s} value={s}>
                  {SHAPE_LABELS[s]}
                </option>
              ))}
            </select>
            <button type="submit" className="btn" disabled={!name.trim()}>
              Add
            </button>
          </div>
          <small className="muted">{SHAPE_HINTS[shape]}</small>
        </form>
      </div>
    </Modal>
  );
}
