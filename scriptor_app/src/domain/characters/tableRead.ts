// THE TABLE READ: a chapter as a script, read aloud by the cast. Its paragraphs in order, each split into the narration
// and the lines said in it, each line given to the one who says it.
//
// Named, as "In their own words" finds a line (voice.ts): a word of speech and their name after it ("Go," Wren said) or
// before it (Wren said, "Go."), and in a paragraph where only one is named as speaking, its other lines too.
//
// Then as a reader follows talk, and marked as followed, not named (`likely`): "she said" is the last one named whose
// gender says she; a paragraph whose narration names one of the cast and no other (an action beat) is theirs; and in a
// talk between two, a line with nothing to say whose it is goes to the other one. A line none of this gives anyone is
// left to no one, and said so.
//
// And a voice for each: a pitch of their own, spread across the cast so no two sound alike (lower for a man, higher
// for a woman, between for anyone else), which the author may set higher or lower.
//
// A port of flutter_app/lib/shared/domain/characters/table_read.dart. Reads only.

import { dartSort } from '../manuscript/dartSort';
import { isMap } from '../json';
import { docBlocks } from '../prose';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { type EyesPerson } from './castNames';
import { allMatches, clamp, dartEscape, firstMatch } from './pageText';
import { quotePattern, speechWords } from './voice';

/** A part of the script: the paragraph it is in (as the editor counts blocks), what is said, and who says it: null for
 * the narration; `line` for a line of dialogue (its `speaker` null when no one can be told saying it, `likely` when it
 * was followed from the talk rather than named). */
export type ReadPart = { block: number; text: string; line: boolean; speaker: string | null; likely: boolean };

const wordChar = /[\p{L}\p{N}]/u;

/** The gender a pronoun of speech says: 'm' for he, 'f' for she. */
function sexOf(gender: string): 'm' | 'f' | null {
  switch (dartToLowerCase(dartTrim(gender))) {
    case 'male':
    case 'man':
    case 'm':
    case 'boy':
      return 'm';
    case 'female':
    case 'woman':
    case 'f':
    case 'girl':
      return 'f';
    default:
      return null;
  }
}

function alternation(names: readonly string[]): string | null {
  const wanted = dartSort(
    [...new Set(names.map(dartTrim))].filter((n) => n.length > 0),
    (a, b) => b.length - a.length,
  );
  return wanted.length === 0 ? null : wanted.map(dartEscape).join('|');
}

/** The chapter's `blocks` (headings marked) as a script, its lines given to `people` (`genders` by id, for "he said"
 * and "she said"). */
export function tableRead(
  blocks: readonly { heading: boolean; text: string }[],
  people: readonly EyesPerson[],
  options: { genders?: ReadonlyMap<string, string> } = {},
): ReadPart[] {
  const genders = options.genders ?? new Map<string, string>();
  const verb = `(?:${speechWords.join('|')})`;
  // Each one's names, longest first, and how they are named after a line and before one, or at all.
  const who: { id: string; after: RegExp; before: RegExp; speaking: RegExp; named: RegExp }[] = [];
  for (const p of people) {
    const name = alternation(p.names);
    if (name === null) continue;
    who.push({
      id: p.id,
      after: new RegExp(`^\\s*(?:(?:${name})\\s+${verb}\\b|${verb}\\s+(?:${name})\\b)`, 'u'),
      before: new RegExp(`(?:${name})\\s+${verb}(?:\\s+\\w+)?\\s*[,:]?\\s*$`, 'u'),
      speaking: new RegExp(`(?:${name})\\s+${verb}\\b|\\b${verb}\\s+(?:${name})\\b`, 'u'),
      named: new RegExp(`(?<![\\p{L}])(?:${name})(?![\\p{L}])`, 'gu'),
    });
  }
  const pronounAfter = new RegExp(`^\\s*(?:(he|she)\\s+${verb}\\b|${verb}\\s+(he|she)\\b)`, 'i');
  const anyoneSpeaking = new RegExp(`\\b${verb}\\b`, 'i');
  const pronounBefore = new RegExp(`\\b(he|she)\\s+${verb}(?:\\s+\\w+)?\\s*[,:]?\\s*$`, 'i');

  const out: ReadPart[] = [];
  // The cast in the order last named, the latest last; and the two who spoke last, the latest last.
  const lastNamed: string[] = [];
  const lastSpeakers: string[] = [];
  const toLast = (list: string[], id: string) => {
    const at = list.indexOf(id);
    if (at >= 0) list.splice(at, 1);
    list.push(id);
  };

  const narrate = (block: number, text: string) => {
    const t = dartTrim(text);
    if (!wordChar.test(t)) return;
    out.push({ block, text: t, line: false, speaker: null, likely: false });
    const found: [number, string][] = [];
    for (const w of who) {
      for (const m of allMatches(w.named, t)) found.push([m.start, w.id]);
    }
    dartSort(found, (a, b) => a[0] - b[0]);
    for (const [, id] of found) toLast(lastNamed, id);
  };

  // "She said": the last named whose gender says she; else the last named whose gender is not written (never one whose
  // gender says he).
  const latestOf = (sex: 'm' | 'f'): string | null => {
    let unsaid: string | null = null;
    for (let i = lastNamed.length - 1; i >= 0; i--) {
      const id = lastNamed[i];
      const theirs = sexOf(genders.get(id) ?? '');
      if (theirs === sex) return id;
      if (theirs === null) unsaid ??= id;
    }
    return unsaid;
  };

  blocks.forEach((block, b) => {
    if (dartTrim(block.text).length === 0) return;
    if (block.heading) {
      narrate(b, block.text);
      return;
    }
    const text = block.text;
    const quotes = allMatches(quotePattern, text);
    if (quotes.length === 0) {
      narrate(b, text);
      return;
    }
    // Who is named as speaking in the narration of this paragraph, and who is named in it at all.
    const narration = text.replace(quotePattern, ' ');
    const speakers = new Set(who.filter((w) => w.speaking.test(narration)).map((w) => w.id));
    const namedHere = new Set(who.filter((w) => firstMatch(w.named, narration) !== null).map((w) => w.id));
    let at = 0;
    quotes.forEach((m, q) => {
      narrate(b, text.substring(at, m.start));
      const tail = text.substring(m.end, clamp(m.end + 80, 0, text.length));
      const head = text.substring(q === 0 ? 0 : quotes[q - 1].end, m.start);
      let speaker: string | null = null;
      let likely = false;
      for (const w of who) {
        if (w.after.test(tail) || w.before.test(head)) {
          speaker = w.id;
          break;
        }
      }
      speaker ??= speakers.size === 1 ? [...speakers][0] : null;
      if (speaker === null) {
        likely = true;
        const pronoun = firstMatch(pronounAfter, tail) ?? firstMatch(pronounBefore, head);
        if (pronoun !== null) {
          // "She said": the last named whose gender says she.
          const p = dartToLowerCase((pronoun.groups[0] ?? pronoun.groups[1])!);
          speaker = latestOf(p === 'he' ? 'm' : 'f');
        } else if (namedHere.size === 1) {
          // An action beat: the one the paragraph is about.
          speaker = [...namedHere][0];
        } else if (
          namedHere.size === 0 &&
          !anyoneSpeaking.test(narration) &&
          lastSpeakers.length === 2 &&
          lastSpeakers[0] !== lastSpeakers[1]
        ) {
          // A talk between two: the other one's turn (unless the paragraph says someone else speaks).
          speaker = lastSpeakers[0];
        }
      }
      out.push({
        block: b,
        text: dartTrim(m.groups[0] ?? m.groups[1]!),
        line: true,
        speaker,
        likely: likely && speaker !== null,
      });
      if (speaker !== null) {
        lastSpeakers.push(speaker);
        lastSpeakers.splice(0, lastSpeakers.length > 2 ? lastSpeakers.length - 2 : 0);
        toLast(lastNamed, speaker);
      }
      at = m.end;
    });
    narrate(b, text.substring(at));
  });
  return out;
}

