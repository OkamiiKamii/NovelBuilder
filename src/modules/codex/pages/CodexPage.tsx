import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { codex as codexService } from '@/core';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { CategoryBadge, EntryThumb } from '../components/EntryBits';
import { EntryEditor } from '../components/EntryEditor';
import { matchesEntry, useCodex } from '../hooks';
import { useCategories } from '../categories';
import { SchemaDialog } from '../components/SchemaDialog';
import type { LoreCategory } from '../types';

/**
 * The world's reference book: places, factions, items, powers and lore.
 * Characters are not kept here; they have the Character Library. They can
 * still be linked to from an entry (an item to its owner), and an old link to
 * a character's codex page opens their profile.
 */
export function CodexPage() {
  const project = useCurrentProject();
  const { entryId } = useParams();
  const navigate = useNavigate();
  // Bound to this project: nothing here can address another project's entries.
  const codex = useMemo(() => codexService.forProject(project.id), [project.id]);
  const { entries, links } = useCodex(codex);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<LoreCategory | 'all'>('all');
  const [tag, setTag] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [customizing, setCustomizing] = useState<string | null>(null);
  const everything = useCategories();
  const categories = useMemo(() => ({ ...everything, list: everything.list.filter((c) => c.key !== 'character') }), [everything]);

  const all = useMemo(() => (entries ?? []).filter((e) => e.category !== 'character'), [entries]);
  const base = `/project/${project.id}/codex`;
  const hrefFor = (id: string) => `${base}/${id}`;
  const selected = all.find((e) => e.id === entryId);
  const tags = useMemo(() => [...new Set(all.flatMap((e) => e.tags))].sort((a, b) => a.localeCompare(b)), [all]);
  const activeTag = tags.includes(tag) ? tag : 'all';
  const fail = (err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.');

  const visible = all
    .filter((e) => (category === 'all' || e.category === category) && (activeTag === 'all' || e.tags.includes(activeTag)) && matchesEntry(e, query))
    .sort((a, b) => a.name.localeCompare(b.name));
  const count = (c: LoreCategory) => all.filter((e) => e.category === c).length;

  const create = (c: LoreCategory) =>
    codex.create(c).then((entry) => {
      setError(null);
      setCategory((current) => (current === 'all' || current === c ? current : 'all'));
      navigate(hrefFor(entry.id));
    }, fail);

  if (entryId && entries?.some((e) => e.id === entryId && e.category === 'character')) return <Navigate to={`/project/${project.id}/characters/${entryId}`} replace />;

  return (
    <div className="codex" data-open={entryId ? '' : undefined}>
      <aside className="codex-list" aria-label="Codex entries">
        <header className="page-header">
          <div>
            <h1>Codex</h1>
            <p className="muted">
              {all.length} {all.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>
          <details className="menu inline">
            <summary className="btn primary">New entry</summary>
            <div className="menu-items">
              {categories.list.filter((c) => !c.archived).map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.closest('details')?.removeAttribute('open');
                    void create(c.key);
                  }}
                >
                  {c.singular}
                </button>
              ))}
              <button
                type="button"
                className="menu-rule"
                onClick={(e) => {
                  e.currentTarget.closest('details')?.removeAttribute('open');
                  setCustomizing(selected?.category ?? categories.list[0]?.key ?? 'lore');
                }}
              >
                Categories &amp; fields…
              </button>
            </div>
          </details>
        </header>

        <input type="search" value={query} placeholder="Search names, tags, fields…" aria-label="Search the codex" onChange={(e) => setQuery(e.target.value)} />
        <div className="grid-2 tight">
          <select value={category} aria-label="Filter by category" onChange={(e) => setCategory(e.target.value as LoreCategory | 'all')}>
            <option value="all">All categories ({all.length})</option>
            {categories.list.filter((c) => !c.archived || count(c.key) > 0).map((c) => (
              <option key={c.key} value={c.key}>
                {c.name} ({count(c.key)})
              </option>
            ))}
          </select>
          <select value={activeTag} aria-label="Filter by tag" disabled={tags.length === 0} onChange={(e) => setTag(e.target.value)}>
            <option value="all">{tags.length ? 'All tags' : 'No tags yet'}</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <ul className="entry-list">
          {visible.map((entry) => (
            <li key={entry.id} className={entry.id === entryId ? 'active' : ''}>
              <Link to={hrefFor(entry.id)} aria-current={entry.id === entryId ? 'page' : undefined}>
                <EntryThumb entry={entry} />
                <span className="entry-list-text">
                  <strong>{entry.name}</strong>
                  <span className="muted small">{entry.summary || categories.get(entry.category).singular}</span>
                  <span className="tags">
                    <CategoryBadge category={entry.category} />
                    {entry.tags.map((t) => (
                      <span key={t} className="badge">
                        {t}
                      </span>
                    ))}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {entries && all.length === 0 && (
          <div className="empty">
            <h2>Build your world</h2>
            <p className="muted">Keep places, factions, items, power systems and history here, and look them up while you write. Your cast lives in <Link to={`/project/${project.id}/characters`}>Characters</Link>.</p>
          </div>
        )}
        {all.length > 0 && visible.length === 0 && <p className="muted">No entries match.</p>}
      </aside>

      <section className="codex-entry">
        {error && (
          <p className="notice error" role="alert">
            {error}
            <button type="button" className="btn ghost icon" onClick={() => setError(null)} aria-label="Dismiss">
              ✕
            </button>
          </p>
        )}
        {entryId && (
          <Link to={base} className="back codex-back">
            ← All entries
          </Link>
        )}
        {selected ? (
          <EntryEditor
            key={selected.id}
            entry={selected}
            entries={entries ?? []}
            links={links ?? []}
            codex={codex}
            hrefFor={hrefFor}
            onError={fail}
            onDeleted={() => navigate(base, { replace: true })}
            onCustomize={() => setCustomizing(selected.category)}
          />
        ) : entryId && entries ? (
          <div className="empty">
            <h2>Entry not found</h2>
            <p className="muted">It may have been deleted.</p>
          </div>
        ) : (
          all.length > 0 && <p className="muted codex-hint">Select an entry to view or edit it.</p>
        )}
      </section>
      {customizing && <SchemaDialog codex={codex} entries={all} initial={customizing} hide="character" onClose={() => setCustomizing(null)} />}
    </div>
  );
}
