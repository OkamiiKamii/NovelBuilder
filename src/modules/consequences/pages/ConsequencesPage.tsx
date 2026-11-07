import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { consequences } from '@/core';
import { entryPath } from '@/modules/characters/hooks';
import { EntryOptions } from '@/modules/codex/categories';
import { buildTree, flatten } from '@/modules/manuscript/tree';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { KIND_LABELS, type Consequence, type Subject, type Target, type Tier } from '../analyze';

const TYPES = { node: 'A chapter or scene', event: 'A timeline event', beat: 'A thread development' } as const;
type SubjectType = keyof typeof TYPES;

const TIERS: Record<Tier, { heading: string; hint: string }> = {
  established: { heading: 'Established consequences', hint: 'Recorded in your project and tied to this exact point. If the point changes, these records are left hanging on it.' },
  potential: { heading: 'Potential consequences', hint: 'Possibilities, not facts: later parts of the story that involve the same people, places and threads. Each may or may not depend on this point.' },
};

/** Which findings the author has ticked off, kept on this device per analysis. */
function useLookedAt(storageKey: string): [Set<string>, (key: string, on: boolean) => void] {
  const read = (): string[] => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as string[];
    } catch {
      return [];
    }
  };
  const [state, setState] = useState<{ key: string; done: string[] }>(() => ({ key: storageKey, done: read() }));
  const done = state.key === storageKey ? state.done : read();
  if (state.key !== storageKey) setState({ key: storageKey, done });
  return [
    new Set(done),
    (key, on) => {
      const next = on ? [...new Set([...done, key])] : done.filter((k) => k !== key);
      setState({ key: storageKey, done: next });
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Private windows may refuse storage; the ticks then last for this visit only.
      }
    },
  ];
}

