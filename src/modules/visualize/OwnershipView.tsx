import { useState } from 'react';
import { connections } from '@/core';
import { EntryOptions } from '@/modules/codex/categories';
import { useMe } from '@/modules/collab/identity';
import { HOW_ENDED, HOW_GAINED, ownedItems, ownershipOf, type Holding } from '@/modules/factions/ownership';
import type { EntityRef, StoryModel } from '@/modules/model/types';
import type { Anchor } from '@/modules/model/validity';
import { whenWords } from '@/modules/progression/track';
import { can } from '@/modules/sync/access';
import { WhenPicker } from '@/modules/travel/components/TravelForms';
import { decodeAnchor } from '@/modules/viz/params';
import { ViewSwitch } from '@/modules/viz/components/ViewSwitch';
import { VizState } from '@/modules/viz/components/VizState';
import { Modal } from '@/shared/Modal';
import { AsOf, TimelineNote } from './FactionsView';
import { Legend } from '@/modules/viz/components/Legend';

/** The page address: the item, and as of when. */
export const OWNERSHIP_PARAMS = ['oitem', 'oat'] as const;
export const ownershipLayout = (params: URLSearchParams): Record<string, string> => Object.fromEntries(OWNERSHIP_PARAMS.flatMap((p) => (params.get(p) ? [[p, params.get(p)!]] : [])));

interface OwnershipViewProps {
  model: StoryModel;
  projectId: string;
  params: URLSearchParams;
  setParams: (changes: Record<string, string | null>) => void;
  mode: 'visual' | 'list';
  setMode: (mode: 'visual' | 'list') => void;
  pick: (ref: EntityRef) => void;
  history: string | null;
}

/**
 * OWNERSHIP
 * One item's hands: who made it, each holding in order with how it began and
 * how it passed on, the stretches nobody is recorded as holding it, and
 * where it stands at any point; drawn as a chain, or as a table. What
 * happens to it is recorded here too: made, found, given, sold, stolen,
 * inherited, lost, destroyed, or in the author's own words.
 */
