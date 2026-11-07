/**
 * WHO MAY SEE AND CHANGE WHAT
 * The one statement of the roles' permissions. The relay enforces it (a
 * device is never sent a row its role may not see, and a change its role may
 * not make is refused), and the app uses the same functions to decide what
 * to show and to stop a disallowed change before it is made. It has no
 * imports, so Node can run it as it is beside the relay.
 *
 * OWNER FINAL AUTHORITY RULE
 * Editors, readers and viewers cannot write to the manuscript, the
 * worldbuilding, systems or character sheets at all: what they propose
 * travels as a suggestion or a comment, and only an author's acceptance
 * turns it into a change. Co-authors write freely, except that established
 * canon, and who is on the team, stay with the owner.
 */

export const ROLES = ['owner', 'coauthor', 'editor', 'reader', 'viewer'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = { owner: 'Owner', coauthor: 'Co-Author', editor: 'Editor', reader: 'Beta Reader / Proofreader', viewer: 'Viewer' };
export const ROLE_SUMMARIES: Record<Role, string> = {
  owner: 'Everything, including the team, deleting the project and the last word on canon.',
  coauthor: 'Writes the manuscript, plans and worldbuilding. Accepts or rejects suggestions.',
  editor: 'Reads everything but private notes. Suggests changes to the text and the lore, and comments anywhere.',
  reader: 'Reads the manuscript only. Comments, reacts and fills in feedback. Sees no plans or lore.',
  viewer: 'Reads chapters marked Final or Published. Cannot comment.',
};
/** The roles that can be given to someone invited. */
export const INVITABLE: Role[] = ['coauthor', 'editor', 'reader', 'viewer'];

export type Capability =
  /** Invite people, change roles, remove people. */
  | 'manage'
  /** Change the manuscript, plans and worldbuilding directly. */
  | 'write'
  /** Accept or reject what others propose, and turn comments into tasks. */
  | 'decide'
  /** Propose changes to the text and the lore. */
  | 'suggest'
  | 'comment'
  | 'readLore'
  | 'readPlanning'
  /** See what other people have commented. A reader sees only their own conversations. */
  | 'seeAllComments'
  /** See the record of who did what. */
  | 'seeActivity';

const CAN: Record<Role, Capability[]> = {
  owner: ['manage', 'write', 'decide', 'suggest', 'comment', 'readLore', 'readPlanning', 'seeAllComments', 'seeActivity'],
  coauthor: ['write', 'decide', 'suggest', 'comment', 'readLore', 'readPlanning', 'seeAllComments', 'seeActivity'],
  editor: ['suggest', 'comment', 'readLore', 'readPlanning', 'seeAllComments', 'seeActivity'],
  reader: ['comment'],
  viewer: [],
};
export const can = (role: Role, capability: Capability): boolean => CAN[role].includes(capability);
export const isRole = (value: unknown): value is Role => ROLES.includes(value as Role);

type Row = Record<string, unknown>;
/** Looks up another row of the same project, for rules that depend on one (a chapter's text follows its chapter). */
export type Lookup = (key: string) => Row | null;

const LORE = ['characterProfiles', 'characterTemplates', 'loreEntries', 'loreLinks', 'loreSchemas', 'characterRelations', 'relationSettings', 'timelineEvents', 'storyCalendars', 'alternateHistories', 'systems', 'systemSheets', 'progressSnapshots', 'progressCategories', 'progressChanges', 'placeSettings', 'worldMaps', 'mapPins', 'journeys', 'travelSettings', 'canonFacts', 'projectModules', 'moduleRecords'];
const PLANNING = ['chapterPlans', 'structureMarkers', 'plotThreads', 'continuityRules', 'continuityResolutions', 'savedViews'];
/** What only the people writing the book see: its history, alternate drafts, goals, sessions and loose ideas. */
const AUTHORS_ONLY = ['characterSecrets', 'characterNotes', 'characterHistory', 'chapterRevisions', 'chapterBranches', 'goals', 'writingSessions', 'brainstorms', 'ideas'];
export const COLLAB = ['members', 'comments', 'suggestions', 'activity'];
/** Chapter statuses a viewer may read. */
export const PUBLISHED = ['final', 'published'];

const tableOf = (key: string): string => key.slice(0, key.indexOf(':'));
const idOf = (key: string): string => key.slice(key.indexOf(':') + 1);
const isText = (kind: unknown): boolean => kind === 'chapter' || kind === 'scene';

/**
 * A row as someone in this role is allowed to see it: the row, a copy with
 * its private parts blanked, or null when it is not theirs to see.
 */
export function visible(role: Role, memberId: string, key: string, row: Row | null, lookup: Lookup): Row | null {
  if (!row) return null;
  if (role === 'owner') return row;
  const table = tableOf(key);
  // A person's own settings (layouts, appearance) are nobody else's.
  if (table === 'settings') return null;
  if (table === 'timelines') return role === 'coauthor' ? row : null;
  if (table === 'projects') return can(role, 'readPlanning') ? row : { ...row, synopsis: '', tags: [], targetWordCount: null, deadline: null };
  if (table === 'members') {
    if (can(role, 'seeActivity')) return role === 'coauthor' ? row : { ...row, email: '' };
    return row.id === memberId ? { ...row, email: '' } : null;
  }
  if (table === 'comments') {
    if (!can(role, 'comment')) return null;
    return can(role, 'seeAllComments') || row.threadAuthorId === memberId ? row : null;
  }
  if (table === 'suggestions') return can(role, 'suggest') ? row : null;
  if (table === 'activity') return can(role, 'seeActivity') ? row : null;
  // Front and back matter is published with the book: whoever may read the book may read it.
  if (role === 'coauthor' || table === 'bookMatter') return row;
  if (AUTHORS_ONLY.includes(table)) return null;
  if (LORE.includes(table)) {
    if (!can(role, 'readLore')) return null;
    // A connection to a chapter or a plot thread is part of the plan.
    if (table === 'loreLinks' && [row.fromType, row.toType].some((t) => t === 'node' || t === 'thread') && !can(role, 'readPlanning')) return null;
    // An entry's notes are marked private to the author.
    return table === 'loreEntries' ? { ...row, notes: '' } : row;
  }
  if (PLANNING.includes(table)) return can(role, 'readPlanning') ? row : null;
  if (table === 'chapters') {
    if (role === 'editor') return row;
    if (role === 'viewer' && isText(row.kind) && !PUBLISHED.includes(String(row.status))) return null;
    // Summaries and notes are planning.
    return { ...row, summary: '', notes: '', mentions: [] };
  }
  if (table === 'chapterContents') {
    if (role !== 'viewer') return row;
    const chapter = lookup(`chapters:${idOf(key)}`);
    return chapter && PUBLISHED.includes(String(chapter.status)) ? row : null;
  }
  return null;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const without = (row: Row, fields: string[]): Row => Object.fromEntries(Object.entries(row).filter(([field]) => !fields.includes(field)));

/**
 * Whether someone in this role may make this change. Returns null when
 * they may, and otherwise the reason, in words fit to show them.
 * `before` is the row as it stands (null for a new one), `after` the row
 * proposed (null to delete it).
 */
export function refusal(role: Role, memberId: string, key: string, before: Row | null, after: Row | null): string | null {
  if (role === 'owner') return null;
  const table = tableOf(key);
  if (table === 'settings') return 'Settings are personal and are not shared.';
  if (table === 'members') return 'Only the owner manages who is on the project.';
  if (table === 'projects' || table === 'timelines') return 'Only the owner changes the project itself.';
  const mine = (row: Row | null, field: string) => row?.[field] === memberId;

  if (table === 'activity') {
    // The record of who did what is written once, by the person who did it.
    if (role === 'viewer') return 'Viewers read only.';
    return after && mine(after, 'actorId') && (!before || mine(before, 'actorId')) ? null : 'The activity record cannot be rewritten.';
  }
  if (table === 'comments') {
    if (!can(role, 'comment')) return 'Viewers cannot comment.';
    if (role === 'coauthor') return null;
    if (!before) {
      if (!mine(after, 'authorId')) return 'A comment is signed by whoever wrote it.';
      return can(role, 'seeAllComments') || mine(after, 'threadAuthorId') ? null : 'Readers reply in their own conversations.';
    }
    if (mine(before, 'authorId')) return !after || mine(after, 'authorId') ? null : 'A comment is signed by whoever wrote it.';
    // Someone else's comment: an editor may resolve or re-open the thread, and nothing more.
    const marks = ['status', 'resolvedBy', 'resolvedAt', 'updatedAt'];
    return role === 'editor' && after && same(without(before, marks), without(after, marks)) ? null : 'Only its writer or an author can change a comment.';
  }
  if (table === 'suggestions') {
    if (role === 'coauthor') return null;
    if (!can(role, 'suggest')) return 'Your role comments; it does not suggest changes.';
    if (!before) return mine(after, 'authorId') && after?.status === 'pending' && same(after.decisions ?? {}, {}) ? null : 'A suggestion starts out pending, in its writer’s name.';
    if (!mine(before, 'authorId')) return 'Only its writer can change a suggestion.';
    if (!after) return null;
    // The verdict belongs to the authors.
    const verdict = ['status', 'decisions', 'decidedBy', 'decidedAt'];
    return mine(after, 'authorId') && verdict.every((field) => same(before[field], after[field])) ? null : 'Only an author accepts or rejects a suggestion.';
  }
  if (role === 'coauthor') {
    if (table === 'canonFacts' && (before?.status === 'canon' || after?.status === 'canon')) return 'Established canon is the owner’s to set and change.';
    return null;
  }
  if (role === 'editor') return 'Editors propose changes as suggestions and comments; an author accepts them.';
  if (role === 'reader') return 'Readers comment and give feedback; they do not change the project.';
  return 'Viewers read only.';
}

/** The pages of a project each role is shown. Others are not listed, and opening one leads back to the manuscript. */
const EVERYONE = ['', 'manuscript', 'read', 'studio'];
const TEAM = ['team'];
const EDITOR_PAGES = [...EVERYONE, ...TEAM, 'organizer', 'board', 'characters', 'codex', 'systems', 'progression', 'relationships', 'timeline', 'plot', 'canon', 'graph', 'visualize', 'modules'];
export function pageAllowed(role: Role, page: string): boolean {
  if (role === 'owner' || role === 'coauthor') return true;
  if (role === 'editor') return EDITOR_PAGES.includes(page);
  if (role === 'reader') return [...EVERYONE, ...TEAM].includes(page);
  return EVERYONE.includes(page);
}
