// ENTRANCES, a view of the cast (entrances.ts reads it): the book as a row of doors, a door a chapter, with who first
// comes through each; then the cast IN ORDER OF APPEARANCE, as a playbill: each one's entrance, the sentence they enter
// in, and what that first moment gives the reader (seen, speaks, acts, in their head, or nothing but a name), with
// **Read it there**. Under it, what an editor would say: a crowded door, those who enter with only a name, a lead who
// comes late, those talked of before they appear, and who is not on the page yet. It only reads.
//
// The pure parts of flutter_app/lib/features/characters/widgets/entrances_view.dart: what to read (`entrancesReading`,
// then entrancesJob(service.storedChapters(novelId), order, people)) and what is shown of it.
//
// THE DOORS: 74 high, a door a chapter in equal widths (test key `door-<n>`), each 1 in from its neighbours, an arch
// (its top corners rounded by half its width) bordered left, top and right (2 wide in the accent when picked, else 1 in
// outline, outlineVariant at 35% when no one enters), filled tertiaryContainer at 70% when crowded, the accent at 12%
// when picked. In it, from the foot, a bead (a circle of width - 4, 3 to 11, castTone, a 0.8 ring of the surface) for
// each who enters, at most five (four and "+n" over them when more); under the doors a rule (2, outline at 60%), and
// "Chapter 1" and "Chapter n" at either end (11.5). THE PLAYBILL: in a frame, "IN ORDER OF APPEARANCE" (15, bold, the
// accent, spacing 2.4) over a short rule (64 × 1.5); each line: its number (16, bold, the accent, right-aligned in 28),
// a cameo of 40 × 48 (radius 9; a press opens them), the name in capitals (15, bold, spacing 1.2) with "Ch. n" (13.5) at
// the right, the chips (12.5, an icon of 13; a warning chip on tertiaryContainer, else the accent at 10%, radius 20),
// the sentence (14.5, italic, four lines), "Talked of first in chapter n." (13), and **Read it there**.

import { plural } from '../../desk/format';
import { dartToUpperCase } from '../../exchange/dartUpperCase';
import { dartToLowerCase } from '../../text/dartString';
import { type Listed } from '../cast';
import { type CastData } from '../castData';
import { type EyesPerson } from '../castNames';
import { type Entrance, type Entrances, crowdedChapter } from '../entrances';
import { characterPath } from '../screens/create';
import { andList } from './common';
import { type ReadThere, bookReading, readThere } from './readings';

/** What to read: the chapters' ids in reading order, the cast, and the key the reading is kept by. */
export function entrancesReading(cast: CastData): { order: string[]; people: EyesPerson[]; key: string } {
  const { nodes, people, key } = bookReading(cast);
  return { order: nodes.map((n) => n.id), people, key };
}

/** Whether a role makes a lead: a protagonist or antagonist (any role naming one), a lead, a main character. */
export function isLeadRole(roles: readonly string[]): boolean {
  return roles.some((r) => {
    const role = dartToLowerCase(r);
    return role.includes('protagonist') || role.includes('antagonist') || role === 'lead' || role === 'main character';
  });
}

/** A door: the chapter, who first comes through it (their ids, in order), and how it is drawn. */
export type Door = {
  chapter: number;
  key: string;
  ids: string[];
  /** The beads shown, from the foot up (the first to enter at the foot), and the "+n" over them, or null. */
  beads: string[];
  more: string | null;
  picked: boolean;
  crowded: boolean;
};

/** The doors, a door a chapter. */
export function doors(read: Entrances, picked: number | null): { doors: Door[]; semanticsLabel: string; last: string | null } {
  const byChapter = new Map<number, string[]>();
  for (const e of read.order) {
    let ids = byChapter.get(e.at.chapter);
    if (ids === undefined) byChapter.set(e.at.chapter, (ids = []));
    ids.push(e.id);
  }
  const most = 5;
  const count = read.perChapter.length;
  const out: Door[] = [];
  for (let c = 1; c <= count; c++) {
    const ids = byChapter.get(c) ?? [];
    out.push({
      chapter: c,
      key: `door-${c}`,
      ids,
      beads: ids.slice(0, ids.length > most ? most - 1 : most),
      more: ids.length > most ? `+${ids.length - most + 1}` : null,
      picked: picked === c,
      crowded: read.perChapter[c - 1] >= crowdedChapter,
    });
  }
  return {
    doors: out,
    semanticsLabel: `Entrances by chapter: ${[...byChapter].map(([c, ids]) => `chapter ${c}, ${ids.length}`).join('; ')}`,
    last: count > 1 ? `Chapter ${count}` : null,
  };
}

/** A chip of what an entrance gives (a warning for one only talked of, or only named). */
export type EntranceChip = { icon: string; label: string; warn: boolean };

/** One line of the playbill. */
export type Billing = {
  entrance: Entrance;
  listed: Listed;
  key: string;
  number: string;
  name: string;
  chapter: string;
  chips: EntranceChip[];
  sentence: string;
  talkedFirst: string | null;
  path: string;
  read: ReadThere;
  button: string;
};

