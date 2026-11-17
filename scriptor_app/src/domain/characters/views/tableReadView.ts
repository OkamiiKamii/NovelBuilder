// THE TABLE READ, a view of the cast (tableRead.ts reads it): a chapter as a script, every line under the name of the
// one who says it and the narration between, and read aloud by the cast, each in a voice of their own (a pitch spread
// across the cast, which the author may set higher or lower, kept for the novel), the narration in the device's own.
// Play reads from the part lit; a press on a part reads from there. A line no one is named saying is marked: a reader
// cannot tell who says it either. It reads only; the voices are the device's own (src/data/speech.ts), and with none
// the script is still there to read.
//
// The pure parts of flutter_app/lib/features/characters/widgets/table_read_view.dart: the chapters offered, what to
// read (`tableReadReading`, then tableReadJob(service.storedChapters(novelId), chapter, people, { genders })), the
// voices, what is shown, and the reading aloud as a small machine (`TableReadPlayer`).
//
// A voice chip: the high surface, radius 28, a border of castTone at 60%; a round cameo of 30, "<name> · <word>" (14,
// one line), and lower / raise (remove and add icons, 18; off at the bounds). A part (test key `part-<i>`): 6 apart,
// 6/8 in (24 on the left for a line), radius 8; lit (the accent at 14%, a 3 wide rule of it on the left) when it is the
// one being read; a line its speaker in capitals (12, bold, spacing 1.4; in their colour, or error for one no one is
// named saying) over the words (16.5); narration in italic (14.5, onSurfaceVariant).

import { type StoryNode } from '../../records/storyNode';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { dartToUpperCase } from '../../exchange/dartUpperCase';
import { type Listed, fieldNamed } from '../cast';
import { type CastData } from '../castData';
import { type EyesPerson } from '../castNames';
import {
  type CastVoice,
  type ReadPart,
  castVoices,
  highestPitch,
  lowestPitch,
  narratorVoice,
  voiceWord,
} from '../tableRead';
import { castTone } from '../screens/library';
import { bookDocuments, bookPeople } from './readings';

/** Where the author's voice for each speaker is kept, per novel: each one's steps higher or lower. */
export const tableReadVoicesKey = (novelId: string): string => `tableread.voices.${novelId}`;

/** The chapters offered: chapters and scenes with words, in reading order. */
export function tableReadChapters(cast: CastData): StoryNode[] {
  return bookDocuments(cast).filter((n) => n.wordCount > 0);
}

/** The chapter read: the one chosen while it is offered, else the first. Null with none offered. */
export function tableReadChapter(chapters: readonly StoryNode[], chosen: string | null): string | null {
  if (chapters.length === 0) return null;
  return chapters.some((c) => c.id === chosen) ? chosen : chapters[0].id;
}

/** The chapter chooser (test key `table-chapter-<id>`): each by its title, or "Chapter n" (its place in the list). */
export function chapterChoices(chapters: readonly StoryNode[]): { value: string; label: string }[] {
  return chapters.map((c, i) => ({ value: c.id, label: dartTrim(c.title).length === 0 ? `Chapter ${i + 1}` : dartTrim(c.title) }));
}

/** Everyone's gender, by id (their Gender field), for "he said" and "she said". */
export function gendersOf(cast: CastData): Map<string, string> {
  return new Map(cast.list.map((l) => [l.entry.id, fieldNamed(l.entry, 'Gender')]));
}

/** What to read for `chapter`: the cast, their genders, and the key the reading is kept by. */
export function tableReadReading(cast: CastData, chapter: string): { people: EyesPerson[]; genders: Map<string, string>; key: string } {
  const people = bookPeople(cast);
  return {
    people,
    genders: gendersOf(cast),
    key: `${chapter}\u0000${people.map((p) => `${p.id}:${p.names.join('|')}`).join(',')}\u0000${cast.list
      .map((l) => fieldNamed(l.entry, 'Gender'))
      .join(',')}`,
  };
}

/** The steps each voice is set higher or lower, from what is stored under tableReadVoicesKey (whole numbers only). */
export function nudgedOf(stored: unknown): Map<string, number> {
  const out = new Map<string, number>();
  if (typeof stored === 'object' && stored !== null && !Array.isArray(stored)) {
    for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isInteger(value)) out.set(key, value);
    }
  }
  return out;
}

/** What to store under tableReadVoicesKey when `id`'s voice is set `by` a step (1 higher, -1 lower). */
export function nudgedAfter(stored: unknown, id: string, by: number): Record<string, number> {
  const nudged = nudgedOf(stored);
  nudged.set(id, (nudged.get(id) ?? 0) + by);
  return Object.fromEntries(nudged);
}

