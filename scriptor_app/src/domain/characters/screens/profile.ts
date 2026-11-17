// CHARACTER PROFILE: everything about one character, on its tabs, as a view of the one record every other feature
// uses. The pure parts of flutter_app/lib/features/characters/character_page.dart (the tabs, the header's facts and
// figures, the identity view and form, the portrait's tools, the More menu, archive and delete) and of
// widgets/vault_rail.dart (previous and next, and finding a character).

import { formatNumber } from '../../desk/format';
import { type Entry } from '../../records/entry';
import { dartTrim } from '../../text/dartString';
import { foldText } from '../../text/fold';
import { type Listed } from '../cast';
import { type CastData } from '../castData';
import { type CharacterReferences } from '../characterChanges';
import { type CharacterProfile, characterRoles, characterStatuses } from '../characterRecords';

// ---------------------------------------------------------------------------------------------------- the tabs

/** Dart's `ProfilePage`: the profile's tabs. `status` (their sheet on the novel's system) is only in a novel with
 * systems, and there first. */
export type ProfilePage =
  | 'status'
  | 'overview'
  | 'relationships'
  | 'details'
  | 'progression'
  | 'secrets'
  | 'notes'
  | 'history';
export const profilePages: readonly ProfilePage[] = [
  'status',
  'overview',
  'relationships',
  'details',
  'progression',
  'secrets',
  'notes',
  'history',
];
export const profilePageLabel: Readonly<Record<ProfilePage, string>> = {
  status: 'Status',
  overview: 'Overview',
  relationships: 'Relationships',
  details: 'Details',
  progression: 'Progression',
  secrets: 'Secrets',
  notes: 'Notes',
  history: 'History',
};

export function profilePageOf(name: string | null | undefined): ProfilePage {
  return profilePages.find((t) => t === name) ?? 'overview';
}

/** The tab `name` asks for (the `tab` of the address), in a novel with or without systems: none asked, Status where
 * there are systems and Overview where there are none (where Status is not a tab). */
export function shownProfilePage(name: string | null | undefined, options: { systems: boolean }): ProfilePage {
  const asked = profilePages.find((t) => t === name) ?? null;
  if (asked === null) return options.systems ? 'status' : 'overview';
  return asked === 'status' && !options.systems ? 'overview' : asked;
}

/** The tabs of a novel with or without systems. */
export function profilePageTabs(options: { systems: boolean }): ProfilePage[] {
  return profilePages.filter((p) => p !== 'status' || options.systems);
}

/** Whether the novel has systems (so the profile has a Status tab). */
export function hasSystems(cast: CastData): boolean {
  return cast.model.systems.size > 0;
}

/** When the address is not a character of the open novel. */
export function notFound(cast: CastData | null): { title: string; message: string; action: string; toLibrary: boolean } {
  return {
    title: 'Character not found',
    message:
      cast === null
        ? 'No novel is open. Open one from the Library.'
        : 'It may have been deleted, or the link is to something that is not a character.',
    action: cast === null ? 'Go to Library' : 'Characters',
    toLibrary: cast === null,
  };
}

// ---------------------------------------------------------------------------------------------------- previous, next, find

/** The cast as the vault goes through it: everyone not archived (and `keep`, the one shown), in the cast's own order
 * (CastData.list). */
export function vaultOrder(cast: CastData, options: { keep?: string | null } = {}): Listed[] {
  return cast.list.filter((l) => !l.profile.archived || l.entry.id === options.keep);
}

/** The one before (`by` -1) or after (+1) `currentId` in the vault's order (going round at the ends), or null with no
 * one else. Previous and next keep the tab being read. */
export function vaultStep(cast: CastData, currentId: string, by: number): string | null {
  const order = vaultOrder(cast, { keep: currentId });
  if (order.length < 2) return null;
  const at = order.findIndex((l) => l.entry.id === currentId);
  if (at < 0) return order[0].entry.id;
  const n = order.length;
  return order[(((at + by) % n) + n) % n].entry.id;
}

/** Whether `l` answers `query` in the vault's list: by name, epithet, alias or role, letter case and accents aside. */
export function vaultMatches(l: Listed, query: string): boolean {
  const q = foldText(dartTrim(query));
  if (q.length === 0) return true;
  return [l.entry.name, l.profile.epithet, ...l.profile.aliases, ...l.profile.roles].some((s) => foldText(s).includes(q));
}

