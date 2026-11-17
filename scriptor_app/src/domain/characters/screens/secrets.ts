// THE SECRETS TAB: a character's secrets. What is true, what the character knows, what others know and what the reader
// knows are kept apart for each one. This organises the story; it is not a lock. The pure parts of
// flutter_app/lib/features/characters/tabs/secrets_tab.dart.
//
// What a press changes: a new secret, CharacterChanges.saveSecret(entryId, null, { title }); a card's fields,
// saveSecret(entryId, secretId, { <stored name>: value }): the title, the truth and the notes as typed (autosave, under
// `secret:<secretId>:<what>`; a blank title is not saved), everything else at once; deleting, removeSecret(secretId).

import { type JsonMap } from '../../json';
import { strings } from '../../records/jsonRecord';
import { type Entry } from '../../records/entry';
import { dartTrim } from '../../text/dartString';
import { type CastData } from '../castData';
import {
  type CharacterSecret,
  type Knowledge,
  type KnowledgeNeed,
  type KnowledgeRecord,
  awarenessLabel,
  knowledgeLabel,
  knowledges,
  secretStatuses,
} from '../characterRecords';
import { currentOf, stateWords, whoKnowsWhat } from '../knowledge';
import { type Choice, documentChooser, documentName, documentOptions, goneChoice, idPicker } from './parts';

export const secretsWords = {
  intro: (name: string) =>
    `What is true, what ${name} knows, what others know and what the reader knows are kept apart for each secret.`,
  newSecret: 'A new secret',
  newSecretHint: 'Hidden parentage',
  add: 'Add secret',
  empty: 'No secrets recorded.',
  secret: 'Secret',
  status: 'Status',
  truth: 'What is true',
  truthHint: 'The fact itself, as it is in the story.',
  whoKnows: 'Who knows',
  reader: 'The reader',
  readerKnows: 'What the reader knows',
  readerFrom: '…from this chapter on',
  inTheStory: 'In the story',
  firstAppears: 'First appears',
  revealedIn: 'Revealed in',
  revealEvent: 'Reveal event',
  relatedChapters: 'Related chapters',
  relatedThreads: 'Related plot threads',
  spreads: 'How knowledge spreads (recorded)',
  spreadsNote:
    'Recorded with the original app, in the order things happen to each character. Kept exactly as they are; editing ' +
    'them comes with the continuity review.',
  notes: 'Private author notes',
} as const;

/** A secret's delete button and its question. */
export function deleteSecretWords(secret: CharacterSecret): {
  tooltip: string;
  title: string;
  message: string;
  confirm: string;
} {
  return {
    tooltip: `Delete the secret ${secret.title}`,
    title: `Delete the secret “${secret.title}”?`,
    message: 'What is written about it, and who knows it, go with it.',
    confirm: 'Delete secret',
  };
}

/** The choices of a "does … know" menu. */
export const knowledgeChoices: readonly Choice<Knowledge>[] = knowledges.map((k) => ({ value: k, label: knowledgeLabel[k] }));

/** A record read aloud: "Mira suspects (“…”) in The Feast: overheard, from Kai." (the tab's own wording, by chapter
 * title). */
export function secretRecordWords(cast: CastData, r: KnowledgeRecord): string {
  const name = (id: string) => cast.nameOf(id) ?? 'Someone deleted';
  const state = r.state;
  const where = [
    ...(r.nodeId !== null && cast.model.nodes.has(r.nodeId) ? [`in ${documentName(cast, r.nodeId)}`] : []),
    ...(r.eventId !== null && cast.model.events.has(r.eventId) ? [`at “${cast.model.events.get(r.eventId)!.name}”`] : []),
  ];
  const how = [
    ...(dartTrim(r.how).length > 0 ? [dartTrim(r.how)] : []),
    ...(r.fromId !== null ? [`from ${name(r.fromId)}`] : []),
  ].join(', ');
  return (
    `${name(r.characterId)} ${state === null ? 'has a state this version does not know' : stateWords(state, r.belief)} ` +
    `${where.length === 0 ? 'with no chapter or event given' : where.join(', ')}${how.length === 0 ? '' : `: ${how}`}`
  );
}

/** A mark that they act on it, read aloud. */
export function secretNeedWords(cast: CastData, n: KnowledgeNeed): string {
  const name = (id: string) => cast.nameOf(id) ?? 'Someone deleted';
  return (
    `•  ${name(n.characterId)} acts on it` +
    `${n.nodeId !== null ? ` in ${documentName(cast, n.nodeId)}` : ''}` +
    `${n.eventId !== null && cast.model.events.has(n.eventId) ? ` at “${cast.model.events.get(n.eventId)!.name}”` : ''}` +
    `${dartTrim(n.note).length > 0 ? `: ${dartTrim(n.note)}` : ''}`
  );
}