/** The voices of those who speak in `parts`, in the order first heard (castVoices groups them). */
export function partVoices(cast: CastData, parts: readonly ReadPart[], stored: unknown): Map<string, CastVoice> {
  const byId = new Map(cast.list.map((l) => [l.entry.id, l]));
  const heard: string[] = [];
  for (const p of parts) if (p.speaker !== null && !heard.includes(p.speaker)) heard.push(p.speaker);
  return castVoices(
    heard.map((id) => {
      const l = byId.get(id);
      return { id, gender: l === undefined ? '' : fieldNamed(l.entry, 'Gender') };
    }),
    { nudged: nudgedOf(stored) },
  );
}

/** The voice a part is read in: its speaker's for a line, the device's own for the rest. */
export function voiceFor(part: ReadPart, voices: ReadonlyMap<string, CastVoice>): CastVoice {
  return part.line && part.speaker !== null ? (voices.get(part.speaker) ?? narratorVoice) : narratorVoice;
}

/** One part of the script as shown. */
export type ScriptPart = {
  part: ReadPart;
  key: string;
  listed: Listed | null;
  /** Whose line: their name in capitals ("(likely)" when followed, not named), "WHO SAYS THIS?", or "SOMEONE" (one no
   * longer in the cast); null for the narration. */
  who: string | null;
  /** The colour the name is in: theirs (`#rrggbb`), or null for the theme's error. */
  colour: string | null;
  semanticsLabel: string;
  lit: boolean;
};

/** A speaker's voice chip: their name and how they sound, and the presses lower and higher (off at the bounds). */
export type VoiceChip = {
  id: string;
  listed: Listed;
  voice: CastVoice;
  key: string;
  label: string;
  tone: string;
  lower: { tooltip: string; enabled: boolean };
  higher: { tooltip: string; enabled: boolean };
};

/** The script of a chapter read: the voices (by group, as castVoices gives them), what is said of its lines (in
 * onSurfaceVariant when `saidPlain`, else onSurface), and its parts. */
export type TableScript = {
  voicesHeading: string | null;
  voices: VoiceChip[];
  said: string;
  saidPlain: boolean;
  parts: ScriptPart[];
};

/** The view: with no chapter to read, the line said; else the chooser, the play controls, the voices, what is said of
 * the lines, and the script. `parts`: what was read (null while it is read); `at` and `playing`: where the reading
 * aloud is; `voiced`: whether the device can read aloud (null while it is asked). */
