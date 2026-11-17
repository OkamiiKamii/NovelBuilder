// THEIR VOICE, on a character's profile (voicePrint.ts measures it): how they talk, set against the rest of the cast,
// from every line the book ties to them: a row of meters (words a line, questions, exclamations, contractions, word
// length) each with the cast's average marked on it; what sets them apart, in words; their signature words; and whom
// they sound most like, said plainly when the two could swap lines. Read from the saved chapters away from the screen.
// It only reads.
//
// The pure parts of flutter_app/lib/features/characters/widgets/their_voice.dart: what to read (`voiceInputs`; kept
// by readingKey(inputs, textVersion) in KeptReadings; read with voicePrintsJob(service.storedChapters(novelId),
// cast.documentIds, people)), and what the box shows of it.
//
// In a profile box ("Their voice", its caption), each meter: its label (14) in 104, a bar 6 high (radius 3) of
// outlineVariant at 50% with the part in the accent, a tick 2 × 14 (onSurfaceVariant) at the cast's mark, and the value
// (14, right-aligned) in 76. Under them, with anyone else speaking enough, a key: a tick 2 × 12 and "the rest of the
// cast" (13, italic). The traits (15.5); "WORDS THAT ARE THEIRS" (10.5, bold, the accent, spacing 1.6) and a chip a
// word, “in quotes”; and whom they sound like in a box (the high surface at 40%, an outline, radius 10, hearing icon in
// the accent), or, when too alike, errorContainer at 40% with an error border at 50% and a record_voice_over icon.

import { dartTrim } from '../../text/dartString';
import { type CastData } from '../castData';
import { type VoicePrint, readVoice } from '../voicePrint';
import { clamp } from '../pageText';
import { dartRound } from '../../desk/format';

/** Everyone who speaks, by the names they go by (in the cast's order), and what the reading is made of (null when
 * there is nothing to read: no chapters, or `entryId` has no name to be found by). The same reading serves every
 * character of the cast. */
export function voiceInputs(
  cast: CastData,
  entryId: string,
): { people: Map<string, string[]>; inputs: string | null } {
  const names = cast.findNames;
  const people = new Map<string, string[]>();
  for (const l of cast.list) {
    if (!l.profile.archived && (names[l.entry.id] ?? []).length > 0) people.set(l.entry.id, names[l.entry.id]);
  }
  const who = [...people].map(([key, value]) => `${key}:${value.join('|')}`).join(',');
  const chapters = cast.documentIds.join(',');
  return {
    people,
    inputs: chapters.length === 0 || !people.has(entryId) ? null : `voices\u0000${cast.novelId}\u0000${chapters}\u0000${who}`,
  };
}

/** One meter. */
export type VoiceMeter = {
  label: string;
  value: number;
  /** The part of the bar filled, and where the cast's mark is (null: no one else to mark), each 0 to 1. */
  part: number;
  mark: number | null;
  said: string;
  semanticsLabel: string;
};

function meter(label: string, value: number, cast: number | null, top: number, say: (v: number) => string): VoiceMeter {
  return {
    label,
    value,
    part: clamp(value / top, 0.0, 1.0),
    mark: cast === null ? null : clamp(cast / top, 0.0, 1.0),
    said: say(value),
    semanticsLabel: cast === null ? `${label}: ${say(value)}` : `${label}: ${say(value)}; the cast ${say(cast)}`,
  };
}

/** Where the cast's tick stands on a bar `width` wide at `mark`. */
export function markLeft(width: number, mark: number): number {
  return clamp(width * mark - 1, 0.0, width - 2);
}

const fixed = (v: number) => v.toFixed(v >= 10 ? 0 : 1);
const percent = (v: number) => `${dartRound(v * 100)}%`;

/** The box, or null (nothing shown) while it is read, or when they do not speak enough to be measured. `prints`: the
 * cast's voices, as voicePrintsJob read them. */
export function theirVoice(
  cast: CastData,
  entryId: string,
  prints: readonly VoicePrint[] | null,
): {
  title: string;
  caption: string;
  meters: VoiceMeter[];
  key: string | null;
  traits: string[];
  signature: { heading: string; words: string[] } | null;
  soundsLike: { alike: boolean; icon: string; text: string } | null;
} | null {
  if (prints === null) return null;
  const me = prints.find((p) => p.id === entryId);
  const entry = cast.entries.find((e) => e.id === entryId);
  const name = entry === undefined ? 'They' : dartTrim(entry.name);
  if (me === undefined) return null;
  const names = new Map(cast.entries.map((e) => [e.id, dartTrim(e.name)]));
  const voice = readVoice(entryId, prints, names)!;
  const others = prints.filter((p) => p.id !== entryId);
  // The rest of the cast's average; none when no one else speaks enough (no tick then: it would only mark their own).
  const mean = (f: (p: VoicePrint) => number) =>
    others.length === 0 ? null : others.reduce((n, p) => n + f(p), 0.0) / others.length;
  const like = voice.soundsLike;
  return {
    title: 'Their voice',
    caption:
      `How ${name} talks, from ${me.lines} lines, against the rest of the cast` +
      `${others.length === 0 ? ' (no one else speaks enough yet)' : ''}.`,
    meters: [
      meter('Words a line', me.wordsPerLine, mean((p) => p.wordsPerLine), 30, fixed),
      meter('Questions', me.questions, mean((p) => p.questions), 1, percent),
      meter('Exclamations', me.cries, mean((p) => p.cries), 1, percent),
      meter('Contractions', me.contractions, mean((p) => p.contractions), 15, (v) => `${fixed(v)} in 100`),
      meter('Word length', me.wordLength, mean((p) => p.wordLength), 7, (v) => `${v.toFixed(1)} letters`),
    ],
    key: others.length > 0 ? 'the rest of the cast' : null,
    traits: voice.traits,
    signature: me.signature.length === 0 ? null : { heading: 'WORDS THAT ARE THEIRS', words: me.signature.map((w) => `“${w}”`) },
    soundsLike:
      like === null
        ? null
        : {
            alike: voice.alike,
            icon: voice.alike ? 'record_voice_over' : 'hearing',
            text: voice.alike
              ? `${name} and ${like} sound alike: lines as long, as many questions and cries. Could a reader tell ` +
                'them apart without the tags?'
              : `Sounds most like ${like}.`,
          },
  };
}