/** A speaker's voice: its pitch (1 the device's own) and pace. */
export type CastVoice = { pitch: number; rate: number };

/** The narration's voice: the device's own. */
export const narratorVoice: CastVoice = { pitch: 1.0, rate: 1.0 };

/** How far an author's nudge moves a voice, and the bounds a voice is kept in. */
export const pitchStep = 0.08;
export const lowestPitch = 0.6;
export const highestPitch = 1.6;

const ranges: Readonly<Record<'m' | 'f' | 'x', readonly [number, number]>> = {
  m: [0.72, 0.95],
  f: [1.12, 1.4],
  x: [0.86, 1.18],
};

/** A voice for each of `speakers` (their ids, in the order they are first heard, each with their profile's gender),
 * spread so no two sound alike: men from 0.72 to 0.95, women from 1.12 to 1.4, anyone else from 0.86 to 1.18, each
 * group's voices evenly across its range; then `nudged` (each one's steps higher or lower, as the author set them). By
 * id, a group at a time (the groups in the order first heard). */
export function castVoices(
  speakers: readonly { id: string; gender: string }[],
  options: { nudged?: ReadonlyMap<string, number> } = {},
): Map<string, CastVoice> {
  const nudged = options.nudged ?? new Map<string, number>();
  const byGroup = new Map<'m' | 'f' | 'x', string[]>();
  for (const s of speakers) {
    const g = sexOf(s.gender) ?? 'x';
    let ids = byGroup.get(g);
    if (ids === undefined) byGroup.set(g, (ids = []));
    ids.push(s.id);
  }
  const out = new Map<string, CastVoice>();
  for (const [g, ids] of byGroup) {
    const [lo, hi] = ranges[g];
    ids.forEach((id, i) => {
      const base = ids.length === 1 ? (lo + hi) / 2 : lo + ((hi - lo) * i) / (ids.length - 1);
      const pitch = clamp(base + (nudged.get(id) ?? 0) * pitchStep, lowestPitch, highestPitch);
      // A little of each one's own pace too, so two voices near in pitch still differ.
      out.set(id, { pitch: Number(pitch.toFixed(2)), rate: i % 2 === 0 ? 1.0 : 0.94 });
    });
  }
  return out;
}

/** How a voice sounds, said in a word. */
export function voiceWord(v: CastVoice): string {
  if (v.pitch < 0.8) return 'deep';
  if (v.pitch < 0.97) return 'low';
  if (v.pitch < 1.11) return 'middle';
  if (v.pitch < 1.3) return 'high';
  return 'bright';
}

/** tableRead over the chapter `nodeId`, from the chapters as stored (each record as JSON text,
 * CharacterService.storedChapters): the first record of that id. A job to run away from the screen. */
export function tableReadJob(
  storedContents: readonly string[],
  nodeId: string,
  people: readonly EyesPerson[],
  options: { genders?: ReadonlyMap<string, string> } = {},
): () => ReadPart[] {
  return () => {
    for (const json of storedContents) {
      let row: unknown;
      try {
        row = JSON.parse(json);
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
      if (isMap(row) && row['id'] === nodeId) return tableRead(docBlocks(row['doc']), people, options);
    }
    return [];
  };
}
