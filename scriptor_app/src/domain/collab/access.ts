// WHO MAY SEE AND CHANGE WHAT. The one statement of the roles' permissions, as the original app's
// `src/modules/sync/access.ts` states it. A review copy holds only what its role may see (`visible`); a feedback file
// is accepted row by row only where its role may make the change (`refusal`); and the store refuses, under every
// write, a change a review copy's role may not make.
//
// OWNER FINAL AUTHORITY RULE: editors, readers and viewers cannot write to the manuscript, the worldbuilding, systems
// or character sheets at all: what they propose travels as a suggestion or a comment, and only an author's acceptance
// turns it into a change.
//
// A port of flutter_app/lib/shared/domain/collab/access.dart.

import { type JsonMap, jsonEquals, str } from '../json';

export type Role = 'owner' | 'coauthor' | 'editor' | 'reader' | 'viewer';
export const roles: readonly Role[] = ['owner', 'coauthor', 'editor', 'reader', 'viewer'];

export const roleLabel: Readonly<Record<Role, string>> = {
  owner: 'Owner',
  coauthor: 'Co-Author',
  editor: 'Editor',
  reader: 'Beta Reader / Proofreader',
  viewer: 'Viewer',
};

export const roleSummary: Readonly<Record<Role, string>> = {
  owner: 'Everything, including the team, deleting the project and the last word on canon.',
  coauthor: 'Writes the manuscript, plans and worldbuilding. Accepts or rejects suggestions.',
  editor: 'Reads everything but private notes. Suggests changes to the text and the lore, and comments anywhere.',
  reader: 'Reads the manuscript only. Comments, reacts and fills in feedback. Sees no plans or lore.',
  viewer: 'Reads chapters marked Final or Published. Cannot comment.',
};

/** Dart's `Role.of`: the role a stored name names, or null. */
export function roleOf(value: unknown): Role | null {
  return roles.find((r) => r === value) ?? null;
}

/** The roles a review copy can be made for. A co-author writes freely, which exchanging files cannot carry without
 * syncing whole manuscripts; their work comes back as an editor's suggestions instead. */
export const reviewRoles: readonly Role[] = ['editor', 'reader', 'viewer'];

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

const allCapabilities: readonly Capability[] = [
  'manage',
  'write',
  'decide',
  'suggest',
  'comment',
  'readLore',
  'readPlanning',
  'seeAllComments',
  'seeActivity',
];

const canDo: Readonly<Record<Role, readonly Capability[]>> = {
  owner: allCapabilities,
  coauthor: ['write', 'decide', 'suggest', 'comment', 'readLore', 'readPlanning', 'seeAllComments', 'seeActivity'],
  editor: ['suggest', 'comment', 'readLore', 'readPlanning', 'seeAllComments', 'seeActivity'],
  reader: ['comment'],
  viewer: [],
};

export function can(role: Role, capability: Capability): boolean {
  return canDo[role].includes(capability);
}

const lore = [
  'characterProfiles',
  'characterTemplates',
  'loreEntries',
  'loreLinks',
  'loreSchemas',
  'characterRelations',
  'relationSettings',
  'timelineEvents',
  'storyCalendars',
  'alternateHistories',
  'systems',
  'systemSheets',
  'progressSnapshots',
  'progressCategories',
  'progressChanges',
  'placeSettings',
  'worldMaps',
  'mapPins',
  'journeys',
  'travelSettings',
  'canonFacts',
  'projectModules',
  'moduleRecords',
];
const planning = ['chapterPlans', 'structureMarkers', 'plotThreads', 'continuityRules', 'continuityResolutions', 'savedViews'];

/** What only the people writing the book see: its history, alternate drafts, goals, sessions and loose ideas. */
const authorsOnly = [
  'characterSecrets',
  'characterNotes',
  'characterHistory',
  'chapterRevisions',
  'chapterBranches',
  'goals',
  'writingSessions',
  'brainstorms',
  'ideas',
];

/** The collections of the team: who is on it, and what they have said, proposed and done. */
export const collabCollections: readonly string[] = ['members', 'comments', 'suggestions', 'activity'];

/** Chapter statuses a viewer may read. */
export const publishedStatuses: readonly string[] = ['final', 'published'];

const tableOf = (key: string): string => key.substring(0, key.indexOf(':'));
const idOf = (key: string): string => key.substring(key.indexOf(':') + 1);
const isText = (kind: unknown): boolean => kind === 'chapter' || kind === 'scene';

export type Lookup = (key: string) => JsonMap | null;

/** A row as someone in this role is allowed to see it: the row, a copy with its private parts blanked, or null when it
 * is not theirs to see. `key` is `<collection>:<id>` (`projects:<id>` for the novel's details). */
