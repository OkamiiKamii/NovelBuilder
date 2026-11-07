import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/core';
import { createId } from '@/core/id';
import { storyOrder } from '@/modules/relationships/timeline';
import { computeSheet, takesPoints, xpHistory } from '../compute';
import { formatNumber } from '../formula';
import type { ProjectSystems } from '../service';
import type { SystemBlueprint, SystemSheet } from '../types';

interface LevelingProps {
  system: SystemBlueprint;
  sheet: SystemSheet;
  name: string;
  edit: (change: Parameters<ProjectSystems['updateSheet']>[1]) => void;
}

/**
 * LEVELLING
 * Experience and points for one sheet. Nothing here stores a level: the
 * author logs what was earned and where, and the level is read off the
 * track's curve. Points a level brings are placed by hand; placing more than
 * were earned is shown, never refused.
 */
export function Leveling({ system, sheet, name, edit }: LevelingProps) {
  const nodes = useLiveQuery(() => db.chapters.where('projectId').equals(system.projectId).toArray(), [system.projectId]) ?? [];
  const tracks = system.tracks.filter((t) => t.kind === 'levels' && t.curve.trim());
  const [trackId, setTrackId] = useState('');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const [nodeId, setNodeId] = useState('');
  const [note, setNote] = useState('');
  const { points } = computeSheet(system, sheet);
  if (!tracks.length && !points) return null;

  const track = tracks.find((t) => t.id === trackId) ?? tracks[0];
  const { position } = storyOrder(nodes);
  const documents = nodes.filter((n) => n.kind === 'chapter' || n.kind === 'scene').sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
  const history = xpHistory(system, sheet, (id) => (id === null ? -1 : (position.get(id) ?? Number.MAX_SAFE_INTEGER)));
  const place = (id: string | null) => (id === null ? 'Before the story' : (nodes.find((n) => n.id === id)?.title ?? 'A chapter that was removed'));
  const give = (variableId: string, by: number) =>
    edit((c) => {
      const next = Math.max(0, (c.spent?.[variableId] ?? 0) + by);
      const { [variableId]: _was, ...rest } = c.spent ?? {};
      return { spent: next ? { ...rest, [variableId]: next } : rest };
    });

  return (
    <>
      {track && (
        <fieldset className="plan-group leveling" aria-label={`${name}'s experience`}>
          <legend>Experience</legend>
          <form
            className="xp-form"
            onSubmit={(e) => {
              e.preventDefault();
              const gained = Number(amount);
              if (!Number.isFinite(gained) || gained === 0) return;
              const entry = { id: createId(), trackId: track.id, amount: gained, source, nodeId: nodeId || null, note };
              edit((c) => ({ xp: [...(c.xp ?? []), entry] }));
              setAmount('');
              setNote('');
            }}
          >
            {tracks.length > 1 && (
              <select value={track.id} aria-label="Track the experience counts towards" onChange={(e) => setTrackId(e.target.value)}>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            <input type="number" step="any" value={amount} aria-label={`${track.curveUnit || 'Experience'} gained`} placeholder={`${track.curveUnit || 'Amount'} (− for a loss)`} onChange={(e) => setAmount(e.target.value)} />
            <input value={source} list={`xp-sources-${track.id}`} aria-label="Where it came from" placeholder="Source" onChange={(e) => setSource(e.target.value)} />
            <datalist id={`xp-sources-${track.id}`}>
              {(track.sources ?? []).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <select value={nodeId} aria-label="Where in the story" onChange={(e) => setNodeId(e.target.value)}>
              <option value="">Before the story</option>
              {documents.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.kind === 'scene' ? '  ' : ''}
                  {node.title}
                </option>
              ))}
            </select>
            <input value={note} aria-label="Note on this experience" placeholder="What happened (optional)" onChange={(e) => setNote(e.target.value)} />
            <button type="submit" className="btn" disabled={!Number.isFinite(Number(amount)) || Number(amount) === 0}>
              Log
            </button>
          </form>
          {history.length === 0 ? (
            <p className="muted small">
              Nothing logged: {name}’s {track.name.toLowerCase()} is the number set above. Log what they earn and the level is worked out from the curve, starting from that number.
            </p>
          ) : (
            <ol className="xp-log" aria-label={`${name}'s experience log`}>
              {history.map(({ entry, level, track: on }, i) => {
                const rose = level > (history.slice(0, i).findLast((h) => h.track.id === on.id)?.level ?? Math.max(1, Math.round(Number(sheet.progress[on.id]) || 1)));
                return (
                  <li key={entry.id}>
                    <span className="xp-amount">
                      {entry.amount > 0 ? '+' : '−'}
                      {formatNumber(Math.abs(entry.amount))} {on.curveUnit}
                    </span>
                    <span className="xp-what">
                      {[entry.source, entry.note].filter(Boolean).join(' · ') || 'Unlabelled'}
                      <span className="muted small"> · {place(entry.nodeId)}</span>
                    </span>
                    <span className={rose ? 'badge xp-up' : 'muted small'}>
                      {on.name} {level}
                    </span>
                    <button type="button" className="btn ghost icon" aria-label={`Remove ${formatNumber(entry.amount)} ${on.curveUnit} from ${entry.source || place(entry.nodeId)}`} onClick={() => edit((c) => ({ xp: (c.xp ?? []).filter((e) => e.id !== entry.id) }))}>
                      ✕
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </fieldset>
      )}
      {points && (
        <fieldset className="plan-group leveling" aria-label={`${name}'s points`}>
          <legend>
            Points: {points.unspent >= 0 ? `${formatNumber(points.unspent)} to place` : `${formatNumber(-points.unspent)} more placed than earned`}
          </legend>
          <p className={`small ${points.unspent < 0 ? 'sheet-unmet' : 'muted'}`}>
            {formatNumber(points.earned)} earned from levels, {formatNumber(points.spent)} placed. {points.unspent < 0 ? 'Nothing stops you: this is only a note that the sheet has more than the levels gave.' : 'A point placed adds one to the attribute.'}
          </p>
          <ul className="point-rows">
            {system.variables.filter(takesPoints).map((v) => (
              <li key={v.id}>
                <span>{v.name}</span>
                <button type="button" className="btn ghost icon" aria-label={`Take a point from ${v.name}`} disabled={!sheet.spent?.[v.id]} onClick={() => give(v.id, -1)}>
                  −
                </button>
                <output aria-label={`Points placed on ${v.name}`}>{sheet.spent?.[v.id] ?? 0}</output>
                <button type="button" className="btn ghost icon" aria-label={`Place a point on ${v.name}`} onClick={() => give(v.id, 1)}>
                  +
                </button>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
    </>
  );
}
