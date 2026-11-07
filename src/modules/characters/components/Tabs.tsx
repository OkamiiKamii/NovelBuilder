import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { IfViewOn, ViewLink } from '@/modules/visualize/ViewLink';
import { characters, codex, db, relationships, systems as systemsService } from '@/core';
import { EntryCanon } from '@/modules/canon/components/LinkedFacts';
import { CharacterModules } from '@/modules/extensions/components/CharacterModules';
import { EntryProgression } from '@/modules/progression/components/EntryProgression';
import { EntryOptions } from '@/modules/codex/categories';
import { relatedTo } from '@/modules/codex/service';
import type { LoreEntry, LoreLink } from '@/modules/codex/types';
import type { StoryNode } from '@/modules/manuscript/types';
import { statusName } from '@/modules/plot/types';
import { RelationDetails } from '@/modules/relationships/components/RelationDetails';
import { useRelationships } from '@/modules/relationships/hooks';
import { sortedStages, type StoryOrder } from '@/modules/relationships/timeline';
import { useTimeline } from '@/modules/timeline/hooks';
import { AFFINITY_LABELS, RELATION_CATEGORIES, RELATION_CATEGORY_LABELS, RELATION_PRESETS, type RelationCategory } from '@/modules/relationships/types';
import { computeSheet } from '@/modules/systems/compute';
import { rankName } from '@/modules/systems/types';
import { SavedText } from '@/shared/SavedText';
import { entryPath } from '../hooks';
import type { Listed } from '../library';
import { currentOf } from '../knowledge';
import { AWARENESS_LABELS, KNOWLEDGE, KNOWLEDGE_LABELS, SECRET_STATUSES, type CharacterNote, type CharacterProfile, type CharacterSecret, type Knowledge } from '../types';
import { ChapterOptions } from './ChapterOptions';
import { KnowledgePanel } from './KnowledgePanel';
import { Portrait } from './Portrait';
import { VaultMap, standing } from './VaultMap';
import { changeWords } from '@/modules/progression/track';

const when = (at: number) => new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const say = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.');

interface Common {
  projectId: string;
  entry: LoreEntry;
  profile: CharacterProfile;
  entries: LoreEntry[];
  nodes: StoryNode[];
  order: StoryOrder;
  onError: (error: unknown) => void;
}