export const vaultWords = {
  title: 'Character Vault',
  allCharacters: 'All characters',
  previous: 'Previous character (Alt+↑)',
  next: 'Next character (Alt+↓)',
  find: 'Find a character',
  writeIn: (name: string) => `Write ${name} in`,
  moreOptions: (name: string) => `More options for ${name}`,
  /** On an archived character's page, with Restore. */
  archivedBanner:
    'This character is archived: out of the library, with everything about them kept and every reference to them ' +
    'still working.',
  restore: 'Restore',
} as const;

// ---------------------------------------------------------------------------------------------------- the header

/** The names whose mentions the header counts: their name, title and aliases (countMentions; mentionsJob). */
export function headerNames(listed: Listed): string[] {
  return [listed.entry.name, listed.profile.epithet, ...listed.profile.aliases];
}

/** The header's three figures. `mentions` is null while it is being counted ("…"). */
export function headerStats(
  listed: Listed,
  mentions: number | null,
): { label: string; value: string; tooltip: string; said: string }[] {
  const linked = listed.linkedIn.length;
  const named = listed.seenIn.length;
  const stats = [
    {
      label: 'Linked in',
      value: `${formatNumber(linked)} ${linked === 1 ? 'chapter' : 'chapters'}`,
      tooltip: 'Chapters and scenes whose text has a link to this character',
    },
    {
      label: 'In the text',
      value: `${formatNumber(named)} ${named === 1 ? 'chapter' : 'chapters'}`,
      tooltip: 'Chapters and scenes whose text has their name, an alias or their title, linked or not',
    },
    {
      label: 'Name mentions',
      value: mentions === null ? '…' : formatNumber(mentions),
      tooltip: 'Times their name, aliases or title occur in the text. Words on the page, not a count of appearances.',
    },
  ];
  return stats.map((s) => ({ ...s, said: `${s.label}: ${s.value}. ${s.tooltip}` }));
}

/** Who they are, read (the header's identity, before "Edit profile"). */
export function identityView(
  entry: Entry,
  profile: CharacterProfile,
): {
  roles: string[];
  status: string | null;
  archived: string | null;
  summary: string;
  /** The summary is missing, and "No summary yet." is said in its place. */
  noSummary: boolean;
  aliases: string | null;
  tags: string | null;
  edit: string;
} {
  return {
    roles: profile.roles,
    status: profile.status.length > 0 ? profile.status : null,
    archived: profile.archived ? 'Archived' : null,
    summary: entry.summary.length > 0 ? entry.summary : 'No summary yet.',
    noSummary: entry.summary.length === 0,
    aliases: profile.aliases.length > 0 ? `Also known as: ${profile.aliases.join(', ')}` : null,
    tags: entry.tags.length > 0 ? `Tags: ${entry.tags.join(', ')}` : null,
    edit: 'Edit profile',
  };
}

// ---------------------------------------------------------------------------------------------------- the identity form

/** The identity form's labels. Name, epithet, summary, aliases, the own status and tags are saved as typed (through
 * autosave, under `identity:<entryId>:<what>`); roles and the status chips at once. */
export const identityFormWords = {
  name: 'Name',
  /** Under the name while it is blank: the name is not saved until one is given. */
  blankName: 'A character needs a name. The name they had is kept until you give one.',
  epithet: 'Title or epithet',
  epithetHint: 'The Last Heir',
  roles: 'Narrative role (one or several)',
  ownRole: 'A role of your own',
  summary: 'Summary',
  aliases: 'Aliases and nicknames (comma separated)',
  status: 'Status',
  ownStatus: 'Your own',
  ownStatusHint: 'Imprisoned, Exiled, Ascended…',
  tags: 'Tags (comma separated)',
  done: 'Done',
} as const;

/** The role chips: the default roles, then the character's own, each marked when theirs. */
export function roleChoices(profile: CharacterProfile): { role: string; selected: boolean }[] {
  return [...new Set([...characterRoles, ...profile.roles])].map((role) => ({
    role,
    selected: profile.roles.includes(role),
  }));
}

/** The roles after a role chip is pressed (for IdentityChanges.roles). */
export function toggledRoles(profile: CharacterProfile, role: string, on: boolean): string[] {
  return on ? [...profile.roles, role] : profile.roles.filter((r) => r !== role);
}

