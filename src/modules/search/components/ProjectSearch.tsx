import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { search as searchService } from '@/core';
import { useCategories } from '@/modules/codex/categories';
import { isGroup } from '@/modules/manuscript/tree';
import { KIND_LABELS, type NodeKind } from '@/modules/manuscript/types';
import { useCategoryModules } from '@/modules/extensions/hooks';
import { MIN_QUERY_LENGTH } from '../query';
import type { SyncProgress } from '../service';
import type { EntityResult, SearchEngine, SearchField, SearchGroup, SearchScope, Snippet } from '../types';

const SCOPES: { value: SearchScope; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'manuscript', label: 'Manuscript' },
  { value: 'codex', label: 'Codex' },
  { value: 'notes', label: 'Notes' },
];
const FIELD_LABELS: Record<SearchField, string> = { title: 'Title', heading: 'Heading', body: '', summary: 'Summary', notes: 'Notes', plan: '', name: 'Name', description: 'Description', tags: 'Tags', attribute: '' };
const PAGE = 15;
const DEBOUNCE = 120;


/** What a search result asks its destination to do on arrival. */
export interface SearchArrival {
  /** Highlight this text in paragraph number `block` of the opened chapter or scene. */
  jump?: { term: string; block: number };
  /** Open the editor's side panel on this tab. */
  panel?: 'notes';
  /** Select this item in the organizer. */
  select?: string;
  /** Scroll to the first place this codex entry is linked in the opened chapter or scene. */
  mention?: string;
}

/** Where a result leads: the exact paragraph, the notes panel, the organizer row or the codex profile. */
export function destination(projectId: string, item: EntityResult, snippet?: Snippet): { to: string; state?: SearchArrival } {
  const base = `/project/${projectId}`;
  // A character opens in their profile; every other entry in the Codex. Either way it is the one record.
  if (item.entityType === 'entry') return { to: `${base}/${item.kind === 'character' ? 'characters' : 'codex'}/${item.entityId}` };
  if (isGroup(item.kind as NodeKind)) return { to: `${base}/organizer`, state: { select: item.entityId } };
  const to = `${base}/manuscript/${item.entityId}`;
  if (item.group === 'notes') return { to, state: { panel: 'notes' } };
  if (snippet && (snippet.field === 'body' || snippet.field === 'heading') && snippet.term) return { to, state: { jump: { term: snippet.term, block: snippet.index } } };
  return { to };
}