/** A way to choose several records: the chosen ones as chips, and a menu to add another. */
function Picker({ label, chosen, options, nameOf, onChange }: { label: string; chosen: string[]; options: { id: string; name: string }[]; nameOf: (id: string) => string | undefined; onChange: (ids: string[]) => void }) {
  const left = options.filter((o) => !chosen.includes(o.id));
  return (
    <div className="picker" role="group" aria-label={label}>
      {chosen.filter((id) => nameOf(id)).map((id) => (
        <span key={id} className="tag-chip">
          {nameOf(id)}
          <button type="button" aria-label={`Remove ${nameOf(id)} from ${label}`} onClick={() => onChange(chosen.filter((c) => c !== id))}>
            ✕
          </button>
        </span>
      ))}
      {left.length > 0 && (
        <select value="" aria-label={`Add to ${label}`} onChange={(e) => e.target.value && onChange([...chosen, e.target.value])}>
          <option value="">Add…</option>
          {left.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}
      {chosen.length === 0 && left.length === 0 && <span className="muted small">Nothing to choose from yet.</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- Overview

/** What other parts of the project say about the character. Each card shows records that live elsewhere and links to them; none is a copy. */
export function OverviewExtras({ projectId, entry, listed, nodes, order, mentions, onError }: Common & { listed: Listed; mentions: number | undefined }) {
  const base = `/project/${projectId}`;
  const navigate = useNavigate();
  // In the order they happen, with the date each is given: the same reading of the timeline every other page uses.
  const { placed } = useTimeline(projectId);
  const threads = useLiveQuery(() => db.plotThreads.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const systems = useLiveQuery(() => db.systems.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const sheets = useLiveQuery(() => db.systemSheets.where('projectId').equals(projectId).filter((sheet) => sheet.entryId === entry.id).toArray(), [projectId, entry.id]) ?? [];
  const snapshots = useLiveQuery(() => db.progressSnapshots.where('projectId').equals(projectId).filter((snapshot) => snapshot.entryId === entry.id).toArray(), [projectId, entry.id]) ?? [];
  const mine = { events: placed.filter((p) => p.event.characters.some((c) => c.id === entry.id)), threads: threads.filter((t) => t.characterIds.includes(entry.id)) };
  const title = (id: string) => nodes.find((n) => n.id === id)?.title ?? 'A chapter';
  // The author's appearance records, the other way round from each chapter's plan: in reading order.
  const plans = useLiveQuery(() => db.chapterPlans.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const reading = (ids: string[]) => ids.filter((id) => nodes.some((n) => n.id === id)).sort((a, b) => (order.position.get(a) ?? 0) - (order.position.get(b) ?? 0));
  const appearsIn = reading(plans.filter((p) => (p.appearIds ?? []).includes(entry.id)).map((p) => p.id));
  const mentionedIn = reading(plans.filter((p) => (p.mentionIds ?? []).includes(entry.id)).map((p) => p.id));
  return (
    <div className="vault-linked">
      <section className="vault-section" aria-label="In the manuscript">
        <header className="vault-section-head">
          <h3>In the manuscript</h3>
        </header>
        {listed.linkedIn.length === 0 ? (
          <p className="muted small">No chapter links to {entry.name} yet. In the editor, select their name (or a title they go by) and link it to this character.</p>
        ) : (
          <>
            <p className="small">
              Linked in <strong>{listed.linkedIn.length}</strong> {listed.linkedIn.length === 1 ? 'chapter or scene' : 'chapters and scenes'}. First: <Link to={`${base}/manuscript/${listed.linkedIn[0]}`}>{title(listed.linkedIn[0])}</Link>
              {listed.linkedIn.length > 1 && (
                <>
                  ; latest: <Link to={`${base}/manuscript/${listed.linkedIn[listed.linkedIn.length - 1]}`}>{title(listed.linkedIn[listed.linkedIn.length - 1])}</Link>
                </>
              )}
              .
            </p>
            <ul className="vault-chapters" aria-label="Linked chapters and scenes">
              {listed.linkedIn.slice(0, 24).map((id) => (
                <li key={id}>
                  <Link to={`${base}/manuscript/${id}`}>{title(id)}</Link>
                </li>
              ))}
              {listed.linkedIn.length > 24 && <li className="muted">and {listed.linkedIn.length - 24} more</li>}
            </ul>
          </>
        )}
        <p className="muted small">{mentions === undefined ? 'Counting name mentions…' : `Their name, aliases or title occur ${mentions} ${mentions === 1 ? 'time' : 'times'} in the text. That counts words on the page, including when others speak of them; only links say where a character is actually present.`}</p>
        {(appearsIn.length > 0 || mentionedIn.length > 0) && (
          <div className="small" aria-label="Your appearance records">
            {[
              ['Appears in (your record)', appearsIn],
              ['Mentioned, not on the page (your record)', mentionedIn],
            ].map(([label, ids]) =>
              (ids as string[]).length ? (
                <p key={label as string}>
                  {label as string}:{' '}
                  {(ids as string[]).map((id, i) => (
                    <span key={id}>
                      {i > 0 && ', '}
                      <Link to={`${base}/manuscript/${id}`}>{title(id)}</Link>
                    </span>
                  ))}
                </p>
              ) : null,
            )}
          </div>
        )}
      </section>

      {(systems.length > 0 || snapshots.length > 0) && (
        <section className="vault-section" aria-label="Character progression">
          <header className="vault-section-head">
            <h3>Character progression</h3>
          </header>
          {[...sheets].sort((a, b) => (systems.find((s) => s.id === a.systemId)?.name ?? '').localeCompare(systems.find((s) => s.id === b.systemId)?.name ?? '')).map((sheet) => {
            const system = systems.find((s) => s.id === sheet.systemId);
            if (!system) return null;
            const computed = computeSheet(system, sheet);
            const groups = new Map<string, number>();
            for (const { group } of computed.items) groups.set(group?.name ?? 'Other', (groups.get(group?.name ?? 'Other') ?? 0) + 1);
            return (
              <div key={sheet.id} className="vault-sheet">
                <dl className="vault-progress" aria-label={system.name}>
                  <div>
                    <dt>System</dt>
                    <dd>{system.name}</dd>
                  </div>
                  {computed.tracks.map(({ track, label, xp }) => (
                    <div key={track.id}>
                      <dt>{track.name}</dt>
                      <dd>
                        {label}
                        {xp && <span className="muted small"> · {xp.progress}</span>}
                      </dd>
                    </div>
                  ))}
                  {computed.points && (
                    <div>
                      <dt>{computed.points.name}</dt>
                      <dd className={computed.points.unspent < 0 ? 'sheet-unmet' : ''}>{computed.points.unspent < 0 ? `${-computed.points.unspent} over` : `${computed.points.unspent} unspent`}</dd>
                    </div>
                  )}
                  {[...groups].map(([name, count]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{count}</dd>
                    </div>
                  ))}
                </dl>
                <Link to={`${base}/characters/${entry.id}/system?system=${system.id}`}>Open {entry.name}’s sheet</Link>
              </div>
            );
          })}
          {sheets.length === 0 && systems.length > 0 && <p className="muted small">{entry.name} is not on a system yet. A sheet holds their level, experience, attributes, class and skills; nothing of it is copied onto this profile.</p>}
          {systems.some((s) => !sheets.some((sheet) => sheet.systemId === s.id)) && (
            <select
              value=""
              aria-label="Add to a system"
              onChange={(e) => {
                const systemId = e.target.value;
                if (systemId) void systemsService.forProject(projectId).addSheet(systemId, entry.id).then((sheet) => navigate(`${base}/characters/${entry.id}/system?system=${systemId}&sheet=${sheet.id}`), onError);
              }}
            >
              <option value="">Add {entry.name} to a system…</option>
              {systems.filter((s) => !sheets.some((sheet) => sheet.systemId === s.id)).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {snapshots.length > 0 && (
            <p className="small">
              {snapshots.length} {snapshots.length === 1 ? 'snapshot' : 'snapshots'} of their state at points in the story.
            </p>
          )}
          <Link className="btn" to={`${base}/progression?entry=${entry.id}`}>
            Open Progression Tracker
          </Link>
        </section>
      )}

      <section className="vault-section" aria-label="Timeline">
        <header className="vault-section-head">
          <h3>Timeline</h3>
        </header>
        {mine.events.length === 0 ? (
          <p className="muted small">No timeline event includes {entry.name} yet.</p>
        ) : (
          <ul className="vault-rows">
            {mine.events.map(({ event, label }) => (
              <li key={event.id}>
                <Link to={`${base}/timeline?event=${event.id}&character=${entry.id}`}>{event.name}</Link>
                {label && <span className="muted small">{label}</span>}
                {event.characters.find((c) => c.id === entry.id)?.age !== null && <span className="muted small">age {event.characters.find((c) => c.id === entry.id)!.age}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="vault-section" aria-label="Plot threads">
        <header className="vault-section-head">
          <h3>Plot threads</h3>
        </header>
        {mine.threads.length === 0 ? (
          <p className="muted small">No plot thread names {entry.name} yet.</p>
        ) : (
          <ul className="vault-rows">
            {mine.threads.map((thread) => (
              <li key={thread.id}>
                <Link to={`${base}/plot?thread=${thread.id}`}>{thread.title}</Link>
                <span className="badge">{statusName(thread)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <CharacterModules projectId={projectId} entry={entry} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- Relationships

export function RelationshipsTab({ projectId, entry, entries, nodes, onError, profiles }: Common & { profiles: Map<string, CharacterProfile> }) {
  const navigate = useNavigate();
  const { relations, order } = useRelationships(projectId);
  const api = useMemo(() => relationships.forProject(projectId), [projectId]);
  const [params, setParams] = useSearchParams();
  const [shown, setShown] = useState<Set<RelationCategory>>(new Set(RELATION_CATEGORIES));
  const [wider, setWider] = useState(false);
  const [otherId, setOtherId] = useState('');
  const [preset, setPreset] = useState('friends');
  const known = new Set(entries.map((e) => e.id));
  const live = relations.filter((r) => known.has(r.fromId) && known.has(r.toId));
  const mine = live.filter((r) => r.fromId === entry.id || r.toId === entry.id);
  const selected = live.find((r) => r.id === params.get('rel')) ?? null;
  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('rel', id);
    else next.delete('rel');
    setParams(next, { replace: true });
  };
  const people = entries.filter((e) => e.category === 'character' && e.id !== entry.id).sort((a, b) => a.name.localeCompare(b.name));
  const untied = people.filter((p) => !mine.some((r) => r.fromId === p.id || r.toId === p.id));
  const rows = mine.flatMap((relation) => {
    const other = entries.find((e) => e.id === (relation.fromId === entry.id ? relation.toId : relation.fromId));
    const now = standing(relation, order, entry.id);
    return other && now ? [{ relation, other, ...now }] : [];
  }).sort((a, b) => a.other.name.localeCompare(b.other.name));
  const toggle = (category: RelationCategory) => {
    const next = new Set(shown);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    setShown(next);
  };

  return (
    <div className="stack">
      <div className="vault-map-controls">
        <div className="chips" role="group" aria-label="Kinds of relationship to show">
          {RELATION_CATEGORIES.map((category) => (
            <button key={category} type="button" className={`filter-chip${shown.has(category) ? ' on' : ''}`} aria-pressed={shown.has(category)} onClick={() => toggle(category)}>
              {RELATION_CATEGORY_LABELS[category]}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={wider} onChange={(e) => setWider(e.target.checked)} />
          Show their connections’ connections
        </label>
      </div>
      <VaultMap focus={entry} entries={entries} profiles={profiles} relations={live} order={order} shown={shown} wider={wider} selectedId={selected?.id ?? null} onOpenCharacter={(id) => navigate(`/project/${projectId}/characters/${id}/relationships`)} onSelect={select} />

      {selected && <RelationDetails key={selected.id} relation={selected} entries={entries} nodes={nodes} order={order} api={api} projectId={projectId} onClose={() => select(null)} onError={onError} />}

      <section className="vault-section" aria-label="Relationship list">
        <header className="vault-section-head">
          <h3>
            Relationships <span className="vault-count">({rows.length})</span>
          </h3>
        </header>
        {rows.length === 0 ? (
          <p className="muted small">{entry.name} has no relationships recorded yet.</p>
        ) : (
          <ul className="vault-relations">
            {rows.filter((row) => shown.has(row.stage.category)).map(({ relation, other, stage, role }) => (
              <li key={relation.id} className={relation.id === selected?.id ? 'selected' : ''}>
                <Link to={`/project/${projectId}/characters/${other.id}`} className="vault-relation-who" aria-label={`Open ${other.name}’s profile`}>
                  <Portrait name={other.name} image={other.image} focal={profiles.get(other.id)?.focal} className="list-portrait" />
                  <strong>{other.name}</strong>
                </Link>
                <span className="small">
                  {role || stage.label || 'Related'}
                  {stage.title ? ` · ${stage.title}` : ''} · {RELATION_CATEGORY_LABELS[stage.category]} · {AFFINITY_LABELS[stage.affinity]}
                  {relation.stages.length > 1 ? ` · ${relation.stages.length} stages over the story` : ''}
                </span>
                <button type="button" className="btn" aria-label={`Relationship with ${other.name}: details`} onClick={() => select(relation.id)}>
                  Details
                </button>
              </li>
            ))}
          </ul>
        )}
        {untied.length > 0 && (
          <form
            className="vault-add-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!otherId) return;
              void api.create(entry.id, otherId, preset).then((relation) => {
                setOtherId('');
                select(relation.id);
              }, onError);
            }}
          >
            <select value={otherId} aria-label="Character to relate to" onChange={(e) => setOtherId(e.target.value)}>
              <option value="">Add a relationship with…</option>
              {untied.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select value={preset} aria-label="Kind of relationship" onChange={(e) => setPreset(e.target.value)}>
              {RELATION_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn primary" disabled={!otherId}>
              Add
            </button>
          </form>
        )}
        <p className="muted small">
          These are the same relationships the <Link to={`/project/${projectId}/relationships?focus=${entry.id}`}>Relationships page</Link> shows. A relationship can change over the story: open its details to add a stage from the chapter where it turns.
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- Details

const LINK_STATUSES = ['Active', 'Former', 'Secret'];

/** Abilities, possessions and affiliations: all of them records kept elsewhere (the Codex, Systems, the progression tracker), shown here and opened from here. */
export function DetailsExtras({ projectId, entry, profile, entries, links, nodes, order, onError }: Common & { links: LoreLink[] }) {
  const base = `/project/${projectId}`;
  const lore = codex.forProject(projectId);
  const api = characters.forProject(projectId);
  const systems = useLiveQuery(() => db.systems.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const sheets = useLiveQuery(() => db.systemSheets.where('projectId').equals(projectId).filter((sheet) => sheet.entryId === entry.id).toArray(), [projectId, entry.id]) ?? [];
  const snapshots = useLiveQuery(() => db.progressSnapshots.where('projectId').equals(projectId).filter((snapshot) => snapshot.entryId === entry.id).toArray(), [projectId, entry.id]) ?? [];
  const [linkTo, setLinkTo] = useState('');
  const [role, setRole] = useState('');
  const related = relatedTo(entry.id, entries, links).filter((r) => r.entry.category !== 'character');
  const of = (...categories: string[]) => related.filter((r) => categories.includes(r.entry.category));
  const others = related.filter((r) => !['power', 'item'].includes(r.entry.category));
  const linkable = entries.filter((e) => e.category !== 'character' && !related.some((r) => r.entry.id === e.id)).sort((a, b) => a.name.localeCompare(b.name));
  const inOrder = [...snapshots].sort((a, b) => (a.nodeId ? (order.position.get(a.nodeId) ?? 0) : -1) - (b.nodeId ? (order.position.get(b.nodeId) ?? 0) : -1));
  const latest = inOrder[inOrder.length - 1];
  const held = new Set((latest?.gear ?? []).map((g) => g.name.trim().toLowerCase()));
  const former = [...new Map(inOrder.slice(0, -1).flatMap((s) => s.gear).filter((g) => !held.has(g.name.trim().toLowerCase())).map((g) => [g.name.trim().toLowerCase(), g])).values()];
  const row = (r: (typeof related)[number], withStatus: boolean) => (
    <li key={r.linkId}>
      <Link to={entryPath(projectId, r.entry)}>{r.entry.name}</Link>
      <SavedText key={`${r.linkId}-label`} hideLabel label={`${entry.name}’s role or position in ${r.entry.name}`} value={r.label} placeholder="Role or position" onSave={(next) => void lore.labelLink(r.linkId, entry.id, next).catch(onError)} />
      {withStatus && (
        <select value={profile.linkStatus[r.linkId] ?? ''} aria-label={`Status of the tie to ${r.entry.name}`} onChange={(e) => void api.setLinkStatus(entry.id, r.linkId, e.target.value).catch(onError)}>
          <option value="">Status not set</option>
          {[...new Set([...LINK_STATUSES, profile.linkStatus[r.linkId] ?? ''].filter(Boolean))].map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      )}
      <button type="button" className="btn ghost icon" aria-label={`Remove the link to ${r.entry.name}`} onClick={() => void lore.unlink(r.linkId).catch(onError)}>
        ✕
      </button>
    </li>
  );

  return (
    <div className="vault-linked">
      <section className="vault-section wide" aria-label="Description">
        <header className="vault-section-head">
          <h3>Description</h3>
        </header>
        <SavedText hideLabel label="Description" multiline rows={5} value={entry.description} placeholder={`Who ${entry.name} is, at whatever length you like. Shown beside the page when you look them up while writing.`} onSave={(description) => void lore.update(entry.id, { description }).catch(onError)} />
      </section>
      <section className="vault-section" aria-label="Skills, powers and abilities">
        <header className="vault-section-head">
          <h3>Skills, powers &amp; abilities</h3>
        </header>
        {sheets.flatMap((sheet) => {
          const system = systems.find((s) => s.id === sheet.systemId);
          return system ? computeSheet(system, sheet).items.map(({ item, group }) => ({ key: `${sheet.id}-${item.id}`, name: item.name, group: group?.name ?? '', rank: rankName(system, item), description: (item as { description?: string }).description ?? '', system: system.name })) : [];
        }).map((ability) => (
          <div key={ability.key} className="vault-ability">
            <strong>{ability.name}</strong>
            <span className="muted small">{[ability.group, ability.rank, ability.system].filter(Boolean).join(' · ')}</span>
            {ability.description && <p className="small">{ability.description}</p>}
          </div>
        ))}
        {of('power').length > 0 && <ul className="vault-rows with-controls">{of('power').map((r) => row(r, false))}</ul>}
        {sheets.length === 0 && of('power').length === 0 && <p className="muted small">None recorded. Abilities are defined on a system and given to a character on their sheet (the System tab), or linked below from the Codex; they are shown here, not copied.</p>}
        {sheets.length > 0 && (
          <Link className="btn" to={`${base}/characters/${entry.id}/system`}>
            Open {entry.name}’s systems
          </Link>
        )}
      </section>

      <section className="vault-section" aria-label="Equipment and possessions">
        <header className="vault-section-head">
          <h3>Equipment &amp; possessions</h3>
        </header>
        {of('item').length > 0 && <ul className="vault-rows with-controls">{of('item').map((r) => row(r, true))}</ul>}
        {latest && latest.gear.length > 0 && (
          <>
            <p className="small">
              <strong>Held</strong> as of {latest.label || (latest.nodeId ? (nodes.find((n) => n.id === latest.nodeId)?.title ?? 'a chapter') : 'the start of the story')}:
            </p>
            <ul className="vault-rows">
              {latest.gear.map((gear) => {
                const item = entries.find((e) => e.id === gear.entryId);
                return (
                  <li key={gear.id}>
                    {item ? <Link to={entryPath(projectId, item)}>{gear.name}</Link> : gear.name}
                    <span className="muted small">{gear.kind}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {former.length > 0 && (
          <p className="small muted">
            <strong>No longer held</strong> (in an earlier snapshot, not the latest): {former.map((g) => g.name).join(', ')}.
          </p>
        )}
        {of('item').length === 0 && !latest?.gear.length && <p className="muted small">None recorded. Link an item from the Codex below, or record what they carry at a point in the story in the progression tracker.</p>}
      </section>

      <section className="vault-section" aria-label="Affiliations">
        <header className="vault-section-head">
          <h3>Affiliations &amp; links</h3>
        </header>
        {others.length === 0 ? <p className="muted small">Not linked to any faction, place or other entry yet.</p> : <ul className="vault-rows with-controls">{others.map((r) => row(r, true))}</ul>}
        {linkable.length > 0 && (
          <form
            className="vault-add-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!linkTo) return;
              void lore.link(entry.id, linkTo, role).then(() => {
                setLinkTo('');
                setRole('');
              }, onError);
            }}
          >
            <select value={linkTo} aria-label="Entry to link to" onChange={(e) => setLinkTo(e.target.value)}>
              <option value="">Link to a faction, item, place…</option>
              <EntryOptions entries={linkable} />
            </select>
            <input value={role} aria-label="Role or position there" placeholder="Role or position (e.g. Captain)" onChange={(e) => setRole(e.target.value)} />
            <button type="submit" className="btn primary" disabled={!linkTo}>
              Link
            </button>
          </form>
        )}
        <p className="muted small">Each link is one record in the Codex, seen from both ends: open the faction and {entry.name} is listed there too.</p>
      </section>
      <div className="vault-section wide vault-canon">
        <EntryProgression entry={entry} />
      </div>
      <div className="vault-section wide vault-canon">
        <EntryCanon entry={entry} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- Secrets

function SecretCard({ secret, ...common }: Common & { secret: CharacterSecret }) {
  const { projectId, entry, entries, nodes, order, onError } = common;
  const api = characters.forProject(projectId);
  const threads = useLiveQuery(() => db.plotThreads.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const events = useLiveQuery(() => db.timelineEvents.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const save = (changes: Parameters<typeof api.saveSecret>[2]) => void api.saveSecret(entry.id, secret.id, changes).catch(onError);
  const cast = entries.filter((e) => e.category === 'character').sort((a, b) => a.name.localeCompare(b.name)).map((e) => ({ id: e.id, name: e.name }));
  // Someone whose knowledge has a recorded history is kept in it, not in the lists.
  const recorded = new Set((secret.records ?? []).map((r) => r.characterId));
  const people = cast.filter((p) => p.id !== entry.id && !recorded.has(p.id));
  const withHistory = cast.filter((p) => p.id !== entry.id && recorded.has(p.id)).map((p) => p.name);
  const nameOf = (id: string) => entries.find((e) => e.id === id)?.name;
  const chapters = nodes.filter((n) => n.kind === 'chapter' || n.kind === 'scene').map((n) => ({ id: n.id, name: n.title }));
  const knowledge = (label: string, value: Knowledge, onChange: (value: Knowledge) => void) => (
    <label className="field">
      <span>{label}</span>
      <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value as Knowledge)}>
        {KNOWLEDGE.map((k) => (
          <option key={k} value={k}>
            {KNOWLEDGE_LABELS[k]}
          </option>
        ))}
      </select>
    </label>
  );
  const chapter = (label: string, value: string | null, onChange: (id: string | null) => void) => (
    <label className="field">
      <span>{label}</span>
      <select value={value ?? ''} aria-label={label} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Not set</option>
        <ChapterOptions nodes={nodes} order={order} />
      </select>
    </label>
  );
  return (
    <li className="vault-section secret" aria-label={`Secret: ${secret.title}`}>
      <header className="vault-section-head">
        <SavedText key={`${secret.id}-title`} hideLabel label="Secret title" value={secret.title} onSave={(title) => title.trim() && save({ title })} className="secret-title" />
        <select value={secret.status} aria-label="Status of the secret" onChange={(e) => save({ status: e.target.value })}>
          {[...new Set([...SECRET_STATUSES, secret.status])].map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <button type="button" className="btn ghost icon" aria-label={`Delete the secret ${secret.title}`} onClick={() => void api.removeSecret(secret.id).catch(onError)}>
          ✕
        </button>
      </header>
      <SavedText key={`${secret.id}-truth`} label="What is true" multiline rows={2} value={secret.description} placeholder="The fact itself, as it is in the story." onSave={(description) => save({ description })} />
      <div className="secret-grid">
        <fieldset className="secret-block">
          <legend>Who knows</legend>
          {recorded.has(entry.id) ? (
            <p className="field">
              <span>Does {entry.name} know?</span>
              <span>
                {AWARENESS_LABELS[currentOf(secret, entry.id).state!]} <span className="muted small">(from their records below)</span>
              </span>
            </p>
          ) : (
            knowledge(`Does ${entry.name} know?`, secret.self, (self) => save({ self }))
          )}
          <div className="field">
            <span>Characters who know</span>
            <Picker label="Characters who know" chosen={secret.knows} options={people} nameOf={nameOf} onChange={(knows) => save({ knows })} />
          </div>
          <div className="field">
            <span>Characters who suspect</span>
            <Picker label="Characters who suspect" chosen={secret.suspects} options={people} nameOf={nameOf} onChange={(suspects) => save({ suspects })} />
          </div>
          <div className="field">
            <span>Characters who are unaware</span>
            <Picker label="Characters who are unaware" chosen={secret.unaware} options={people} nameOf={nameOf} onChange={(unaware) => save({ unaware })} />
          </div>
          {withHistory.length > 0 && <p className="muted small">{withHistory.join(', ')} {withHistory.length === 1 ? 'has' : 'have'} a recorded history, kept under “How knowledge spreads”.</p>}
        </fieldset>
        <fieldset className="secret-block">
          <legend>The reader</legend>
          {knowledge('What the reader knows', secret.reader, (reader) => save({ reader }))}
          {chapter('…from this chapter on', secret.readerNodeId, (readerNodeId) => save({ readerNodeId }))}
        </fieldset>
        <fieldset className="secret-block">
          <legend>In the story</legend>
          {chapter('First appears', secret.firstNodeId, (firstNodeId) => save({ firstNodeId }))}
          {chapter('Revealed in', secret.revealNodeId, (revealNodeId) => save({ revealNodeId }))}
          {events.length > 0 && (
            <label className="field">
              <span>Reveal event</span>
              <select value={secret.revealEventId ?? ''} aria-label="Reveal event" onChange={(e) => save({ revealEventId: e.target.value || null })}>
                <option value="">Not set</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="field">
            <span>Related chapters</span>
            <Picker label="Related chapters" chosen={secret.nodeIds} options={chapters} nameOf={(id) => nodes.find((n) => n.id === id)?.title} onChange={(nodeIds) => save({ nodeIds })} />
          </div>
          {threads.length > 0 && (
            <div className="field">
              <span>Related plot threads</span>
              <Picker label="Related plot threads" chosen={secret.threadIds} options={threads.map((t) => ({ id: t.id, name: t.title }))} nameOf={(id) => threads.find((t) => t.id === id)?.title} onChange={(threadIds) => save({ threadIds })} />
            </div>
          )}
        </fieldset>
      </div>
      <KnowledgePanel projectId={projectId} secret={secret} people={cast} nodes={nodes} order={order} events={events} onError={onError} />
      <SavedText key={`${secret.id}-notes`} label="Private author notes" multiline rows={2} value={secret.notes} onSave={(notes) => save({ notes })} />
      {(secret.revealNodeId || secret.revealEventId || secret.nodeIds.length > 0 || secret.threadIds.length > 0) && (
        <p className="small secret-links">
          {secret.revealNodeId && nodes.some((n) => n.id === secret.revealNodeId) && <Link to={`/project/${projectId}/manuscript/${secret.revealNodeId}`}>Open the reveal chapter →</Link>}
          {secret.revealEventId && events.some((e) => e.id === secret.revealEventId) && <Link to={`/project/${projectId}/timeline?event=${secret.revealEventId}`}>Open the reveal event →</Link>}
          {secret.threadIds.filter((id) => threads.some((t) => t.id === id)).map((id) => (
            <Link key={id} to={`/project/${projectId}/plot?thread=${id}`}>
              {threads.find((t) => t.id === id)!.title} →
            </Link>
          ))}
        </p>
      )}
    </li>
  );
}

export function SecretsTab(common: Common) {
  const { projectId, entry, onError } = common;
  const api = characters.forProject(projectId);
  const secrets = useLiveQuery(() => api.secrets(entry.id), [projectId, entry.id]) ?? [];
  const [title, setTitle] = useState('');
  return (
    <div className="stack">
      <p className="muted small">
        What is true, what {entry.name} knows, what others know and what the reader knows are kept apart for each secret. This tab organises your story; it is not a lock. In a shared project, secrets are kept to the owner and co-authors by their role, not by being on this tab.
      </p>
      <form
        className="vault-add-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          void api.saveSecret(entry.id, null, { title }).then(() => setTitle(''), onError);
        }}
      >
        <input value={title} aria-label="Title of a new secret" placeholder="A new secret (e.g. Hidden parentage)" onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" className="btn primary" disabled={!title.trim()}>
          Add secret
        </button>
      </form>
      {secrets.length === 0 ? (
        <p className="muted">No secrets recorded.</p>
      ) : (
        <ul className="vault-stack" aria-label="Secrets">
          {secrets.map((secret) => (
            <SecretCard key={secret.id} {...common} secret={secret} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- Notes

function NoteCard({ note, ...common }: Common & { note: CharacterNote }) {
  const { projectId, entry, profile, nodes, onError } = common;
  const api = characters.forProject(projectId);
  const [copying, setCopying] = useState(false);
  const [sectionId, setSectionId] = useState(profile.sections[0]?.id ?? '');
  const [fieldName, setFieldName] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const save = (changes: Parameters<typeof api.saveNote>[2]) => void api.saveNote(entry.id, note.id, changes).catch(onError);
  return (
    <li className={`vault-section note${note.pinned ? ' pinned' : ''}`} aria-label={`Note: ${note.title}`}>
      <header className="vault-section-head">
        <SavedText key={`${note.id}-title`} hideLabel label="Note title" value={note.title} onSave={(title) => save({ title })} className="secret-title" />
        <button type="button" className="btn ghost" aria-pressed={note.pinned} onClick={() => save({ pinned: !note.pinned })}>
          {note.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button type="button" className="btn ghost icon" aria-label={`Delete the note ${note.title}`} onClick={() => void api.removeNote(note.id).catch(onError)}>
          ✕
        </button>
      </header>
      <SavedText key={`${note.id}-content`} hideLabel label="Note" multiline rows={3} value={note.content} onSave={(content) => save({ content })} />
      <div className="note-meta">
        <label className="field">
          <span>Tags (comma separated)</span>
          <input defaultValue={note.tags.join(', ')} aria-label="Note tags" onBlur={(e) => save({ tags: e.target.value.split(',') })} />
        </label>
        <div className="field">
          <span>About these chapters</span>
          <Picker label="Chapters this note is about" chosen={note.nodeIds} options={nodes.filter((n) => n.kind === 'chapter' || n.kind === 'scene').map((n) => ({ id: n.id, name: n.title }))} nameOf={(id) => nodes.find((n) => n.id === id)?.title} onChange={(nodeIds) => save({ nodeIds })} />
        </div>
      </div>
      {note.nodeIds.filter((id) => nodes.some((n) => n.id === id)).length > 0 && (
        <p className="small secret-links">
          {note.nodeIds.filter((id) => nodes.some((n) => n.id === id)).map((id) => (
            <Link key={id} to={`/project/${projectId}/manuscript/${id}`}>
              {nodes.find((n) => n.id === id)!.title} →
            </Link>
          ))}
        </p>
      )}
      <p className="muted small">
        Written {when(note.createdAt)} · last changed {when(note.updatedAt)}
      </p>
      {done && (
        <p className="small" role="status">
          {done}
        </p>
      )}
      {copying ? (
        <form
          className="vault-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            void api.promoteNote(note.id, sectionId, fieldName).then((field) => {
              setCopying(false);
              setFieldName('');
              setDone(`Copied into the profile as the field “${field.key}”. The note is kept.`);
            }, onError);
          }}
        >
          <select value={sectionId} aria-label="Section to copy the note into" onChange={(e) => setSectionId(e.target.value)}>
            {profile.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input value={fieldName} autoFocus aria-label="Name of the field to make" placeholder="Field name (e.g. Family)" onChange={(e) => setFieldName(e.target.value)} />
          <button type="submit" className="btn primary" disabled={!fieldName.trim() || !sectionId}>
            Yes, add it to the profile
          </button>
          <button type="button" className="btn ghost" onClick={() => setCopying(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="actions start">
          <button type="button" className="btn" onClick={() => setCopying(true)}>
            Copy into the profile…
          </button>
        </div>
      )}
    </li>
  );
}

export function NotesTab(common: Common) {
  const { projectId, entry, onError } = common;
  const api = characters.forProject(projectId);
  const notes = useLiveQuery(() => api.notes(entry.id), [projectId, entry.id]) ?? [];
  const [content, setContent] = useState('');
  const [tag, setTag] = useState('');
  const tags = [...new Set(notes.flatMap((n) => n.tags))].sort((a, b) => a.localeCompare(b));
  return (
    <div className="stack">
      <p className="muted small">Ideas, questions and reminders about {entry.name}. A note changes nothing about the character: it becomes part of their record only if you copy it there yourself.</p>
      {entry.notes.trim() && (
        <div className="notice" role="group" aria-label="Earlier note">
          <div className="stack tight grow">
            <strong>An earlier note, kept from before characters had their own notes</strong>
            <p className="pre-wrap small">{entry.notes}</p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() =>
              void api
                .saveNote(entry.id, null, { title: 'Earlier note', content: entry.notes })
                .then(() => codex.forProject(projectId).update(entry.id, { notes: '' }))
                .catch(onError)
            }
          >
            Keep as a note
          </button>
        </div>
      )}
      <form
        className="stack tight"
        onSubmit={(e) => {
          e.preventDefault();
          if (!content.trim()) return;
          void api.saveNote(entry.id, null, { content }).then(() => setContent(''), onError);
        }}
      >
        <textarea rows={2} value={content} aria-label="New note" placeholder="Maybe make Marcus the prince’s brother…" onChange={(e) => setContent(e.target.value)} />
        <div className="actions start">
          <button type="submit" className="btn primary" disabled={!content.trim()}>
            Add note
          </button>
          {tags.length > 0 && (
            <label className="inline">
              Show
              <select value={tag} aria-label="Show notes tagged" onChange={(e) => setTag(e.target.value)}>
                <option value="">All notes</option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </form>
      {notes.length === 0 ? (
        <p className="muted">No notes yet.</p>
      ) : (
        <ul className="vault-stack" aria-label="Notes">
          {notes.filter((n) => !tag || n.tags.includes(tag)).map((note) => (
            <NoteCard key={note.id} {...common} note={note} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- History

const RECORD_WORDS: Record<string, (label: string, from: string, to: string) => string> = {
  created: (label) => `Created the character “${label}”.`,
  field: (label, from, to) => (to === 'removed' ? `Removed the field ${label} (it said “${from}”).` : from ? (to ? `Changed ${label} from “${from}” to “${to}”.` : `Cleared ${label} (it said “${from}”).`) : `Set ${label} to “${to}”.`),
  identity: (label, from, to) => (from ? (to ? `Changed ${label} from “${from}” to “${to}”.` : `Cleared ${label} (it was “${from}”).`) : `Set ${label} to “${to}”.`),
  section: (label, _from, to) => `Section “${label}” ${to}.`,
  archived: () => 'Archived the character.',
  restored: () => 'Restored the character from the archive.',
  portrait: (label) => `Portrait ${label}.`,
  template: (label, _from, to) => `Applied the layout “${label}” (${to}).`,
  note: (label, _from, to) => `Added the field ${label}, ${to}.`,
};

/**
 * Two records, side by side and never mixed: what happens to the character
 * in the story, and what the author has done to the character's record.
 * Story lines come from what exists in the project (relationship stages,
 * timeline events, progression snapshots) and from milestones the author
 * writes here. Record lines are written when a change is made, from the
 * moment this feature was added; nothing is made up for earlier changes.
 */
export function HistoryTab({ projectId, entry, entries, nodes, order, onError }: Common) {
  const api = characters.forProject(projectId);
  const base = `/project/${projectId}`;
  const lines = useLiveQuery(() => api.history(entry.id), [projectId, entry.id]) ?? [];
  const { relations } = useRelationships(projectId);
  const events = useLiveQuery(() => db.timelineEvents.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const snapshots = useLiveQuery(() => db.progressSnapshots.where('projectId').equals(projectId).filter((snapshot) => snapshot.entryId === entry.id).toArray(), [projectId, entry.id]) ?? [];
  const changes = useLiveQuery(() => db.progressChanges.where('entryId').equals(entry.id).toArray(), [entry.id]) ?? [];
  const progressCategories = useLiveQuery(() => db.progressCategories.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const [text, setText] = useState('');
  const [nodeId, setNodeId] = useState('');
  const title = (id: string | null) => (id ? nodes.find((n) => n.id === id)?.title : undefined);
  const place = (id: string | null) => (id ? (order.position.get(id) ?? Number.MAX_SAFE_INTEGER) : -1);

  type StoryLine = { key: string; at: number; text: string; nodeId: string | null; to?: string; source: string; removable?: string };
  const story: StoryLine[] = [
    ...lines.filter((h) => h.kind === 'story').map((h) => ({ key: h.id, at: place(h.nodeId), text: h.text, nodeId: h.nodeId, source: 'Milestone', removable: h.id })),
    ...relations.filter((r) => r.fromId === entry.id || r.toId === entry.id).flatMap((relation) => {
      const other = entries.find((e) => e.id === (relation.fromId === entry.id ? relation.toId : relation.fromId));
      if (!other) return [];
      return sortedStages(relation, order).map((stage, i) => ({ key: `${relation.id}-${stage.id}`, at: place(stage.startNodeId), nodeId: stage.startNodeId, source: 'Relationship', to: `${base}/characters/${entry.id}/relationships?rel=${relation.id}`, text: `${i === 0 ? 'Relationship with' : 'Relationship changes with'} ${other.name}: ${stage.title || stage.label || 'related'} (${AFFINITY_LABELS[stage.affinity].toLowerCase()})${stage.event ? `. ${stage.event}` : ''}` }));
    }),
    ...events.filter((e) => e.characters.some((c) => c.id === entry.id)).map((event) => ({ key: event.id, at: event.nodeIds.length ? Math.min(...event.nodeIds.map(place)) : Number.MAX_SAFE_INTEGER - 1, nodeId: event.nodeIds[0] ?? null, source: 'Timeline event', to: `${base}/timeline?event=${event.id}`, text: event.name })),
    ...snapshots.map((snapshot) => ({ key: snapshot.id, at: place(snapshot.nodeId), nodeId: snapshot.nodeId, source: 'Progression snapshot', to: `${base}/progression?entry=${entry.id}&snap=${snapshot.id}`, text: snapshot.label || 'State recorded' })),
    // Progression changes, placed as this list places events: at a chapter, or at the first chapter an event is told in; with no time known, last.
    ...changes.filter((c) => c.projectId === projectId).map((change) => {
      const at = change.at;
      const event = at?.kind === 'event' ? events.find((e) => e.id === at.eventId) : undefined;
      const nodeId = at?.kind === 'node' ? at.nodeId : (event?.nodeIds[0] ?? null);
      const position = at === null ? -1 : at.kind === 'node' ? place(at.nodeId) : event?.nodeIds.length ? Math.min(...event.nodeIds.map(place)) : Number.MAX_SAFE_INTEGER;
      return { key: change.id, at: position, nodeId, source: 'Progression', to: `${base}/characters/${entry.id}/progression`, text: changeWords(change, progressCategories.find((c) => c.id === change.categoryId), { entries: new Map(entries.map((e) => [e.id, e])) }) };
    }),
  ].sort((a, b) => a.at - b.at);
  const record = lines.filter((h) => h.kind === 'record');

  return (
    <div className="vault-history">
      <IfViewOn view="history">
        <p className="small">
          <ViewLink to={`${base}/visualize/history?who=${entry.id}`}>{entry.name}’s whole life history</ViewLink>: every event with their age, where they were, what they belonged to, the chapters they appear in, and how their relationships and abilities change, gathered from the records where each is kept.
        </p>
      </IfViewOn>
      <section className="vault-section" aria-label="In the story">
        <header className="vault-section-head">
          <h3>In the story</h3>
        </header>
        <p className="muted small">What happens to {entry.name}, in story order. Lines from relationships, the timeline and the progression tracker belong to those features and open there.</p>
        <form
          className="vault-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void api.addMilestone(entry.id, text, nodeId || null).then(() => setText(''), onError);
          }}
        >
          <input value={text} aria-label="A milestone in the story" placeholder="Became commander of the guard" onChange={(e) => setText(e.target.value)} />
          <select value={nodeId} aria-label="Chapter of the milestone" onChange={(e) => setNodeId(e.target.value)}>
            <option value="">Before the story / not placed</option>
            <ChapterOptions nodes={nodes} order={order} />
          </select>
          <button type="submit" className="btn primary" disabled={!text.trim()}>
            Add milestone
          </button>
        </form>
        {story.length === 0 ? (
          <p className="muted">Nothing recorded yet.</p>
        ) : (
          <ol className="vault-timeline" aria-label="Story events">
            {story.map((line) => (
              <li key={line.key}>
                <span className="vault-when">{title(line.nodeId) ? <Link to={`${base}/manuscript/${line.nodeId}`}>{title(line.nodeId)}</Link> : line.at < 0 ? 'Before the story' : 'Not placed'}</span>
                <span>
                  {line.to ? <Link to={line.to}>{line.text}</Link> : line.text} <span className="badge">{line.source}</span>
                </span>
                {line.removable && (
                  <button type="button" className="btn ghost icon" aria-label={`Remove the milestone ${line.text}`} onClick={() => void api.removeMilestone(line.removable!).catch(onError)}>
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="vault-section" aria-label="Changes to the record">
        <header className="vault-section-head">
          <h3>Changes to the record</h3>
        </header>
        <p className="muted small">What you have done to this profile, newest first. Changes made before this history existed are not listed: nothing here is reconstructed.</p>
        {record.length === 0 ? (
          <p className="muted">No changes recorded yet.</p>
        ) : (
          <ol className="vault-timeline" aria-label="Record changes">
            {record.map((h) => (
              <li key={h.id}>
                <time className="vault-when">{when(h.at)}</time>
                <span>{(RECORD_WORDS[h.action] ?? ((label: string) => label))(h.label, h.from, h.to)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export { say };