/** The roles after a role of the author's own is entered; null when nothing was written. */
export function withOwnRole(profile: CharacterProfile, text: string): string[] | null {
  return dartTrim(text).length === 0 ? null : [...profile.roles, text];
}

/** The status chips: Alive, Deceased, Missing, Unknown, and the character's own when it is none of them; the one set
 * marked. A press stores `on ? status : ''`. */
export function statusChoices(profile: CharacterProfile): { status: string; selected: boolean }[] {
  const own = dartTrim(profile.status);
  return [...new Set([...characterStatuses, ...(own.length > 0 ? [own] : [])])].map((s) => ({
    status: s,
    selected: own === s,
  }));
}

/** What "Your own" shows: the status when it is not one of the four. */
export function ownStatusValue(profile: CharacterProfile): string {
  return characterStatuses.includes(dartTrim(profile.status)) ? '' : profile.status;
}

/** Whether a name typed may be saved (a blank one is not: the name stays until a new one is given). */
export function nameCanBeSaved(text: string): boolean {
  return dartTrim(text).length > 0;
}

/** Aliases or tags as typed, comma separated (IdentityChanges.aliases / .tags; the change cleans them). */
export function commaList(text: string): string[] {
  return text.split(',');
}

// ---------------------------------------------------------------------------------------------------- the portrait

/** Whether the portrait is a picture kept in the novel (a data URL that reads as base64); otherwise there is none, or
 * it is a web address, which is kept but not shown (the app fetches nothing from the web). */
export function isUploadedImage(image: string | null): boolean {
  if (image === null || !image.startsWith('data:image/')) return false;
  const comma = image.indexOf(',');
  if (comma < 0) return false;
  // As Dart's base64Decode accepts it: the standard or URL-safe alphabet, in whole groups of four, padded.
  const data = image.substring(comma + 1);
  return data.length % 4 === 0 && /^[A-Za-z0-9+/_-]*={0,2}$/.test(data) && !/=[^=]/.test(data);
}

/** The portrait's tools and what each says. */
export function portraitTools(entry: Entry): {
  uploaded: boolean;
  label: string;
  /** For a portrait that is a web address. */
  webNote: string | null;
  draw: string | null;
  upload: string;
  adjust: string | null;
  remove: string | null;
  removeConfirm: { title: string; message: string; confirm: string } | null;
} {
  const image = entry.image;
  const uploaded = isUploadedImage(image);
  return {
    uploaded,
    label: uploaded ? `Portrait of ${entry.name}` : `${entry.name} has no portrait: a cameo drawn from their profile`,
    webNote:
      image !== null && !uploaded
        ? 'This portrait is a web address. This app does not fetch pictures from the web, so it is kept but not shown.'
        : null,
    draw: uploaded ? null : 'Draw their face',
    upload: image === null ? 'Upload portrait' : 'Replace portrait',
    adjust: image !== null && uploaded ? 'Adjust crop' : null,
    remove: image !== null ? 'Remove portrait' : null,
    removeConfirm:
      image !== null
        ? {
            title: 'Remove the portrait?',
            message: `The picture is removed from ${entry.name}’s record. A restore point or a backup still has it.`,
            confirm: 'Remove portrait',
          }
        : null,
  };
}

/** The crop's dialog: a tap at (`x`, `y`) of a picture `width` × `height` keeps that point in view, as percentages
 * (stored rounded, by IdentityChanges.focal). */
export function focalAt(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const clamp = (n: number) => (n < 0 ? 0 : n > 100 ? 100 : n);
  return { x: clamp((x / width) * 100), y: clamp((y / height) * 100) };
}

export const focalWords = {
  title: 'Adjust the portrait’s crop',
  message:
    'Tap the part of the picture to keep in view. The whole picture is kept; this only chooses what shows when it is ' +
    'cropped.',
  label: 'Choose the point of the portrait to keep in view',
  cancel: 'Cancel',
  done: 'Done',
} as const;

// ---------------------------------------------------------------------------------------------------- the More menu

export type ProfileMenuItem = 'layout' | 'template' | 'archive' | 'delete';

