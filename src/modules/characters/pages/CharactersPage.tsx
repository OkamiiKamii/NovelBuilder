import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { characters } from '@/core';
import { useMe } from '@/modules/collab/identity';
import { can } from '@/modules/sync/access';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { codex } from '@/core';
import { SchemaDialog } from '@/modules/codex/components/SchemaDialog';
import { NewCharacter } from '../components/NewCharacter';
import { Portrait } from '../components/Portrait';
import { useCast } from '../hooks';
import { NO_FILTERS, SORTS, SORT_LABELS, facets, matches, passes, sortCharacters, type Filters, type Listed, type Sort } from '../library';
import { ROLES } from '../types';

const PAGE = 60;
const VIEW_KEY = 'novel-builder:characters:view';

/**
 * CHARACTER LIBRARY
 * Where the cast is found and managed. Every card and row is one of the
 * project's character records; searching, filtering and sorting only choose
 * among them. Selecting one opens its profile.
 */
export function CharactersPage() {
  const project = useCurrentProject();
  const navigate = useNavigate();
  const me = useMe(project.id);
  const writes = can(me.role, 'write');
  const { list, entries, nodes, order, templates, loading } = useCast(project.id);
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [creating, setCreating] = useState(false);
  const [shaping, setShaping] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [view, setViewState] = useState<'cards' | 'list'>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards';
    } catch {
      return 'cards';
    }
  });
  const setView = (next: 'cards' | 'list') => {
    setViewState(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // not essential
    }
  };
  const query = params.get('q') ?? '';
  const sort: Sort = SORTS.includes(params.get('sort') as Sort) ? (params.get('sort') as Sort) : 'name';
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const base = `/project/${project.id}`;
  const nameOf = useMemo(() => {
    const names = new Map(entries.map((e) => [e.id, e.name]));
    return (id: string) => names.get(id);
  }, [entries]);
  const kept = list.filter((l) => l.profile.archived === filters.archived);
  const options = useMemo(() => facets(kept), [kept]);
  const found = useMemo(() => sortCharacters(list.filter((l) => passes(l, filters) && matches(l, query, nameOf)), sort), [list, filters, query, sort, nameOf]);
  const archivedCount = list.filter((l) => l.profile.archived).length;
  const roleTabs = [...new Set([...ROLES.filter((role) => options.roles.some((r) => r.toLowerCase() === role.toLowerCase())), ...options.roles])];
  const active = Object.entries(filters).filter(([key, value]) => key !== 'role' && key !== 'archived' && value !== '' && value !== null).length;
  const chapters = order.chapters;
  const where = (l: Listed) => (l.linkedIn.length ? `${l.linkedIn.length} linked ${l.linkedIn.length === 1 ? 'chapter' : 'chapters'}` : 'Not linked in the manuscript yet');
  const move = (l: Listed, by: -1 | 1) => {
    const ids = found.map((x) => x.entry.id);
    const at = ids.indexOf(l.entry.id);
    if (at + by < 0 || at + by >= ids.length) return;
    [ids[at], ids[at + by]] = [ids[at + by], ids[at]];
    void characters.forProject(project.id).reorder(ids);
  };
  const select = (label: string, value: string, choices: string[], onChange: (value: string) => void) =>
    choices.length > 0 && (
      <label className="field">
        <span>{label}</span>
        <select value={value} aria-label={`Filter by ${label.toLowerCase()}`} onChange={(e) => onChange(e.target.value)}>
          <option value="">Any</option>
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      </label>
    );

  if (loading) return null;
  return (
    <div className="vault vault-library">
      <header className="page-header">
        <div>
          <h1>Characters</h1>
          <p className="muted">Manage your characters, track their development, and explore their connections throughout your story.</p>
        </div>
        {writes && (
          <div className="actions wrap">
            <Link className="btn ghost" to={`${base}/characters/systems`} title="The rules characters level and grow by: attributes, levels, classes, skills">
              Systems
            </Link>
            <button type="button" className="btn ghost" title="Fields offered on every character’s profile" onClick={() => setShaping(true)}>
              Shared fields…
            </button>
            <button type="button" className="btn primary" onClick={() => setCreating(true)}>
              + New Character
            </button>
          </div>
        )}
        {shaping && <SchemaDialog codex={codex.forProject(project.id)} entries={entries} initial="character" only="character" onClose={() => setShaping(false)} />}
      </header>

      {list.length === 0 ? (
        <div className="empty vault-empty-state">
          <h2>Your character library is empty.</h2>
          <p className="muted">Characters you create here are the same records the manuscript, relationships, timeline and plot threads refer to.</p>
          <div className="actions center wrap">
            {writes && (
              <button type="button" className="btn primary" onClick={() => setCreating(true)}>
                Create Character
              </button>
            )}
            <Link to={`${base}/export`} className="btn">
              Import a project or backup
            </Link>
            <Link to={base} className="btn">
              Back to the Overview
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="vault-toolbar">
            <input type="search" value={query} placeholder="Search characters…" aria-label="Search characters" onChange={(e) => setParam('q', e.target.value)} />
            <button type="button" className="btn" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
              Filters{active ? ` (${active})` : ''}
            </button>
            <label className="inline">
              Sort
              <select value={sort} aria-label="Sort characters by" onChange={(e) => setParam('sort', e.target.value === 'name' ? '' : e.target.value)}>
                {SORTS.map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <div className="segmented" role="radiogroup" aria-label="View">
              <button type="button" role="radio" aria-checked={view === 'cards'} className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')}>
                Cards
              </button>
              <button type="button" role="radio" aria-checked={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
                List
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="vault-filters" role="group" aria-label="Filters">
              {select('Status', filters.status, options.statuses, (status) => setFilters({ ...filters, status }))}
              {select('Tag', filters.tag, options.tags, (tag) => setFilters({ ...filters, tag }))}
              {select('Species', filters.species, options.species, (species) => setFilters({ ...filters, species }))}
              {select('Occupation', filters.occupation, options.occupations, (occupation) => setFilters({ ...filters, occupation }))}
              {select('Faction', filters.faction, options.factions, (faction) => setFilters({ ...filters, faction }))}
              {chapters.length > 0 && (
                <label className="field">
                  <span>First appears by</span>
                  <select value={filters.firstBy ?? ''} aria-label="Filter by first appearance" onChange={(e) => setFilters({ ...filters, firstBy: e.target.value === '' ? null : Number(e.target.value) })}>
                    <option value="">Any</option>
                    {chapters.map((chapter) => (
                      <option key={chapter.id} value={order.position.get(chapter.id)}>
                        {chapter.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {active === 0 && options.statuses.length + options.tags.length + options.species.length + options.occupations.length + options.factions.length + chapters.length === 0 && <p className="muted small">Filters appear as your characters gain a status, tags, a species, an occupation or a faction.</p>}
              {active > 0 && (
                <button type="button" className="btn ghost" onClick={() => setFilters({ ...NO_FILTERS, role: filters.role, archived: filters.archived })}>
                  Clear filters
                </button>
              )}
            </div>
          )}

          <div className="vault-roles" role="tablist" aria-label="Narrative role">
            <button type="button" role="tab" aria-selected={!filters.role && !filters.archived} className={!filters.role && !filters.archived ? 'active' : ''} onClick={() => setFilters({ ...filters, role: '', archived: false })}>
              All <span className="muted">{list.length - archivedCount}</span>
            </button>
            {roleTabs.map((role) => (
              <button key={role} type="button" role="tab" aria-selected={filters.role.toLowerCase() === role.toLowerCase() && !filters.archived} className={filters.role.toLowerCase() === role.toLowerCase() && !filters.archived ? 'active' : ''} onClick={() => setFilters({ ...filters, role, archived: false })}>
                {/s$/.test(role) || !ROLES.includes(role as never) || role === 'Supporting' || role === 'Minor' || role === 'Background' ? role : `${role}s`}
              </button>
            ))}
            {archivedCount > 0 && (
              <button type="button" role="tab" aria-selected={filters.archived} className={filters.archived ? 'active' : ''} onClick={() => setFilters({ ...filters, role: '', archived: true })}>
                Archived <span className="muted">{archivedCount}</span>
              </button>
            )}
          </div>

          <p className="muted small" role="status" aria-label="Characters shown">
            {found.length === kept.length && !query ? `${found.length} ${found.length === 1 ? 'character' : 'characters'}` : `${found.length} of ${kept.length} ${kept.length === 1 ? 'character' : 'characters'}`}
          </p>

          {found.length === 0 ? (
            <p className="empty">No character matches. Search only finds characters that exist; it does not create or suggest any.</p>
          ) : view === 'cards' ? (
            <ul className="vault-cards" aria-label="Characters">
              {found.slice(0, shown).map((l) => (
                <li key={l.entry.id}>
                  <Link to={`${base}/characters/${l.entry.id}`} className="vault-card" aria-label={`${l.entry.name}${l.profile.epithet ? `, ${l.profile.epithet}` : ''}`}>
                    <Portrait name={l.entry.name} image={l.entry.image} focal={l.profile.focal} className="card-portrait" />
                    <span className="vault-card-text">
                      <strong className="vault-name">{l.entry.name}</strong>
                      {l.profile.epithet && <span className="vault-epithet">{l.profile.epithet}</span>}
                      {l.profile.roles.length > 0 && (
                        <span className="chips">
                          {l.profile.roles.map((role) => (
                            <span key={role} className="role-badge-vault">
                              {role}
                            </span>
                          ))}
                        </span>
                      )}
                      {l.entry.summary && <span className="vault-card-summary">{l.entry.summary}</span>}
                      {l.entry.tags.length > 0 && <span className="vault-card-tags">{l.entry.tags.slice(0, 4).join(' · ')}</span>}
                      <span className="vault-card-count">{where(l)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <table className="analytics-table vault-list" aria-label="Characters">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Role</th>
                  <th scope="col">Summary</th>
                  <th scope="col">In the manuscript</th>
                  {sort === 'custom' && writes && <th scope="col">Order</th>}
                </tr>
              </thead>
              <tbody>
                {found.slice(0, shown).map((l, i) => (
                  <tr key={l.entry.id}>
                    <th scope="row">
                      <Link to={`${base}/characters/${l.entry.id}`} className="vault-list-name">
                        <Portrait name={l.entry.name} image={l.entry.image} focal={l.profile.focal} className="list-portrait" />
                        <span>
                          {l.entry.name}
                          {l.profile.epithet && <span className="muted small"> · {l.profile.epithet}</span>}
                        </span>
                      </Link>
                    </th>
                    <td>{l.profile.roles.join(', ')}</td>
                    <td className="vault-list-summary">{l.entry.summary}</td>
                    <td>{l.linkedIn.length ? `${l.linkedIn.length} linked` : '—'}</td>
                    {sort === 'custom' && writes && (
                      <td>
                        <button type="button" className="tool" aria-label={`Move ${l.entry.name} up`} disabled={i === 0 || Boolean(query)} onClick={() => move(l, -1)}>
                          ↑
                        </button>
                        <button type="button" className="tool" aria-label={`Move ${l.entry.name} down`} disabled={i === found.length - 1 || Boolean(query)} onClick={() => move(l, 1)}>
                          ↓
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {found.length > shown && (
            <div className="actions center">
              <button type="button" className="btn" onClick={() => setShown(shown + PAGE)}>
                Show {Math.min(PAGE, found.length - shown)} more
              </button>
            </div>
          )}
          {nodes.length > 0 && <p className="muted small">“Linked” counts chapters and scenes whose text has a link to the character. A name that is only mentioned is not counted here.</p>}
        </>
      )}

      {creating && <NewCharacter projectId={project.id} templates={templates} onClose={() => setCreating(false)} onCreated={(id) => navigate(`${base}/characters/${id}`)} />}
    </div>
  );
}
