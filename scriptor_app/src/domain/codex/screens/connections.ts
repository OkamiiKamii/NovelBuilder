// EVERY CONNECTION (FEATURES.md #219–#220): on an entry, a chapter, an event or a thread, every connection it has both
// ways, what it points at and what points at it, read from wherever each is kept. Each opens the record at the other
// end when it has a page. A connection the author recorded (`loreLinks`) shows its status and can be changed or
// removed; the rest are facts of other records, changed where they are kept. "Add a connection" asks for its kind (one
// of the 24 that read correctly from each end, or the author's own words), the other end (a record, chapter or scene,
// event or thread), each side's words, notes and status (Confirmed, Provisional, Disputed, Invalid: retconned,
// Invalid: not canon).
//
// The pure parts of flutter_app/lib/features/codex/widgets/connections_panel.dart, with the connection statuses and the
// "kept in" words of shared/domain/integrity/rules.dart. A press is returned as a change for CodexChanges.

import { localeCompare } from '../../exchange/collation';
import type { CastData } from '../../characters/castData';
import { documentLabel } from '../../characters/screens/parts';
import { entryPath } from '../../characters/screens/create';
import { type Connection, connectionsOf } from '../../model/connections';
import { EntityRef, type EntityType } from '../../model/entityRef';
import { stableSorted } from '../../reader/stableSort';
import { type CanonStatus, canonStatusOf, canonStatuses } from '../../records/canon';
import { connectionType, connectionTypes, type Link } from '../../records/link';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import type { CodexChanges } from '../codexChanges';

// -------------------------------------------------------------------------------------------- connection status

/** A stored connection's status, in the words used for connections (Dart's ConnectionStatus). */
export type ConnectionStatus = 'confirmed' | 'provisional' | 'disputed' | 'invalid';
export const connectionStatuses: readonly ConnectionStatus[] = ['confirmed', 'provisional', 'disputed', 'invalid'];
export const connectionStatusName: Readonly<Record<ConnectionStatus, string>> = {
  confirmed: 'Confirmed',
  provisional: 'Provisional',
  disputed: 'Disputed',
  invalid: 'Invalid',
};

/** The status a canon status gives a connection. */
export function statusOfCanon(canon: CanonStatus): ConnectionStatus {
  switch (canon) {
    case 'canon':
      return 'confirmed';
    case 'provisional':
      return 'provisional';
    case 'conflicting':
      return 'disputed';
    case 'retconned':
    case 'non-canon':
      return 'invalid';
  }
}

/** How a canon status reads on a connection. */
export function connectionStatusLabel(s: CanonStatus): string {
  switch (s) {
    case 'canon':
      return 'Confirmed';
    case 'provisional':
      return 'Provisional';
    case 'conflicting':
      return 'Disputed';
    case 'retconned':
      return 'Invalid: retconned';
    case 'non-canon':
      return 'Invalid: not canon';
  }
}

/** Only stored connections have a status (none said means confirmed); everything else is a fact of the records. */
export function statusOf(c: Connection): ConnectionStatus | null {
  return c.kind === 'link' ? statusOfCanon(canonStatusOf(c.canon) ?? 'canon') : null;
}

/** A sign beside each status (Material icon names), so it is never told by colour alone. */
export const statusIcon: Readonly<Record<ConnectionStatus, string>> = {
  confirmed: 'check_circle_outline',
  provisional: 'pending_outlined',
  disputed: 'help_outline',
  invalid: 'block',
};

/** Where a connection is kept, in words: "· kept in a field of an entry". */
export const sourceWords: Readonly<Record<string, string>> = {
  loreLinks: 'a connection you recorded',
  characterRelations: 'a character relationship',
  loreEntries: 'a field of an entry',
  chapters: 'a link in the manuscript’s text',
  chapterPlans: 'a chapter’s or scene’s plan',
  timelineEvents: 'a timeline event',
  plotThreads: 'a plot thread',
  systemSheets: 'a system sheet',
  systems: 'a system blueprint',
  structureMarkers: 'a structural marker',
  progressChanges: 'a progression change',
  journeys: 'a journey',
};

// ---------------------------------------------------------------------------------------------------- the panel

/** Where a record opens, when it has a page: an entry (a character's profile or the entry page), a chapter or scene
 * (in Write), an event, a relationship. Null for one without a page yet. */