/** The More menu (after the profile's other tools, on a phone): each item with its words. */
export function profileMenu(profile: CharacterProfile): { item: ProfileMenuItem; label: string }[] {
  return [
    { item: 'layout', label: 'Add sections from a layout…' },
    { item: 'template', label: 'Save this layout as a template…' },
    { item: 'archive', label: profile.archived ? 'Restore from the archive' : 'Archive' },
    { item: 'delete', label: 'Delete…' },
  ];
}

/** "Add sections from a layout": the layouts offered (CharacterChanges.applyTemplate with the one chosen). */
export function layoutChoices(cast: CastData): {
  title: string;
  message: string;
  layouts: { id: string; name: string; description: string }[];
} {
  return {
    title: 'Add sections from a layout',
    message: 'Only the sections this profile does not have yet are added. Nothing already here changes.',
    layouts: cast.templates.map((t) => ({ id: t.id, name: t.name, description: t.description })),
  };
}

/** "Save this layout as a template": the prompt (CharacterChanges.saveTemplate with the name), and what is said once
 * it is saved. */
export function saveTemplatePrompt(entry: Entry): {
  title: string;
  label: string;
  initial: string;
  hint: string;
  confirm: string;
  saved: (name: string) => string;
} {
  return {
    title: 'Save this layout as a template',
    label: 'Template name',
    initial: `${entry.name}’s layout`,
    hint: 'Its sections and the names and types of their fields, not what is written in them.',
    confirm: 'Save template',
    saved: (name) => `Saved “${name}”. It is offered when you create a character in this novel.`,
  };
}

// ---------------------------------------------------------------------------------------------------- delete

/** What refers to a character, in the order told, each as said ("1 other character’s secret names them"). */
export const referenceWords: readonly (readonly [key: string, one: string, many: string])[] = [
  ['chapters', 'chapter or scene links to them', 'chapters and scenes link to them'],
  ['relationships', 'relationship', 'relationships'],
  ['events', 'timeline event', 'timeline events'],
  ['threads', 'plot thread', 'plot threads'],
  ['links', 'link to a faction, item or other entry', 'links to factions, items and other entries'],
  ['sheets', 'system sheet', 'system sheets'],
  ['snapshots', 'progression snapshot', 'progression snapshots'],
  ['secrets', 'secret of their own', 'secrets of their own'],
  ['inSecrets', 'other character’s secret names them', 'other characters’ secrets name them'],
  ['notes', 'note', 'notes'],
];

/** The "referred to elsewhere" list: each kind that refers to them, counted. */
export function referredToElsewhere(refs: CharacterReferences): string[] {
  return referenceWords
    .filter(([key]) => refs.get(key) > 0)
    .map(([key, one, many]) => `${formatNumber(refs.get(key))} ${refs.get(key) === 1 ? one : many}`);
}

/** The delete dialog (CharacterService.references gives `refs`): its title, its lines (a bullet before each
 * reference), and its buttons. "Archive instead" (CharacterChanges.setArchived) only for a character not archived. */
export function deleteDialog(
  entry: Entry,
  profile: CharacterProfile,
  refs: CharacterReferences,
): { title: string; lines: string[]; cancel: string; archiveInstead: string | null; delete: string } {
  const said = referredToElsewhere(refs);
  return {
    title: `Delete ${entry.name}?`,
    lines: [
      `This deletes ${entry.name}: the record, the profile, and their secrets, notes and history.`,
      ...(said.length === 0
        ? ['Nothing else in the novel refers to them.']
        : [
            'They are referred to elsewhere:',
            ...said.map((s) => `•  ${s}`),
            'Their relationships, links and secrets go with them. The manuscript’s words are not touched: a linked ' +
              'name stays as plain text. Timeline events, plot threads and other characters’ secrets are kept and ' +
              'simply no longer show them.',
          ]),
      'A restore point is kept first (Settings → Restore points), so it can be brought back.',
    ],
    cancel: 'Cancel',
    archiveInstead: profile.archived ? null : 'Archive instead',
    delete: 'Delete',
  };
}

/** What is said once deleted (with Undo: CharacterService.undoDelete, then their page), or when it fails (nothing
 * changed). */
export const deletedWords = {
  deleted: (name: string) => `Deleted ${name}.`,
  undo: 'Undo',
  failed: (error: unknown) => `Deleting failed, and nothing was changed: ${String(error)}`,
} as const;