export function castTableRead(
  cast: CastData,
  options: {
    chosen: string | null;
    parts: readonly ReadPart[] | null;
    stored: unknown;
    at: number;
    playing: boolean;
    voiced: boolean | null;
  },
):
  | { empty: string }
  | {
      caption: string;
      chapter: string;
      chooser: { label: string; key: string; choices: { value: string; label: string }[] };
      play: { key: string; label: string; icon: string; enabled: boolean } | null;
      fromStart: string | null;
      noVoice: string | null;
      /** While the chapter is read: null (the skeleton, "Reading the book…"). */
      script: TableScript | null;
    } {
  const chapters = tableReadChapters(cast);
  const chapter = tableReadChapter(chapters, options.chosen);
  if (chapter === null) {
    return {
      empty:
        'No chapter has words yet. Once one has, its dialogue can be read here by the cast, each in a voice of their ' +
        'own.',
    };
  }
  const { parts, at, playing, voiced } = options;
  const byId = new Map(cast.list.map((l) => [l.entry.id, l]));
  const voices = parts === null ? new Map<string, CastVoice>() : partVoices(cast, parts, options.stored);
  let script: TableScript | null = null;
  if (parts !== null) {
    const unknown = parts.filter((p) => p.line && p.speaker === null).length;
    const likely = parts.filter((p) => p.line && p.likely).length;
    const lines = parts.filter((p) => p.line).length;
    const shown: VoiceChip[] = [];
    for (const [id, v] of voices) {
      const l = byId.get(id);
      if (l === undefined) continue;
      const name = l.entry.name;
      shown.push({
        id,
        listed: l,
        voice: v,
        key: `voice-${id}`,
        label: `${name} · ${voiceWord(v)}`,
        tone: castTone(id),
        lower: { tooltip: `Lower ${name}’s voice`, enabled: v.pitch > lowestPitch },
        higher: { tooltip: `Raise ${name}’s voice`, enabled: v.pitch < highestPitch },
      });
    }
    script = {
      voicesHeading: voices.size > 0 ? 'THE CAST’S VOICES' : null,
      voices: voices.size > 0 ? shown : [],
      said:
        lines === 0
          ? 'No one speaks in this chapter: it is all narration.'
          : [
              unknown === 0
                ? `A reader can tell who says each of its ${lines} lines.`
                : `${unknown} of its ${lines} lines cannot be told whose they are: marked “Who says this?” below. ` +
                  'A reader may not know who speaks either.',
              ...(likely > 0
                ? [
                    `${likely} ${likely === 1 ? 'is' : 'are'} followed from the talk (“she said”, who acts, ` +
                      'whose turn it is), marked “likely”.',
                  ]
                : []),
            ].join(' '),
      saidPlain: unknown === 0,
      parts: parts.map((p, i) => {
        const listed = p.speaker === null ? null : (byId.get(p.speaker) ?? null);
        const who = p.line
          ? listed === null
            ? p.speaker === null
              ? 'WHO SAYS THIS?'
              : 'SOMEONE'
            : `${dartToUpperCase(listed.entry.name)}${p.likely ? ' (likely)' : ''}`
          : null;
        return {
          part: p,
          key: `part-${i}`,
          listed,
          who,
          colour: p.line && listed !== null ? castTone(listed.entry.id) : null,
          semanticsLabel: p.line ? `${dartToLowerCase(who!)}: ${p.text}` : p.text,
          lit: i === at && (playing || at > 0),
        };
      }),
    };
  }
  return {
    caption:
      'A chapter as a script, read aloud by the cast: each line in the voice of the one who says it. Hear whether they ' +
      'sound like themselves, and whether a reader can tell who is speaking.',
    chapter,
    chooser: { label: 'Chapter', key: `table-chapter-${chapter}`, choices: chapterChoices(chapters) },
    play:
      parts !== null && parts.length > 0 && voiced !== false
        ? {
            key: 'table-play',
            label: playing ? 'Pause' : at === 0 ? 'Read it aloud' : 'Go on',
            icon: playing ? 'pause' : 'play_arrow',
            enabled: voiced !== null,
          }
        : null,
    fromStart: at > 0 ? 'From the start' : null,
    noVoice: voiced === false ? 'This device has no voice to read with. The script is here to read all the same.' : null,
    script,
  };
}

/** What the reading aloud needs of the device's voice (src/data/speech.ts's Speaker). */
export type TableReadSpeaker = {
  say(text: string, options?: { rate?: number; pitch?: number }): Promise<boolean>;
  stop(): Promise<void>;
};

/** THE READING ALOUD: from the part lit to the end, each part in its voice; a pause stops it where it is; a part
 * pressed reads from there (going on reading if it was); the end goes back to the start. A part the device could not
 * say stops it and says the device has no voice (`voiced` false). `changed` is told after each step, to draw it. */
export class TableReadPlayer {
  at = 0;
  playing = false;
  voiced: boolean | null = null;

  constructor(
    private readonly speaker: TableReadSpeaker,
    private readonly changed: () => void,
  ) {}

  /** Plays `parts` from `at`. */
  async play(parts: readonly ReadPart[], voices: ReadonlyMap<string, CastVoice>): Promise<void> {
    this.playing = true;
    this.changed();
    while (this.playing && this.at < parts.length) {
      const p = parts[this.at];
      const v = voiceFor(p, voices);
      const said = await this.speaker.say(p.text, { rate: v.rate, pitch: v.pitch });
      if (!this.playing) return;
      if (!said) {
        this.playing = false;
        this.voiced = false;
        this.changed();
        return;
      }
      this.at++;
      this.changed();
    }
    this.playing = false;
    if (this.at >= parts.length) this.at = 0;
    this.changed();
  }

  /** Pause: silence, where it is. */
  pause(): void {
    this.playing = false;
    this.changed();
    void this.speaker.stop();
  }

  /** From part `i` (the start: 0), going on reading if it was. */
  from(i: number, parts: readonly ReadPart[], voices: ReadonlyMap<string, CastVoice>): void {
    const was = this.playing;
    if (was) void this.speaker.stop();
    this.at = i;
    this.playing = false;
    this.changed();
    if (was) queueMicrotask(() => void this.play(parts, voices));
  }

  /** Another chapter chosen: paused if playing, and back to its start (the parts read again). */
  chapterChosen(): void {
    if (this.playing) this.pause();
    this.at = 0;
    this.changed();
  }

  /** The view goes: silence, if it was reading. */
  dispose(): void {
    if (this.playing) void this.speaker.stop();
    this.playing = false;
  }
}