export function openRecord(
  cast: CastData,
  ref: EntityRef,
): { kind: 'path'; path: string } | { kind: 'chapter'; nodeId: string } | null {
  switch (ref.type) {
    case 'entry':
      return { kind: 'path', path: entryPath(ref.id, { character: cast.model.entries.get(ref.id)?.category === 'character' }) };
    case 'node':
      return { kind: 'chapter', nodeId: ref.id };
    case 'event':
      return { kind: 'path', path: `/plan/event/${ref.id}` };
    case 'relation':
      return { kind: 'path', path: `/organize/relationship/${ref.id}` };
    default:
      return null;
  }
}

const opens = (ref: EntityRef) => ref.type === 'entry' || ref.type === 'node' || ref.type === 'event' || ref.type === 'relation';

const lower = (s: string) => (s.length === 0 ? s : `${dartToLowerCase(s[0])}${s.substring(1)}`);

/** One line of the panel: outgoing, "<label> <other>"; incoming, "<other> <label, lowered> this". */
export type ConnectionLine = {
  connection: Connection;
  outgoing: boolean;
  /** The words before the other end (outgoing), or after it (incoming: "considers a rival this"). */
  words: string;
  other: { ref: EntityRef; name: string; opens: boolean };
  /** The status chip, for a connection the author recorded. */
  status: { status: ConnectionStatus; label: string; icon: string } | null;
  keptIn: string;
  /** A stored connection: it can be changed (its link) or removed. */
  link: Link | null;
};

/** The panel for `self`: its title and every connection, by the other end's name. */
export function connectionsPanel(
  cast: CastData,
  self: EntityRef,
): { title: string; empty: string | null; add: string; lines: ConnectionLine[] } {
  const name = (ref: EntityRef) => cast.model.resolve(ref)?.label ?? 'Something deleted';
  const seen = stableSorted(connectionsOf(cast.derived.connections, self), (a, b) =>
    localeCompare(name(a.other), name(b.other)),
  );
  return {
    title: `Every connection (${seen.length})`,
    empty: seen.length === 0 ? 'Nothing points here yet, and this points at nothing.' : null,
    add: 'Add a connection',
    lines: seen.map((s) => {
      const said = s.outgoing ? s.label : s.connection.label;
      const label = said.length > 0 ? said : 'related to';
      const status = statusOf(s.connection);
      const canon = canonStatusOf(s.connection.canon) ?? 'canon';
      const stored = s.connection.kind === 'link';
      return {
        connection: s.connection,
        outgoing: s.outgoing,
        words: s.outgoing ? label : `${lower(label)} this`,
        other: { ref: s.other, name: name(s.other), opens: opens(s.other) },
        status: status === null ? null : { status, label: connectionStatusLabel(canon), icon: statusIcon[status] },
        keptIn: `· kept in ${sourceWords[s.connection.source.collection] ?? s.connection.source.collection}`,
        link: stored ? (cast.model.links.find((l) => l.id === s.connection.source.id) ?? null) : null,
      };
    }),
  };
}

export const removeConnectionDialog = {
  title: 'Remove this connection?',
  message: 'The records at both ends are not changed.',
  confirm: 'Remove',
  changeTooltip: 'Change this connection',
  removeTooltip: 'Remove this connection',
} as const;

/** Removing a stored connection (once confirmed). */
export function removeConnection(linkId: string): (c: CodexChanges) => void {
  return (c) => c.removeConnection(linkId);
}

// --------------------------------------------------------------------------------------------------- the dialog

/** The records a connection can join, by kind, for choosing the other end (chapters in book order, the rest by name),
 * leaving out `except`. */
export function connectableRecords(cast: CastData, type: EntityType, except: EntityRef): { ref: EntityRef; label: string }[] {
  const model = cast.model;
  let out: { ref: EntityRef; label: string }[];
  switch (type) {
    case 'entry':
      out = cast.entries.map((e) => ({ ref: new EntityRef('entry', e.id), label: e.name }));
      break;
    case 'node':
      out = cast.documents.map((n) => ({ ref: new EntityRef('node', n.id), label: dartTrim(documentLabel(cast, n)) }));
      break;
    case 'event':
      out = [...model.events.values()].map((e) => ({ ref: new EntityRef('event', e.id), label: e.name }));
      break;
    case 'thread':
      out = [...model.threads.values()].map((t) => ({ ref: new EntityRef('thread', t.id), label: t.title }));
      break;
    default:
      out = [];
  }
  const kept = out.filter((r) => !r.ref.equals(except));
  return type === 'node' ? kept : stableSorted(kept, (a, b) => localeCompare(a.label, b.label));
}

/** What the other end can be. */
export const otherKinds: readonly { type: EntityType; label: string }[] = [
  { type: 'entry', label: 'Character or codex entry' },
  { type: 'node', label: 'Chapter or scene' },
  { type: 'event', label: 'Timeline event' },
  { type: 'thread', label: 'Plot thread' },
];