export function ConsequencesPage() {
  const project = useCurrentProject();
  const api = useMemo(() => consequences.forProject(project.id), [project.id]);
  const [params, setParams] = useSearchParams();
  const world = useLiveQuery(() => api.gather(), [api]);
  const [include, setInclude] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);

  const subject: Subject | null = params.get('node') ? { type: 'node', nodeId: params.get('node')! } : params.get('event') ? { type: 'event', eventId: params.get('event')! } : params.get('thread') && params.get('beat') ? { type: 'beat', threadId: params.get('thread')!, beatId: params.get('beat')! } : null;
  const subjectKey = subject ? JSON.stringify(subject) : '';
  const [type, setType] = useState<SubjectType>(subject?.type ?? 'node');
  const report = useLiveQuery(async () => (subject ? api.analyze(subject, { include, exclude }) : null), [api, subjectKey, include.join(), exclude.join()]);
  const [lookedAt, setLookedAt] = useLookedAt(`nb:consequences:${project.id}:${subjectKey}`);

  const choose = (next: Record<string, string>) => {
    setInclude([]);
    setExclude([]);
    setParams(params.get('what') ? { ...next, what: params.get('what')! } : next, { replace: true });
  };
  if (!world) return null;
  const base = `/project/${project.id}`;
  const tree = flatten(buildTree(world.nodes));
  const beats = world.threads.flatMap((thread) => thread.beats.map((beat) => ({ thread, beat }))).sort((a, b) => a.thread.title.localeCompare(b.thread.title));
  const current = subject?.type === 'node' ? subject.nodeId : subject?.type === 'event' ? subject.eventId : subject ? `${subject.threadId}|${subject.beatId}` : '';

  const linkTo = (target: Target): { to: string; state?: unknown; label: string } => {
    switch (target.type) {
      case 'node':
        return { to: `${base}/manuscript/${target.nodeId}`, state: target.block !== undefined ? { jump: { term: target.term ?? '', block: target.block } } : undefined, label: target.block !== undefined ? 'Open at this line' : 'Open chapter' };
      case 'entry':
        return { to: entryPath(project.id, world.entries.find((e) => e.id === target.entryId) ?? { id: target.entryId, category: '' }), label: 'Open profile' };
      case 'thread':
        return { to: `${base}/plot?thread=${target.threadId}`, label: 'Open thread' };
      case 'relation':
        return { to: `${base}/relationships?rel=${target.relationId}`, label: 'Open relationship' };
      case 'snapshot':
        return { to: `${base}/progression?entry=${target.entryId}&snap=${target.snapshotId}&view=edit`, label: 'Open snapshot' };
      case 'rule':
        return { to: `${base}/continuity?tab=tracked`, label: 'Open tracked rules' };
      case 'fact':
        return { to: `${base}/canon?fact=${target.factId}`, label: 'Open fact' };
      default:
        return { to: `${base}/timeline?event=${target.eventId}`, label: 'Open event' };
    }
  };

  const item = (c: Consequence) => {
    const link = linkTo(c.target);
    const at = c.match && c.excerpt ? c.excerpt.indexOf(c.match) : -1;
    return (
      <li key={c.key} className={`thread consequence cq-${c.tier}${lookedAt.has(c.key) ? ' looked' : ''}`}>
        <div className="thread-top">
          <span className="badge">{KIND_LABELS[c.kind]}</span>
          <span className="muted small cq-basis">{c.basis}</span>
          <label className="check">
            <input type="checkbox" checked={lookedAt.has(c.key)} aria-label={`Looked at: ${c.message}`} onChange={(e) => setLookedAt(c.key, e.target.checked)} />
            Looked at
          </label>
        </div>
        <p className="issue-message">{c.message}</p>
        {c.excerpt && (
          <blockquote className="issue-excerpt">
            {at === -1 ? c.excerpt : (
              <>
                {c.excerpt.slice(0, at)}
                <mark>{c.match}</mark>
                {c.excerpt.slice(at + c.match!.length)}
              </>
            )}
          </blockquote>
        )}
        <p className="small issue-links">
          <Link to={link.to} state={link.state}>
            {link.label}
          </Link>
          {c.entryIds.flatMap((id) => world.entries.find((e) => e.id === id) ?? []).filter((e) => !(c.target.type === 'entry' && c.target.entryId === e.id)).map((entry) => (
            <Link key={entry.id} to={entryPath(project.id, entry)}>
              {entry.name}
            </Link>
          ))}
        </p>
      </li>
    );
  };

  const chapters = report ? [...new Map([...report.established, ...report.potential].flatMap((c) => (c.nodeId && !report.anchorIds.includes(c.nodeId) ? [[c.nodeId, c] as const] : []))).values()] : [];
  const profiles = report ? [...new Set([...report.seeds.map((s) => s.id), ...[...report.established, ...report.potential].flatMap((c) => c.entryIds)])].flatMap((id) => world.entries.find((e) => e.id === id) ?? []).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const dropped = report ? report.suggested.filter((s) => exclude.includes(s.id)) : [];

  return (
    <div className="stack consequences-page">
      <header className="page-header">
        <div>
          <h1>Consequence analysis</h1>
          <p className="muted">What hangs on a point in your story, before you change it.</p>
        </div>
      </header>

      <section className="panel" aria-label="What is changing">
        <div className="toolbar">
          <span className="segmented wrap" role="radiogroup" aria-label="Kind of change">
            {(Object.keys(TYPES) as SubjectType[]).map((key) => (
              <button key={key} type="button" role="radio" aria-checked={type === key} className={type === key ? 'active' : ''} onClick={() => setType(key)}>
                {TYPES[key]}
              </button>
            ))}
          </span>
          {type === 'node' && (
            <select value={subject?.type === 'node' ? current : ''} aria-label="Chapter or scene to analyse" onChange={(e) => e.target.value && choose({ node: e.target.value })}>
              <option value="">Choose a chapter or scene…</option>
              {tree.map(({ node, depth }) => (
                <option key={node.id} value={node.id}>
                  {'  '.repeat(depth) + node.title}
                </option>
              ))}
            </select>
          )}
          {type === 'event' && (
            <select value={subject?.type === 'event' ? current : ''} aria-label="Event to analyse" onChange={(e) => e.target.value && choose({ event: e.target.value })}>
              <option value="">{world.events.length ? 'Choose an event…' : 'No timeline events yet'}</option>
              {[...world.events].sort((a, b) => a.name.localeCompare(b.name)).map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          )}
          {type === 'beat' && (
            <select value={subject?.type === 'beat' ? current : ''} aria-label="Development to analyse" onChange={(e) => {
              const [thread, beat] = e.target.value.split('|');
              if (thread && beat) choose({ thread, beat });
            }}>
              <option value="">{beats.length ? 'Choose a development…' : 'No thread developments yet'}</option>
              {beats.map(({ thread, beat }) => (
                <option key={beat.id} value={`${thread.id}|${beat.id}`}>
                  {thread.title}: {beat.title}
                </option>
              ))}
            </select>
          )}
        </div>
        <label className="field">
          <span>What would change? (for your own reference)</span>
          <input value={params.get('what') ?? ''} aria-label="What would change" placeholder="Alex decides NOT to join the Hero Association" onChange={(e) => setParams((p) => {
            const next = new URLSearchParams(p);
            if (e.target.value) next.set('what', e.target.value);
            else next.delete('what');
            return next;
          }, { replace: true })} />
        </label>
      </section>

      {!subject ? (
        <div className="empty">
          <h2>Pick the point you are thinking of changing</h2>
          <p className="muted">
            You will get two lists: what your project has recorded at that exact point, and what comes later that may lean on it. Nothing is changed; it is a map for your own rewrite.
          </p>
        </div>
      ) : !report ? null : !report.found ? (
        <p className="muted">That is no longer in the project. Choose something else to analyse.</p>
      ) : (
        <>
          <section className="panel cq-summary" aria-label="Impact summary">
            <h2>
              If {report.title} changes{params.get('what') ? <span className="muted">: {params.get('what')}</span> : ''}
            </h2>
            <p className="cq-line" role="status">
              <strong>Impact summary:</strong> {report.summaryLine}
            </p>
            <p className="muted small">
              {report.established.length} established · {report.potential.length} potential · {report.downstream} {report.downstream === 1 ? 'chapter or scene' : 'chapters and scenes'} read downstream
            </p>
            <div className="field">
              <span>Taken to involve</span>
              <ul className="entity-chips" aria-label="Taken to involve">
                {report.seeds.map((entry) => (
                  <li key={entry.id} className={`cat-${entry.category}`}>
                    <Link to={entryPath(project.id, entry)} className="chip-name">
                      {entry.name}
                    </Link>
                    <button type="button" aria-label={`Leave out ${entry.name}`} onClick={() => (include.includes(entry.id) ? setInclude(include.filter((id) => id !== entry.id)) : setExclude([...exclude, entry.id]))}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              <div className="toolbar">
                <select value="" aria-label="Also involves" onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  setExclude(exclude.filter((x) => x !== id));
                  if (!report.suggested.some((s) => s.id === id)) setInclude([...include, id]);
                }}>
                  <option value="">Also involves…</option>
                  <EntryOptions entries={world.entries.filter((e) => !report.seeds.some((s) => s.id === e.id))} />
                </select>
                {dropped.length > 0 && <span className="muted small">Left out: {dropped.map((d) => d.name).join(', ')}</span>}
              </div>
              <span className="muted small">Later chapters, threads and records are searched for these. Add anyone the change would touch who is not named at this point.</span>
            </div>
          </section>

          {(['established', 'potential'] as Tier[]).map((tier) => (
            <section key={tier} className={`stack cq-tier cq-${tier}`} aria-label={TIERS[tier].heading}>
              <h2>
                {TIERS[tier].heading} <span className="muted">{report[tier].length}</span>
              </h2>
              <p className="muted small">{TIERS[tier].hint}</p>
              {report[tier].length === 0 ? <p className="muted">{tier === 'established' ? 'Nothing is recorded at this exact point.' : 'Nothing later in the story involves the same people, places or threads.'}</p> : <ul className="threads">{report[tier].map(item)}</ul>}
            </section>
          ))}

          <section className="panel" aria-label="Affected chapters and profiles">
            <h2>Where to look</h2>
            <div className="grid-2">
              <div>
                <h3 className="small muted">Chapters and scenes ({chapters.length})</h3>
                <ul className="cq-where">
                  {chapters.map((c) => {
                    const link = linkTo(c.target.type === 'node' ? c.target : { type: 'node', nodeId: c.nodeId! });
                    return (
                      <li key={c.nodeId}>
                        <Link to={link.to} state={link.state}>
                          {world.nodes.find((n) => n.id === c.nodeId)?.title}
                        </Link>
                      </li>
                    );
                  })}
                  {chapters.length === 0 && <li className="muted small">None</li>}
                </ul>
              </div>
              <div>
                <h3 className="small muted">Codex profiles ({profiles.length})</h3>
                <ul className="cq-where">
                  {profiles.map((entry) => (
                    <li key={entry.id}>
                      <Link to={entryPath(project.id, entry)}>{entry.name}</Link>
                    </li>
                  ))}
                  {profiles.length === 0 && <li className="muted small">None</li>}
                </ul>
              </div>
            </div>
          </section>
          <p className="muted small">This analysis only reads. It never changes your manuscript or your records, and a potential consequence is never treated as canon. “Looked at” ticks are kept on this device.</p>
        </>
      )}
    </div>
  );
}