export function ProjectSearch({ projectId, projectTitle, onClose }: { projectId: string; projectTitle: string; onClose: () => void }) {
  const navigate = useNavigate();
  const categories = useCategories();
  // A record made with a module says so: "Spells & Techniques · Fantasy".
  const moduleOf = useCategoryModules(projectId);
  const groupLabel = (group: SearchGroup): string => (group === 'manuscript' ? 'Manuscript' : group === 'notes' ? 'Notes & summaries' : categories.get(group).name);
  const kindLabel = (item: EntityResult): string => (item.entityType === 'node' ? KIND_LABELS[item.kind as NodeKind] : categories.get(item.kind).singular);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [settled, setSettled] = useState('');
  const [scope, setScope] = useState<SearchScope>('all');
  const [engine, setEngine] = useState<SearchEngine | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<SearchGroup>>(new Set());

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  // Bring the index up to date each time search opens; only changed chapters and entries are re-read.
  useEffect(() => {
    let alive = true;
    searchService
      .forProject(projectId)
      .open((p) => alive && setProgress(p))
      .then(
        (ready) => alive && setEngine(ready),
        () => alive && setFailed(true),
      );
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Search runs once typing pauses, not on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(query);
      setExpanded(new Set());
    }, DEBOUNCE);
    return () => clearTimeout(timer);
  }, [query]);

  const { groups, ms } = useMemo(() => {
    if (!engine) return { groups: [], ms: 0 };
    const start = performance.now();
    const found = engine.search(settled, scope);
    return { groups: found, ms: performance.now() - start };
  }, [engine, settled, scope]);

  const total = groups.reduce((n, g) => n + g.matchCount, 0);
  const ready = settled.trim().length >= MIN_QUERY_LENGTH;

  const go = (item: EntityResult, snippet?: Snippet) => {
    const { to, state } = destination(projectId, item, snippet);
    onClose();
    navigate(to, { state });
  };

  /** Arrow keys walk the results; from the first result, Up returns to the box. */
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // One press always closes (a search box would otherwise just clear itself first).
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const hits = [...(dialog.current?.querySelectorAll<HTMLElement>('.search-hit') ?? [])];
    const at = hits.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? at + 1 : at - 1;
    e.preventDefault();
    if (next < 0) input.current?.focus();
    else hits[Math.min(next, hits.length - 1)]?.focus();
  };

  return (
    <dialog
      ref={dialog}
      className="search-dialog"
      aria-label="Search this project"
      onClose={onClose}
      onKeyDown={onKeyDown}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <header className="search-head">
        <div className="search-box">
          <input
            ref={input}
            type="search"
            value={query}
            autoFocus
            placeholder={`Search ${projectTitle}…`}
            aria-label="Search this project"
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="search-scope">
          <div className="segmented" role="group" aria-label="Search in">
            {SCOPES.map(({ value, label }) => (
              <button key={value} type="button" className={scope === value ? 'active' : ''} aria-pressed={scope === value} onClick={() => setScope(value)}>
                {label}
              </button>
            ))}
          </div>
          <span className="muted small" role="status">
            {failed
              ? 'Search could not read this project.'
              : !engine
                ? progress
                  ? `Indexing ${progress.done} of ${progress.total}…`
                  : 'Preparing…'
                : ready
                  ? `${total} ${total === 1 ? 'match' : 'matches'} · ${ms < 1 ? '<1' : Math.round(ms)} ms`
                  : ''}
          </span>
        </div>
      </header>

      <div className="search-results">
        {!ready ? (
          <p className="search-empty muted">Search every chapter, scene, character, codex entry, note, summary and tag in this project. Type at least two characters.</p>
        ) : engine && groups.length === 0 ? (
          <p className="search-empty muted">
            Nothing matches “{settled.trim()}”{scope === 'all' ? '' : ` in ${SCOPES.find((s) => s.value === scope)!.label.toLowerCase()}`}.
          </p>
        ) : (
          groups.map((group) => {
            const shown = expanded.has(group.group) ? group.items : group.items.slice(0, PAGE);
            return (
              <section key={group.group} className="search-group" aria-label={groupLabel(group.group)}>
                <h3>
                  {groupLabel(group.group)}
                  {moduleOf.get(group.group) && <span className="badge search-module">{moduleOf.get(group.group)!.join(', ')}</span>}
                  <span className="muted small">
                    {group.matchCount} {group.matchCount === 1 ? 'match' : 'matches'}
                    {group.items.length > 1 && ` in ${group.items.length} places`}
                  </span>
                </h3>
                {shown.map((item) => (
                  <article key={`${item.entityId}|${item.group}`} className="search-item">
                    <button type="button" className="search-hit search-entity" onClick={() => go(item)}>
                      <strong>{item.title}</strong>
                      <span className={item.entityType === 'node' ? `kind kind-${item.kind}` : 'cat'} style={item.entityType === 'entry' ? ({ '--cat': categories.get(item.kind).color } as React.CSSProperties) : undefined}>
                        {kindLabel(item)}
                      </span>
                    </button>
                    {item.snippets.map((snippet) => (
                      <button key={snippet.blockId} type="button" className="search-hit search-snippet" onClick={() => go(item, snippet)}>
                        {(snippet.label || FIELD_LABELS[snippet.field]) && <span className="badge">{snippet.label || FIELD_LABELS[snippet.field]}</span>}
                        <span>
                          {snippet.before && <span className="context">{snippet.before} </span>}
                          {snippet.parts.map((part, i) => (part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}
                          {snippet.after && <span className="context"> {snippet.after}</span>}
                        </span>
                      </button>
                    ))}
                    {item.matchCount > item.snippets.length && (
                      <p className="muted small search-more">
                        + {item.matchCount - item.snippets.length} more in this {kindLabel(item).toLowerCase()}
                      </p>
                    )}
                  </article>
                ))}
                {group.items.length > shown.length && (
                  <button type="button" className="btn ghost" onClick={() => setExpanded(new Set([...expanded, group.group]))}>
                    Show all {group.items.length}
                  </button>
                )}
              </section>
            );
          })
        )}
      </div>
    </dialog>
  );
}