/** The "kind of my own" choice in the kinds menu. */
export const ownKind = '\u0000own';

/** The dialog's state: its kind (a known one or `ownKind`), the author's own words for it, each side's words, notes,
 * the other end (a new connection only) and the status. */
export type ConnectionForm = {
  kind: string;
  own: string;
  label: string;
  reverse: string;
  notes: string;
  otherType: EntityType;
  to: EntityRef | null;
  canon: CanonStatus;
};

/** The dialog's starting state: a new connection ("Related to"), or the one being changed. */
export function connectionForm(editing: Link | null): ConnectionForm {
  const known = editing !== null && connectionTypes.some((t) => t.key === editing.type);
  return {
    kind: known ? editing.type! : editing === null ? 'related' : ownKind,
    own: editing !== null && !known ? (editing.type ?? '') : '',
    label: editing?.fromLabel ?? '',
    reverse: editing?.toLabel ?? '',
    notes: editing?.notes ?? '',
    otherType: 'entry',
    to: null,
    canon: editing?.canon ?? 'canon',
  };
}

/** The kind the form names: the chosen one, or the author's own words. */
export function formType(form: ConnectionForm): string {
  return form.kind === ownKind ? dartTrim(form.own) : form.kind;
}

/** How a kind of connection reads from the other end, in words. */
export function connectionReads(type: string): string {
  const kind = connectionType(type.length === 0 ? null : type);
  return kind.reciprocal
    ? 'Reads the same from both ends.'
    : kind.inverse !== null
      ? `From the other end it reads “${kind.inverse}”.`
      : 'One-sided: it says nothing about what the other side thinks. Add their own connection if they have one.';
}

/** The dialog as shown for `form`. */
export function connectionDialog(
  cast: CastData,
  from: EntityRef,
  editing: Link | null,
  form: ConnectionForm,
): {
  title: string;
  fromLine: string;
  kinds: { value: string; label: string }[];
  ownLabel: string | null;
  ownHint: string;
  reads: string;
  otherKinds: typeof otherKinds | null;
  options: { ref: EntityRef; label: string }[] | null;
  nothingOfThatKind: string | null;
  labelLabel: string;
  labelHint: string;
  reverseLabel: string;
  reverseHelper: string;
  notesLabel: string;
  statuses: { value: CanonStatus; label: string }[];
  ready: boolean;
  confirm: string;
} {
  const type = formType(form);
  const kind = connectionType(type.length === 0 ? null : type);
  const selfName = cast.model.resolve(from)?.label ?? 'This';
  const options = editing === null ? connectableRecords(cast, form.otherType, from) : null;
  return {
    title: editing === null ? 'Add a connection' : 'Change the connection',
    fromLine: `From ${selfName}`,
    kinds: [
      ...connectionTypes.map((t) => ({ value: t.key, label: t.label })),
      { value: ownKind, label: 'A kind of my own…' },
    ],
    ownLabel: form.kind === ownKind ? 'Your kind, kept as written' : null,
    ownHint: 'sworn enemy of',
    reads: connectionReads(type),
    otherKinds: editing === null ? otherKinds : null,
    options,
    nothingOfThatKind: options !== null && options.length === 0 ? 'There is nothing of that kind in this novel yet.' : null,
    labelLabel: `How ${selfName} puts it (optional)`,
    labelHint: kind.label,
    reverseLabel: 'How the other end puts it (optional)',
    reverseHelper: 'Only if they say so: nobody’s opinion is guessed.',
    notesLabel: 'Notes',
    statuses: canonStatuses.map((s) => ({ value: s, label: connectionStatusLabel(s) })),
    ready: (editing !== null || form.to !== null) && type.length > 0,
    confirm: editing === null ? 'Connect' : 'Save',
  };
}

/** What Connect or Save changes: a new connection from `from`, or the one being changed. Confirmed is stored as no
 * status. */
export function saveConnection(from: EntityRef, editing: Link | null, form: ConnectionForm): (c: CodexChanges) => Link {
  const type = formType(form);
  const canon = form.canon === 'canon' ? null : form.canon;
  if (editing === null) {
    return (c) =>
      c.createConnection({
        from,
        to: form.to!,
        type,
        label: form.label,
        reverseLabel: form.reverse,
        notes: form.notes,
        canon,
      });
  }
  return (c) =>
    c.updateConnection(editing.id, {
      type,
      label: form.label,
      reverseLabel: form.reverse,
      notes: form.notes,
      canon: { value: canon },
    });
}
