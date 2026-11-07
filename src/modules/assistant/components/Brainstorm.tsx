import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { assistant, codex, manuscript, plot } from '@/core';
import { EntryOptions, useCategories } from '@/modules/codex/categories';
import { buildTree, flatten, isDocument } from '@/modules/manuscript/tree';
import { mentionedIn } from '../context';
import type { AssistantRequest } from '../prompt';
import { AssistantError, askClaude, manualPrompt, useAssistantSettings } from '../providers';
import { KIND_HINTS, KIND_LABELS, MODES, MODE_HINTS, MODE_LABELS, ROUTE_LABELS, type Brainstorm as Session, type BrainstormItem, type BrainstormMode, type Fact, type RouteKind, type RouteTarget } from '../types';

const ROUTES: RouteKind[] = ['ideas', 'thread', 'world', 'character'];

/**
 * The brainstorming workspace. Everything the assistant says stays in this
 * panel: an idea reaches the project only through one of the buttons under
 * it, pressed by the author.
 */
export function Brainstorm({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
  const api = useMemo(() => assistant.forProject(projectId), [projectId]);
  const settings = useAssistantSettings();
  const categories = useCategories();
  const entries = useLiveQuery(() => codex.forProject(projectId).list(), [projectId]);
  const threads = useLiveQuery(() => plot.forProject(projectId).list(), [projectId]);
  const nodes = useLiveQuery(() => manuscript.forProject(projectId).list(), [projectId]);
  const sessions = useLiveQuery(() => api.list(), [api]);

  const [mode, setMode] = useState<BrainstormMode>('plot');
  const [prompt, setPrompt] = useState('');
  const [entryIds, setEntryIds] = useState<string[]>([]);
  const [threadIds, setThreadIds] = useState<string[]>([]);
  const [nodeIds, setNodeIds] = useState<string[]>([]);
  const [prepared, setPrepared] = useState<{ facts: Fact[]; request: AssistantRequest } | null>(null);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [routing, setRouting] = useState<{ itemId: string; kind: RouteKind; target: string; name: string; category: string } | null>(null);
  const abort = useRef<AbortController | null>(null);

  // What would be sent is worked out as the author builds the question, so it can always be read first.
  const attachedKey = [mode, prompt, entryIds.join(), threadIds.join(), nodeIds.join()].join('|');
  useEffect(() => {
    let alive = true;
    void api.prepare(mode, prompt, { entryIds, threadIds, nodeIds }).then((next) => alive && setPrepared(next));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, attachedKey, entries, threads, nodes]);

  if (!entries || !threads || !nodes || !sessions) return null;
  const fail = (err: unknown) => setNotice({ text: err instanceof Error ? err.message : 'Something went wrong.', error: true });
  const base = `/project/${projectId}`;
  const documents = flatten(buildTree(nodes)).filter((t) => isDocument(t.node.kind));
  const history = [...sessions].sort((a, b) => b.createdAt - a.createdAt);
  const session: Session | null = history.find((s) => s.id === openId) ?? history[0] ?? null;
  const suggested = mentionedIn(prompt, entries).filter((e) => !entryIds.includes(e.id));
  const attached = { entryIds, threadIds, nodeIds };

  const keep = async (answer: unknown, model: string) => {
    if (!prepared) return;
    const made = await api.record({ mode, prompt, attached, facts: prepared.facts, answer, model });
    setOpenId(made.id);
    setPasted('');
    setNotice(null);
  };
  const ask = async () => {
    if (!prepared) return;
    setBusy(true);
    setNotice(null);
    abort.current = new AbortController();
    try {
      await keep(await askClaude(prepared.request, settings, fetch, abort.current.signal), settings.model);
    } catch (err) {
      if (!(err instanceof AssistantError && err.message === 'Stopped.')) fail(err);
    } finally {
      setBusy(false);
    }
  };

  const sourceLink = (fact: Fact): string => {
    const { type, id } = fact.source;
    if (type === 'entry') return `${base}/codex/${id}`;
    if (type === 'thread') return `${base}/plot?thread=${id}`;
    if (type === 'event') return `${base}/timeline?event=${id}`;
    if (type === 'canon') return `${base}/canon?fact=${id}`;
    if (type === 'relation') return `${base}/relationships?rel=${id}`;
    if (type === 'chapter') return `${base}/manuscript/${id}`;
    return `${base}/characters/systems`;
  };

  const startRoute = (item: BrainstormItem, kind: RouteKind) => {
    if (kind === 'ideas') return void api.route(session!.id, item.id, { kind: 'ideas' }).catch(fail);
    const first = kind === 'thread' ? threads[0]?.id : entries.find((e) => (kind === 'character') === (e.category === 'character'))?.id;
    setRouting({ itemId: item.id, kind, target: first ?? 'new', name: item.title, category: categories.list.find((c) => c.key !== 'character' && !c.archived)?.key ?? 'lore' });
  };
  const confirmRoute = () => {
    if (!routing || !session) return;
    const target: RouteTarget =
      routing.kind === 'thread' ? (routing.target === 'new' ? { kind: 'thread', newTitle: routing.name } : { kind: 'thread', threadId: routing.target })
      : routing.target === 'new' ? { kind: routing.kind as 'world' | 'character', newName: routing.name, category: routing.kind === 'character' ? 'character' : routing.category }
      : { kind: routing.kind as 'world' | 'character', entryId: routing.target };
    void api.route(session.id, routing.itemId, target).then(() => setRouting(null), fail);
  };

  const chip = (key: string, label: string, to: string, onRemove: () => void) => (
    <li key={key}>
      <Link to={to} className="chip-name">
        {label}
      </Link>
      <button type="button" aria-label={`Detach ${label}`} onClick={onRemove}>
        ✕
      </button>
    </li>
  );

  return (
    <div className={`stack brainstorm${compact ? ' compact' : ''}`}>
      <div className="segmented wrap" role="radiogroup" aria-label="Brainstorming mode">
        {MODES.map((key) => (
          <button key={key} type="button" role="radio" aria-checked={mode === key} className={mode === key ? 'active' : ''} title={MODE_HINTS[key]} onClick={() => setMode(key)}>
            {MODE_LABELS[key]}
          </button>
        ))}
      </div>
      <p className="muted small">{MODE_HINTS[mode]}</p>
      <label className="field">
        <span>What do you want to think about?</span>
        <textarea rows={compact ? 2 : 3} value={prompt} aria-label="Brainstorm question" placeholder="How could Alex get past the barrier without anyone seeing?" onChange={(e) => setPrompt(e.target.value)} />
      </label>

      <div className="field">
        <span>Attached from your project</span>
        {entryIds.length + threadIds.length + nodeIds.length > 0 && (
          <ul className="entity-chips" aria-label="Attached">
            {entryIds.flatMap((id) => entries.find((e) => e.id === id) ?? []).map((e) => chip(e.id, e.name, `${base}/codex/${e.id}`, () => setEntryIds(entryIds.filter((x) => x !== e.id))))}
            {threadIds.flatMap((id) => threads.find((t) => t.id === id) ?? []).map((t) => chip(t.id, `Thread: ${t.title}`, `${base}/plot?thread=${t.id}`, () => setThreadIds(threadIds.filter((x) => x !== t.id))))}
            {nodeIds.flatMap((id) => nodes.find((n) => n.id === id) ?? []).map((n) => chip(n.id, `Plan: ${n.title}`, `${base}/manuscript/${n.id}`, () => setNodeIds(nodeIds.filter((x) => x !== n.id))))}
          </ul>
        )}
        {suggested.length > 0 && (
          <div className="actions start wrap">
            <span className="muted small">You mention:</span>
            {suggested.map((entry) => (
              <button key={entry.id} type="button" className="badge reason" onClick={() => setEntryIds([...entryIds, entry.id])}>
                + {entry.name}
              </button>
            ))}
          </div>
        )}
        <div className="toolbar">
          <select value="" aria-label="Attach a codex entry" onChange={(e) => e.target.value && setEntryIds([...entryIds, e.target.value])}>
            <option value="">Attach a character or entry…</option>
            <EntryOptions entries={entries.filter((e) => !entryIds.includes(e.id))} />
          </select>
          {threads.length > 0 && (
            <select value="" aria-label="Attach a plot thread" onChange={(e) => e.target.value && setThreadIds([...threadIds, e.target.value])}>
              <option value="">Attach a plot thread…</option>
              {threads.filter((t) => !threadIds.includes(t.id)).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
          {documents.length > 0 && (
            <select value="" aria-label="Attach a chapter's plan" onChange={(e) => e.target.value && setNodeIds([...nodeIds, e.target.value])}>
              <option value="">Attach a chapter’s plan…</option>
              {documents.filter((t) => !nodeIds.includes(t.node.id)).map(({ node, depth }) => (
                <option key={node.id} value={node.id}>
                  {'  '.repeat(depth) + node.title}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <details className="sent-preview">
        <summary>
          What the assistant will be given: {prepared?.facts.length ?? 0} {prepared?.facts.length === 1 ? 'fact' : 'facts'} from your project
        </summary>
        <p className="muted small">
          Only this, your question and the instructions below are {settings.provider === 'claude' ? 'sent, to Anthropic, when you press Brainstorm' : 'in the text you copy; the app itself sends nothing'}. Your manuscript's text and your private notes are never included.
        </p>
        <ol className="fact-list" aria-label="Facts to be given">
          {(prepared?.facts ?? []).map((fact) => (
            <li key={fact.id}>
              <span className="beat-at">{fact.id}</span>
              <span className="muted small">{fact.label}</span> {fact.text}
            </li>
          ))}
        </ol>
        {prepared && <pre className="sent-text" aria-label="Full request">{manualPrompt(prepared.request)}</pre>}
      </details>

      {settings.provider === 'claude' ? (
        <div className="actions start wrap">
          <button type="button" className="btn primary" disabled={busy || !settings.apiKey || !prepared} onClick={() => void ask()}>
            {busy ? 'Thinking…' : 'Brainstorm'}
          </button>
          {busy && (
            <button type="button" className="btn" onClick={() => abort.current?.abort()}>
              Stop
            </button>
          )}
          {!settings.apiKey && (
            <span className="muted small">
              Add your API key in the <Link to={`${base}/assistant?tab=settings`}>assistant’s settings</Link> first.
            </span>
          )}
        </div>
      ) : (
        <div className="stack manual">
          <div className="actions start wrap">
            <button type="button" className="btn primary" disabled={!prepared} onClick={() => prepared && void navigator.clipboard.writeText(manualPrompt(prepared.request)).then(() => setNotice({ text: 'Copied. Paste it into the assistant you use, then paste its reply below.' }), () => setNotice({ text: 'Could not copy. Open “What the assistant will be given” and copy the text from there.', error: true }))}>
              Copy the question
            </button>
            <span className="muted small">
              No assistant is connected. <Link to={`${base}/assistant?tab=settings`}>Connect Claude</Link>, or paste a reply from any assistant:
            </span>
          </div>
          <textarea rows={3} value={pasted} aria-label="Pasted answer" placeholder="Paste the assistant’s reply here" onChange={(e) => setPasted(e.target.value)} />
          <div className="actions start">
            <button type="button" className="btn" disabled={!pasted.trim() || !prepared} onClick={() => void keep(pasted, 'pasted').catch(fail)}>
              Read the answer
            </button>
          </div>
        </div>
      )}

      {notice && (
        <p className={notice.error ? 'notice error' : 'notice'} role={notice.error ? 'alert' : 'status'}>
          {notice.text}
          <button type="button" className="btn ghost icon" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}

      {session && (
        <section className="stack brainstorm-result" aria-label="Brainstorm">
          <div className="toolbar">
            <select value={session.id} aria-label="Earlier brainstorms" onChange={(e) => setOpenId(e.target.value)}>
              {history.map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {MODE_LABELS[s.mode]} · {s.prompt.slice(0, 50) || 'No question'}
                </option>
              ))}
            </select>
            <button type="button" className="btn ghost" onClick={() => void api.remove(session.id).then(() => setOpenId(null), fail)}>
              Delete this brainstorm
            </button>
          </div>
          <ul className="epistemic-key" aria-label="Key">
            {(['established', 'suggestion', 'assumption'] as const).map((kind) => (
              <li key={kind} className={`ek-${kind}`}>
                <strong>{KIND_LABELS[kind]}</strong> <span className="muted small">{KIND_HINTS[kind]}</span>
              </li>
            ))}
          </ul>
          <ol className="brainstorm-items">
            {session.items.map((item) => {
              const facts = item.factIds.flatMap((id) => session.facts.find((f) => f.id === id) ?? []);
              return (
                <li key={item.id} className={`bi bi-${item.kind} bi-${item.status}`} data-kind={item.kind}>
                  <span className={`bi-tag ek-${item.kind}`}>{KIND_LABELS[item.kind]}</span>
                  {item.kind === 'established' ? (
                    <p>
                      {item.text}{' '}
                      {facts[0] && (
                        <Link to={sourceLink(facts[0])} className="small">
                          {item.title}
                        </Link>
                      )}
                    </p>
                  ) : (
                    <p>
                      {item.title && <strong>{item.title}. </strong>}
                      {item.text}
                    </p>
                  )}
                  {item.note && <p className="muted small">{item.note}</p>}
                  {item.kind === 'suggestion' && facts.length > 0 && (
                    <p className="muted small">
                      Builds on:{' '}
                      {facts.map((fact) => (
                        <Link key={fact.id} to={sourceLink(fact)} title={fact.text} className="bi-fact">
                          {fact.label}
                        </Link>
                      ))}
                    </p>
                  )}
                  {item.kind === 'suggestion' && item.status === 'open' && (
                    <div className="actions start wrap" role="group" aria-label={`What to do with: ${item.title || item.text.slice(0, 40)}`}>
                      {[...ROUTES].sort((a, b) => Number(b === item.fits) - Number(a === item.fits)).map((kind) => (
                        <button key={kind} type="button" className="btn" onClick={() => startRoute(item, kind)}>
                          + {ROUTE_LABELS[kind]}
                        </button>
                      ))}
                      <button type="button" className="btn ghost" onClick={() => void api.discard(session.id, item.id).catch(fail)}>
                        Discard
                      </button>
                    </div>
                  )}
                  {routing?.itemId === item.id && (
                    <form
                      className="plan-group"
                      onSubmit={(e) => {
                        e.preventDefault();
                        confirmRoute();
                      }}
                    >
                      <label className="field">
                        <span>{routing.kind === 'thread' ? 'Which plot thread?' : routing.kind === 'character' ? 'Which character?' : 'Which entry?'}</span>
                        <select value={routing.target} aria-label="Where to add it" onChange={(e) => setRouting({ ...routing, target: e.target.value })}>
                          {routing.kind === 'thread'
                            ? threads.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.title}
                                </option>
                              ))
                            : <EntryOptions entries={entries.filter((e) => (routing.kind === 'character') === (e.category === 'character'))} />}
                          <option value="new">{routing.kind === 'thread' ? 'A new plot thread…' : routing.kind === 'character' ? 'A new character…' : 'A new entry…'}</option>
                        </select>
                      </label>
                      {routing.target === 'new' && (
                        <div className="grid-2 tight">
                          <label className="field">
                            <span>Name</span>
                            <input value={routing.name} aria-label="Name for the new one" onChange={(e) => setRouting({ ...routing, name: e.target.value })} />
                          </label>
                          {routing.kind === 'world' && (
                            <label className="field">
                              <span>Category</span>
                              <select value={routing.category} aria-label="Category for the new entry" onChange={(e) => setRouting({ ...routing, category: e.target.value })}>
                                {categories.list.filter((c) => c.key !== 'character' && !c.archived).map((c) => (
                                  <option key={c.key} value={c.key}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                      )}
                      <p className="muted small">It is added to the {routing.kind === 'thread' ? 'thread’s' : 'entry’s'} notes as an idea. Nothing else there is changed.</p>
                      <div className="actions">
                        <button type="button" className="btn" onClick={() => setRouting(null)}>
                          Cancel
                        </button>
                        <button type="submit" className="btn primary">
                          Add it
                        </button>
                      </div>
                    </form>
                  )}
                  {item.status === 'added' && item.added && (
                    <p className="small bi-where">
                      Added to <Link to={item.added.to}>{item.added.label}</Link>
                    </p>
                  )}
                  {item.status === 'discarded' && (
                    <p className="muted small">
                      Discarded.{' '}
                      <button type="button" className="link" onClick={() => void api.restore(session.id, item.id).catch(fail)}>
                        Bring back
                      </button>
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="muted small">Asked of {session.model === 'pasted' ? 'an assistant of your choice (pasted)' : session.model}. Suggestions are not part of your story until you add them, and then only as notes.</p>
        </section>
      )}
    </div>
  );
}