function billing(e: Entrance, l: Listed, number: number): Billing {
  const chips: EntranceChip[] = [
    ...(!e.onStage ? [{ icon: 'record_voice_over_outlined', label: 'Only talked of', warn: true }] : []),
    ...(e.onStage && e.gives.size === 0 ? [{ icon: 'label_outline', label: 'Only named', warn: true }] : []),
    ...(e.gives.has('seen') ? [{ icon: 'face_outlined', label: 'Seen', warn: false }] : []),
    ...(e.gives.has('speaks') ? [{ icon: 'chat_bubble_outline', label: 'Speaks', warn: false }] : []),
    ...(e.gives.has('acts') ? [{ icon: 'directions_run', label: 'Acts', warn: false }] : []),
    ...(e.gives.has('thinks') ? [{ icon: 'psychology_outlined', label: 'In their head', warn: false }] : []),
  ];
  return {
    entrance: e,
    listed: l,
    key: `entrance-${e.id}`,
    number: `${number}.`,
    name: dartToUpperCase(l.entry.name),
    chapter: `Ch. ${e.at.chapter}`,
    chips,
    sentence: `${e.onStage ? 'Enters' : 'Spoken of'}: “${e.at.sentence}”`,
    talkedFirst:
      e.onStage && e.talkedOf !== null && e.talkedOf.chapter < e.at.chapter
        ? `Talked of first in chapter ${e.talkedOf.chapter}.`
        : null,
    path: characterPath(e.id),
    read: readThere(e.at.nodeId, e.at.sentence, e.at.block),
    button: 'Read it there',
  };
}

/** A note of what an editor would say, with its icon. */
export type EntranceNote = { icon: string; text: string };

/** The view, once read (`read`: what entrancesJob gave). `door`: the chapter pressed, or null. */
export function castEntrances(
  cast: CastData,
  read: Entrances,
  door: number | null,
):
  | { empty: string }
  | {
      caption: string;
      doors: ReturnType<typeof doors>;
      hint: string;
      heading: string;
      none: string | null;
      billing: Billing[];
      editor: string | null;
      notes: EntranceNote[];
    } {
  const byId = new Map(cast.list.map((l) => [l.entry.id, l]));
  const nameOf = (id: string) => byId.get(id)?.entry.name ?? 'Someone';
  if (read.order.length === 0) {
    return {
      empty:
        read.perChapter.length === 0
          ? 'No chapter has words yet. Once there are, the cast is read in the order a reader meets them.'
          : 'No one in the cast is named in the chapters yet. Write one of them onto the page, and their entrance is ' +
            'here.',
    };
  }
  const shown = door === null ? read.order : read.order.filter((e) => e.at.chapter === door);
  const bare = read.order.filter((e) => e.onStage && e.gives.size === 0).map((e) => e.id);
  const chapters = read.perChapter.length;
  const lateFrom = chapters >= 4 ? Math.ceil(chapters / 4) + 1 : 1 << 30;
  const late = read.order.filter((e) => e.at.chapter >= lateFrom && isLeadRole(byId.get(e.id)?.profile.roles ?? []));
  const promised = read.order.filter((e) => e.onStage && e.talkedOf !== null && e.talkedOf.chapter < e.at.chapter);
  const crowdedChapters = read.perChapter
    .map((n, i) => ({ chapter: i + 1, count: n }))
    .filter((c) => c.count >= crowdedChapter);

  const notes: EntranceNote[] = [];
  for (const c of read.crowds) {
    notes.push({
      icon: 'groups_outlined',
      text:
        `Chapter ${c.chapter}, one paragraph: ${andList(c.ids.map(nameOf))} all enter at once. ` +
        `A reader meets ${c.ids.length} new people in a breath; one at a time, each is remembered.`,
    });
  }
  for (const c of crowdedChapters) {
    notes.push({
      icon: 'door_front_door_outlined',
      text: `Chapter ${c.chapter} brings on ${c.count} new people. A crowded door: could some wait a chapter?`,
    });
  }
  if (bare.length > 0) {
    notes.push({
      icon: 'label_outline',
      text:
        `${andList(bare.map(nameOf))} ${bare.length === 1 ? 'enters' : 'enter'} with nothing but a name. ` +
        'A look, a line or something done gives the reader someone to hold.',
    });
  }
  for (const e of late) {
    notes.push({
      icon: 'schedule',
      text:
        `${nameOf(e.id)} (${byId.get(e.id)!.profile.roles.find((r) => isLeadRole([r]))}) first steps on in ` +
        `chapter ${e.at.chapter} of ${chapters}.`,
    });
  }
  if (promised.length > 0) {
    notes.push({
      icon: 'record_voice_over_outlined',
      text:
        `Talked of before they appear: ${andList(promised.map((e) => `${nameOf(e.id)} (chapter ${e.talkedOf!.chapter}, on the page in ${e.at.chapter})`))}. ` +
        'A promise the reader waits for.',
    });
  }
  if (read.unseen.length > 0) {
    notes.push({
      icon: 'theater_comedy_outlined',
      text: `Waiting in the wings, not on the page yet: ${andList(read.unseen.map(nameOf))}.`,
    });
  }
  const anyNote =
    read.crowds.length > 0 ||
    crowdedChapters.length > 0 ||
    bare.length > 0 ||
    late.length > 0 ||
    promised.length > 0 ||
    read.unseen.length > 0;

  return {
    caption:
      'The cast in the order a reader meets them: where each first steps onto the page, and what that first moment ' +
      'gives the reader to hold on to.',
    doors: doors(read, door),
    hint:
      door === null
        ? 'A door a chapter, and who first comes through it. Press one to see only them.'
        : `Chapter ${door}: ${plural(shown.length, 'entrance')}. Press it again for the whole cast.`,
    heading: 'IN ORDER OF APPEARANCE',
    none: shown.length === 0 ? `No one first comes on in chapter ${door}.` : null,
    billing: shown.flatMap((e) => {
      const l = byId.get(e.id);
      return l === undefined ? [] : [billing(e, l, read.order.indexOf(e) + 1)];
    }),
    editor: anyNote ? 'WHAT AN EDITOR WOULD SAY' : null,
    notes,
  };
}

/** A door pressed: the chapter picked after it (the same again unpicks it). */
export function doorPicked(door: number | null, chapter: number): number | null {
  return door === chapter ? null : chapter;
}