/** One secret's card, as data. Each `pick` gives the changes for saveSecret. */
export function secretCard(
  cast: CastData,
  entry: Entry,
  secret: CharacterSecret,
): {
  statuses: Choice<string>[];
  /** Their own knowledge: a menu, or, when their knowledge has a recorded history, a line saying where it stands. */
  self: { menu: { label: string; value: Knowledge } | null; line: string | null };
  /** The three lists, each a choice of the other characters without a recorded history. */
  lists: { key: Knowledge; label: string; picker: ReturnType<typeof idPicker> }[];
  /** Those kept in their recorded history, said. */
  withHistory: string | null;
  /** "Now: Knows: Mira · Not recorded: Tam". */
  now: string | null;
  reader: { value: Knowledge; from: ReturnType<typeof documentChooser> };
  first: ReturnType<typeof documentChooser>;
  reveal: ReturnType<typeof documentChooser>;
  /** The reveal event: offered when the novel has events, or one is set. */
  revealEvent: { selected: string; items: Choice<string>[]; pick: (v: string | null) => JsonMap | null } | null;
  chapters: ReturnType<typeof idPicker>;
  /** Offered when the novel has threads, or some are set. */
  threads: ReturnType<typeof idPicker> | null;
  /** The recorded spread, read aloud, when there is any. */
  spread: { records: string[]; needs: string[] } | null;
} {
  const name = (id: string) => cast.nameOf(id) ?? 'Someone deleted';
  // Someone whose knowledge has a recorded history is kept in it, not in the lists.
  const recorded = new Set(secret.records.map((r) => r.characterId));
  const others = cast.characters({ except: entry.id });
  const people = others.filter((p) => !recorded.has(p.id)).map((p) => ({ value: p.id, label: p.name }));
  const withHistory = others.filter((p) => recorded.has(p.id)).map((p) => p.name);
  const events = [...cast.model.events.values()];
  const threads = [...cast.model.threads.values()];
  const groups = whoKnowsWhat(secret);
  const revealEventId = secret.revealEventId;
  const eventKnown = revealEventId === null || cast.model.events.has(revealEventId);
  return {
    statuses: [...new Set([...secretStatuses, secret.status])].map((s) => ({ value: s, label: s })),
    self: recorded.has(entry.id)
      ? {
          menu: null,
          line:
            `Does ${entry.name} know? ${(() => {
              const state = currentOf(secret, entry.id).state;
              return state === null ? 'Not recorded' : awarenessLabel[state];
            })()} (from their recorded history below)`,
        }
      : { menu: { label: `Does ${entry.name} know?`, value: secret.self }, line: null },
    lists: (
      [
        ['knows', 'Characters who know'],
        ['suspects', 'Characters who suspect'],
        ['unaware', 'Characters who are unaware'],
      ] as const
    ).map(([key, label]) => ({
      key,
      label,
      picker: idPicker({ label, chosen: strings(secret.raw[key]), options: people, nameOf: (id) => cast.nameOf(id) }),
    })),
    withHistory:
      withHistory.length === 0
        ? null
        : `${withHistory.join(', ')} ${withHistory.length === 1 ? 'has' : 'have'} a recorded history, kept below as it is.`,
    now:
      groups.length === 0
        ? null
        : `Now: ${groups
            .map((g) => `${g.state === null ? 'Not recorded' : awarenessLabel[g.state]}: ${g.ids.map(name).join(', ')}`)
            .join(' · ')}`,
    reader: { value: secret.reader, from: documentChooser(cast, secret.readerNodeId) },
    first: documentChooser(cast, secret.firstNodeId),
    reveal: documentChooser(cast, secret.revealNodeId),
    revealEvent:
      events.length > 0 || revealEventId !== null
        ? {
            selected: eventKnown ? (revealEventId ?? '') : goneChoice,
            items: [
              { value: '', label: 'Not set' },
              ...(eventKnown ? [] : [{ value: goneChoice, label: 'A deleted event' }]),
              ...events.map((e) => ({ value: e.id, label: e.name })),
            ],
            pick: (v) => (v === goneChoice ? null : { revealEventId: v === null || v.length === 0 ? null : v }),
          }
        : null,
    chapters: idPicker({
      label: secretsWords.relatedChapters,
      chosen: secret.nodeIds,
      options: documentOptions(cast),
      nameOf: (id) => cast.model.nodes.get(id)?.displayTitle ?? null,
    }),
    threads:
      threads.length > 0 || secret.threadIds.length > 0
        ? idPicker({
            label: secretsWords.relatedThreads,
            chosen: secret.threadIds,
            options: threads.map((t) => ({ value: t.id, label: t.title.length === 0 ? 'An untitled thread' : t.title })),
          })
        : null,
    spread:
      secret.records.length > 0 || secret.needs.length > 0
        ? {
            records: secret.records.map((r) => `•  ${secretRecordWords(cast, r)}`),
            needs: secret.needs.map((n) => secretNeedWords(cast, n)),
          }
        : null,
  };
}