export function OwnershipView({ model, projectId, params, setParams, mode, setMode, pick, history }: OwnershipViewProps) {
  const me = useMe(projectId);
  const items = ownedItems(model);
  const [recording, setRecording] = useState(false);
  const at: Anchor | 'end' = decodeAnchor(params.get('oat')) ?? 'end';
  if (!items.length) return <VizState status={{ kind: 'empty', message: 'No items yet. Add items in the Codex, or record that someone owns something.' }} />;
  const item = items.find((i) => i.id === params.get('oitem')) ?? items.find((i) => model.links.some((l) => l.type === 'owns' && l.toId === i.id)) ?? items[0];
  const o = ownershipOf(model, item.id, at)!;
  const writes = can(me.role, 'write');
  const card = (h: Holding, i: number) => (
    <li key={h.link.id} className={`own-holding${h.inThisTimeline ? '' : ' not-here'}`}>
      {i > 0 && <span className="own-arrow" aria-hidden="true">→</span>}
      <span className="own-card">
        <button type="button" className="link" onClick={() => pick({ type: 'entry', id: h.holderId })}>
          {h.holderName}
        </button>
        <span className="muted small">
          {h.how ? `${h.how}, ` : ''}
          {h.began}
        </span>
        {h.ended && (
          <span className="muted small">
            until {h.ended}
            {h.endHow ? ` (${h.endHow})` : ''}
          </span>
        )}
        {!h.inThisTimeline && <span className="field-issue small">does not happen in this timeline</span>}
        {h.timeless && <span className="muted small">(no time given)</span>}
      </span>
    </li>
  );
  return (
    <>
      <div className="viz-toolbar">
        <label className="field viz-who">
          <span>Item</span>
          <select aria-label="Item" value={item.id} onChange={(e) => setParams({ oitem: e.target.value })}>
            <EntryOptions entries={items} />
          </select>
        </label>
        <AsOf model={model} label="Ownership as of" value={at} onChange={(v) => setParams({ oat: v })} />
        <ViewSwitch mode={mode} onChange={setMode} visualLabel="Chain" />
        {writes && (
          <button type="button" className="btn" onClick={() => setRecording(true)}>
            Record what happens to it
          </button>
        )}
      </div>
      <TimelineNote model={model} history={history} />
      <section className="stack tight" aria-label={`Ownership of ${item.name}`}>
        <p className="own-now" role="status">
          <strong>{item.name}</strong>, as of {at === 'end' ? 'the end of the story' : whenWords(at, model)}: {o.now.words}
        </p>
        {o.makers.length > 0 && <p className="small">Made by {o.makers.map((m) => `${m.name} (${m.when})`).join(', ')}.</p>}
        {o.holdings.length === 0 ? (
          <p className="muted">No holding recorded: who has had it is not known.</p>
        ) : mode === 'visual' ? (
          <>
            <ol className="own-chain" aria-label={`Who has held ${item.name}, in order`}>
              {o.holdings.map(card)}
            </ol>
            <Legend
              title="What the chain shows"
              items={[
                { key: 'held', label: 'Held, as you recorded it', color: 'var(--muted)', shape: 'outline' },
                ...(o.holdings.some((h) => !h.inThisTimeline) ? [{ key: 'elsewhere', label: 'Held only in another timeline (dashed)', color: 'var(--muted)', shape: 'empty' as const }] : []),
                ...(o.holdings.length > 1 ? [{ key: 'then', label: 'Then, in the order recorded', color: 'var(--muted)', shape: 'arrow' as const }] : []),
              ]}
            />
          </>
        ) : (
          <div className="table-scroll">
            <table className="sessions">
              <caption className="visually-hidden">Who has held {item.name}, in order</caption>
              <thead>
                <tr>
                  <th scope="col">Holder</th>
                  <th scope="col">From</th>
                  <th scope="col">How</th>
                  <th scope="col">Until</th>
                  <th scope="col">How it ended</th>
                </tr>
              </thead>
              <tbody>
                {o.holdings.map((h) => (
                  <tr key={h.link.id}>
                    <th scope="row">
                      {h.holderName}
                      {!h.inThisTimeline && <span className="field-issue small"> (does not happen in this timeline)</span>}
                    </th>
                    <td>{h.began}</td>
                    <td>{h.how || '—'}</td>
                    <td>{h.ended ?? 'still'}</td>
                    <td>{h.endHow || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {o.unknown.length > 0 && (
          <ul className="small" aria-label="Stretches with no owner known">
            {o.unknown.map((u) => (
              <li key={u}>{u}.</li>
            ))}
          </ul>
        )}
      </section>
      {recording && <OwnershipForm model={model} projectId={projectId} itemId={item.id} onClose={() => setRecording(false)} />}
    </>
  );
}

/**
 * What happens to an item, recorded as "Owns" connections: a first holder;
 * a new holder from a point (the holding before ends there, and is kept);
 * or an end with nobody after (lost, destroyed). Through the connections
 * service, so it is the same connection as anywhere else.
 */
function OwnershipForm({ model, projectId, itemId, onClose }: { model: StoryModel; projectId: string; itemId: string; onClose: () => void }) {
  const [what, setWhat] = useState<string>('given');
  const [own, setOwn] = useState('');
  const [holder, setHolder] = useState('');
  const [when, setWhen] = useState<Anchor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const o = ownershipOf(model, itemId)!;
  const open = o.holdings.filter((h) => h.inThisTimeline && !h.link.validity?.until);
  const [which, setWhich] = useState(open[0]?.link.id ?? '');
  const ends = (HOW_ENDED as readonly string[]).includes(what) || what === 'own-end';
  const how = what === 'own' || what === 'own-end' ? own.trim() : what;
  const api = connections.forProject(projectId);
  const save = async () => {
    if (!how) throw new Error('Say what happens.');
    if (ends) {
      if (!open.length) throw new Error('Nobody is recorded as holding it now.');
      if (!when) throw new Error('Choose when it happens.');
      await api.end(which, when, how);
      return;
    }
    if (!holder) throw new Error('Choose who has it next.');
    const to = { type: 'entry' as const, id: holder };
    if (open.length) {
      if (!when) throw new Error(`Choose when it happens: ${open.find((h) => h.link.id === which)?.holderName ?? 'the holder before'} holds it until then.`);
      await api.change(which, when, { from: to, how });
    } else await api.create({ from: to, to: { type: 'entry', id: itemId }, type: 'owns', how, ...(when ? { validity: { from: when, until: null } } : {}) });
  };
  return (
    <Modal title={`What happens to ${model.entries.get(itemId)?.name}`} onClose={onClose}>
      <form
        className="stack own-form"
        aria-label={`What happens to ${model.entries.get(itemId)?.name}`}
        onSubmit={(e) => {
          e.preventDefault();
          void save().then(onClose, (err) => setError(err instanceof Error ? err.message : String(err)));
        }}
      >
        <label className="field">
          <span>What happens</span>
          <select aria-label="What happens" value={what} onChange={(e) => setWhat(e.target.value)}>
            <optgroup label="It passes to someone">
              {HOW_GAINED.map((h) => (
                <option key={h} value={h}>
                  {h.charAt(0).toUpperCase() + h.slice(1)}
                </option>
              ))}
              <option value="own">In your own words…</option>
            </optgroup>
            <optgroup label="Nobody has it after">
              {HOW_ENDED.map((h) => (
                <option key={h} value={h}>
                  {h.charAt(0).toUpperCase() + h.slice(1)}
                </option>
              ))}
              <option value="own-end">In your own words…</option>
            </optgroup>
          </select>
        </label>
        {(what === 'own' || what === 'own-end') && <input aria-label="What happens, in your own words" placeholder="pawned, buried with him, melted down…" value={own} onChange={(e) => setOwn(e.target.value)} />}
        {!ends && (
          <label className="field">
            <span>Who has it next</span>
            <select aria-label="Who has it next" value={holder} onChange={(e) => setHolder(e.target.value)}>
              <option value="">Choose…</option>
              <EntryOptions entries={[...model.entries.values()].filter((e) => e.id !== itemId)} />
            </select>
          </label>
        )}
        {open.length > 1 && (
          <label className="field">
            <span>Whose holding</span>
            <select aria-label="Whose holding" value={which} onChange={(e) => setWhich(e.target.value)}>
              {open.map((h) => (
                <option key={h.link.id} value={h.link.id}>
                  {h.holderName}
                </option>
              ))}
            </select>
          </label>
        )}
        <WhenPicker label="When" value={when} onChange={setWhen} model={model} />
        <p className="muted small">{open.length ? `Held now by ${open.map((h) => h.holderName).join(' and ')}: that holding ends at the point you choose, and is kept as history.` : 'Nobody is recorded as holding it now.'}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions start">
          <button type="submit" className="btn primary">
            Record it
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