export function visible(role: Role, memberId: string, key: string, row: JsonMap | null, lookup: Lookup): JsonMap | null {
  if (row === null) return null;
  if (role === 'owner') return row;
  const table = tableOf(key);
  if (table === 'settings') return null;
  if (table === 'timelines') return role === 'coauthor' ? row : null;
  if (table === 'projects') {
    return can(role, 'readPlanning') ? row : { ...row, synopsis: '', tags: [], targetWordCount: null, deadline: null };
  }
  if (table === 'members') {
    if (can(role, 'seeActivity')) return role === 'coauthor' ? row : { ...row, email: '' };
    return row['id'] === memberId ? { ...row, email: '' } : null;
  }
  if (table === 'comments') {
    if (!can(role, 'comment')) return null;
    return can(role, 'seeAllComments') || row['threadAuthorId'] === memberId ? row : null;
  }
  if (table === 'suggestions') return can(role, 'suggest') ? row : null;
  if (table === 'activity') return can(role, 'seeActivity') ? row : null;
  // Front and back matter is published with the book: whoever may read the book may read it.
  if (role === 'coauthor' || table === 'bookMatter') return row;
  if (authorsOnly.includes(table)) return null;
  if (lore.includes(table)) {
    if (!can(role, 'readLore')) return null;
    // A connection to a chapter or a plot thread is part of the plan.
    if (
      table === 'loreLinks' &&
      [row['fromType'], row['toType']].some((t) => t === 'node' || t === 'thread') &&
      !can(role, 'readPlanning')
    ) {
      return null;
    }
    // An entry's notes are marked private to the author.
    return table === 'loreEntries' ? { ...row, notes: '' } : row;
  }
  if (planning.includes(table)) return can(role, 'readPlanning') ? row : null;
  if (table === 'chapters') {
    if (role === 'editor') return row;
    if (role === 'viewer' && isText(row['kind']) && !publishedStatuses.includes(str(row['status']))) return null;
    // Summaries and notes are planning.
    return { ...row, summary: '', notes: '', mentions: [] };
  }
  if (table === 'chapterContents') {
    if (role !== 'viewer') return row;
    const chapter = lookup(`chapters:${idOf(key)}`);
    return chapter !== null && publishedStatuses.includes(str(chapter['status'])) ? row : null;
  }
  return null;
}

const same = (a: unknown, b: unknown): boolean => jsonEquals(a, b);
const without = (row: JsonMap, fields: readonly string[]): JsonMap => {
  const out: JsonMap = {};
  for (const [k, v] of Object.entries(row)) if (!fields.includes(k)) out[k] = v;
  return out;
};

/** Whether someone in this role may make this change: null when they may, and otherwise the reason, in words fit to
 * show them. `before` is the row as it stands (null for a new one), `after` the row proposed (null to delete it). */
export function refusal(role: Role, memberId: string, key: string, before: JsonMap | null, after: JsonMap | null): string | null {
  if (role === 'owner') return null;
  const table = tableOf(key);
  if (table === 'settings') return 'Settings are personal and are not shared.';
  if (table === 'members') return 'Only the owner manages who is on the project.';
  if (table === 'projects' || table === 'timelines') return 'Only the owner changes the project itself.';
  const mine = (row: JsonMap | null, field: string): boolean => row !== null && row[field] === memberId;

  if (table === 'activity') {
    // The record of who did what is written once, by the person who did it.
    if (role === 'viewer') return 'Viewers read only.';
    return after !== null && mine(after, 'actorId') && (before === null || mine(before, 'actorId'))
      ? null
      : 'The activity record cannot be rewritten.';
  }
  if (table === 'comments') {
    if (!can(role, 'comment')) return 'Viewers cannot comment.';
    if (role === 'coauthor') return null;
    if (before === null) {
      if (!mine(after, 'authorId')) return 'A comment is signed by whoever wrote it.';
      return can(role, 'seeAllComments') || mine(after, 'threadAuthorId') ? null : 'Readers reply in their own conversations.';
    }
    if (mine(before, 'authorId')) {
      return after === null || mine(after, 'authorId') ? null : 'A comment is signed by whoever wrote it.';
    }
    // Someone else's comment: an editor may resolve or re-open the thread, and nothing more.
    const marks = ['status', 'resolvedBy', 'resolvedAt', 'updatedAt'];
    return role === 'editor' && after !== null && same(without(before, marks), without(after, marks))
      ? null
      : 'Only its writer or an author can change a comment.';
  }
  if (table === 'suggestions') {
    if (role === 'coauthor') return null;
    if (!can(role, 'suggest')) return 'Your role comments; it does not suggest changes.';
    if (before === null) {
      return mine(after, 'authorId') && after?.['status'] === 'pending' && same(after?.['decisions'] ?? {}, {})
        ? null
        : 'A suggestion starts out pending, in its writer’s name.';
    }
    if (!mine(before, 'authorId')) return 'Only its writer can change a suggestion.';
    if (after === null) return null;
    // The verdict belongs to the authors.
    const verdict = ['status', 'decisions', 'decidedBy', 'decidedAt'];
    return mine(after, 'authorId') && verdict.every((field) => same(before[field], after[field]))
      ? null
      : 'Only an author accepts or rejects a suggestion.';
  }
  if (role === 'coauthor') {
    if (table === 'canonFacts' && (before?.['status'] === 'canon' || after?.['status'] === 'canon')) {
      return 'Established canon is the owner’s to set and change.';
    }
    return null;
  }
  if (role === 'editor') return 'Editors propose changes as suggestions and comments; an author accepts them.';
  if (role === 'reader') return 'Readers comment and give feedback; they do not change the project.';
  return 'Viewers read only.';
}

/** A change a review copy's role does not allow. The message is fit to show the person. */
export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}
