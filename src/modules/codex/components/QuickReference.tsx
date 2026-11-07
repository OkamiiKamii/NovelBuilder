import { entryPath } from '@/modules/characters/hooks';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { codex as codexService } from '@/core';
import { matchesEntry, useCodex } from '../hooks';
import { relatedTo } from '../service';
import { useCategories } from '../categories';
import { filledFields } from '../schema';
import type { LoreCategory } from '../types';
import { CategoryBadge, EntryThumb } from './EntryBits';

/**
 * Read-only codex lookup for the writing screen. It deliberately has no
 * "insert" action: reference stays reference, and the manuscript changes only
 * when the author types.
 */
export function QuickReference({ projectId, openId, onOpen: setOpenId }: { projectId: string; openId: string | null; onOpen: (entryId: string | null) => void }) {
  const codex = useMemo(() => codexService.forProject(projectId), [projectId]);
  const { entries = [], links = [] } = useCodex(codex);
  const categories = useCategories();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<LoreCategory | 'all'>('all');
  const open = entries.find((e) => e.id === openId);

  if (open) {
    const related = relatedTo(open.id, entries, links);
    const filled = filledFields(open, categories.get(open.category), (id) => entries.find((e) => e.id === id)?.name);
    return (
      <div className="quick-entry">
        <div className="history-head">
          <button type="button" className="btn ghost" onClick={() => setOpenId(null)}>
            ← All entries
          </button>
          <Link to={entryPath(projectId, open)} className="btn ghost">
            {open.category === 'character' ? 'Open character profile' : 'Edit in Codex'}
          </Link>
        </div>
        <div className="quick-head">
          <EntryThumb entry={open} />
          <div>
            <strong>{open.name}</strong>
            <div>
              <CategoryBadge category={open.category} />
            </div>
          </div>
        </div>
        {open.summary && <p>{open.summary}</p>}
        {filled.length > 0 && (
          <dl className="quick-fields">
            {filled.map((field) => (
              <div key={field.id}>
                <dt>{field.label}</dt>
                <dd>{field.text}</dd>
              </div>
            ))}
          </dl>
        )}
        {open.description && <p className="pre">{open.description}</p>}
        {open.tags.length > 0 && (
          <div className="tags">
            {open.tags.map((tag) => (
              <span key={tag} className="badge">
                {tag}
              </span>
            ))}
          </div>
        )}
        {related.length > 0 && (
          <>
            <h3>Related entries</h3>
            <ul className="quick-list">
              {related.map(({ linkId, entry, label }) => (
                <li key={linkId}>
                  <button type="button" onClick={() => setOpenId(entry.id)}>
                    <EntryThumb entry={entry} className="small" />
                    <span>
                      <strong>{entry.name}</strong>
                      {label && <span className="muted small">{label}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {open.notes && (
          <>
            <h3>Author notes</h3>
            <p className="pre muted">{open.notes}</p>
          </>
        )}
      </div>
    );
  }

  const visible = entries
    .filter((e) => (category === 'all' || e.category === category) && matchesEntry(e, query))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <input type="search" value={query} placeholder="Search the codex…" aria-label="Search the codex" onChange={(e) => setQuery(e.target.value)} />
      <select value={category} aria-label="Codex category" onChange={(e) => setCategory(e.target.value as LoreCategory | 'all')}>
        <option value="all">All categories</option>
        {categories.list.map((c) => (
          <option key={c.key} value={c.key}>
            {c.name}
          </option>
        ))}
      </select>
      {entries.length === 0 ? (
        <p className="muted small">
          Nothing to look up yet. Add <Link to={`/project/${projectId}/characters`}>characters</Link> or <Link to={`/project/${projectId}/codex`}>places and lore</Link> to have them here while you write.
        </p>
      ) : (
        <ul className="quick-list">
          {visible.map((entry) => (
            <li key={entry.id}>
              <button type="button" onClick={() => setOpenId(entry.id)}>
                <EntryThumb entry={entry} className="small" />
                <span>
                  <strong>{entry.name}</strong>
                  <span className="muted small">{entry.summary || categories.get(entry.category).name}</span>
                </span>
              </button>
            </li>
          ))}
          {visible.length === 0 && <li className="muted small">Nothing matches.</li>}
        </ul>
      )}
    </>
  );
}
