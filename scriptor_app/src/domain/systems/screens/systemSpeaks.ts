// THE SYSTEM SPEAKS (../systemMessage.ts words it): a composer for the messages a progression story's system shows its
// characters. Who it is to (a character with a sheet, or "You"), what it says, filled in from their sheet as it
// stands, the book's brackets (remembered on this device, `bracketKey`), and the message as the system's own window
// shows it. Copy, or Write it in the chapter: the lines at the end of the chapter, each a paragraph. The pure parts of
// flutter_app/lib/features/progression/widgets/system_speaks.dart; the screen holds a `SpeaksState`, calls its
// presses, and draws `view()`.
//
// The message window: a gradient of the kind's look (top to bottom), radius 10, a border of its accent at 70%, a glow
// of the accent at 25% blur 14; padded 16/12/16/14. "SYSTEM" (11, letter spacing 3, the accent, bold), 6 below; then
// each line (15, height 1.35; the first bold in the accent, the rest regular in #E8F0F6), 2 above and below; in
// JetBrains Mono when the look is mono, else the book face. The sheet is a bottom sheet at most 92% of the screen.

import { isDocument } from '../../outline';
import { readingOrder } from '../../model/storyOrder';
import { type StoryModel } from '../../model/storyModel';
import { type SystemBlueprint, type SystemSheet } from '../../records/system';
import { dartTrim } from '../../text/dartString';
import { type ComputedSheet, SheetProfile, computeSheet, groupNamed } from '../compute';
import { type Bracket, type MessageKind, type MessageParts, bracketMarks, brackets, messageKindLabel, messageKinds, messageLines } from '../systemMessage';
import { type WindowLook, windowLookOf } from './statusWindow';

/** Where the book's bracket is kept: on this device, for the novel. */
export const bracketKey = (novelId: string): string => `systems.bracket.${novelId}`;

/** Which window a blueprint wears, from its own words: a cultivation record for realms and qi, an arcane ledger for
 * mana and spells, a threat dossier for powers, else a game's status screen. */
export function windowKindOf(system: SystemBlueprint): string {
  const words = [system.name, ...system.groupList.map((g) => g.name), ...system.tracks.map((t) => t.name), ...system.variables.map((v) => v.name)]
    .join(' ')
    .toLowerCase();
  if (/\b(realm|qi|cultivat|dao|meridian|dantian)/.test(words)) return 'cultivation';
  if (/\b(threat|power rating|superpower|hero)/.test(words)) return 'superhero';
  if (/\b(arcan|rune|sigil|spell slot|magic)/.test(words)) return 'hard-magic';
  return 'litrpg';
}

/** The bracket stored for a novel, or square. */
export function bracketOf(stored: unknown): Bracket {
  return brackets.find((b) => b === stored) ?? 'square';
}

export const speaksWords = {
  title: 'The system speaks',
  to: 'To',
  says: 'It says',
  brackets: 'Brackets',
  you: 'You',
  copy: 'Copy',
  copied: 'Copied. Paste it where the system speaks.',
  write: 'Write it in the chapter',
  button: 'The system speaks',
  systemLabel: 'SYSTEM',
} as const;

/** The intro under the title. */
export const speaksIntro = (system: SystemBlueprint): string =>
  `A message from ${dartTrim(system.name).length === 0 ? 'the system' : dartTrim(system.name)}, filled in from their sheet, in your book’s brackets.`;

/** A bracket's chip: its marks ("[ ]") or "None", and its tooltip. */
export const bracketChip = (b: Bracket): { label: string; tooltip: string } => ({
  label: b === 'none' ? 'None' : `${bracketMarks[b].open} ${bracketMarks[b].close}`,
  tooltip: `${bracketMarks[b].label} brackets`,
});

/** The field the kind asks for, in order: a text field (`lines`: 1, or 2 for a multi-line one; `number` for a number). */
export type SpeaksField = { key: 'level' | 'by' | 'name' | 'rank' | 'detail'; label: string; hint: string | null; lines: number; number: boolean };

/** A whole number as Dart's `int.tryParse` reads one (trimmed by the caller). */
const intOrNull = (text: string): number | null => (/^[+-]?\d+$/.test(text) ? parseInt(text, 10) : null);
/** A number as Dart's `num.tryParse` reads one. */
const numOrNull = (text: string): number | null => {
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text) && !/^[+-]?(Infinity|NaN)$/.test(text)) return null;
  return Number(text);
};

/** The composer's state: who, what, the fields as typed, the bracket. Presses change it; `view()` says what is shown. */
export class SpeaksState {
  readonly sheets: SystemSheet[];
  sheetId: string | null;
  kind: MessageKind = 'levelUp';
  bracket: Bracket;
  name = '';
  rank = '';
  detail = '';
  level = '';
  by = '1';
  trackId: string | null = null;
  statId: string | null = null;
  message: string | null = null;

  constructor(
    readonly model: StoryModel,
    readonly system: SystemBlueprint,
    storedBracket: unknown,
  ) {
    this.sheets = model.sheets.filter((s) => s.systemId === system.id && model.entries.has(s.entryId));
    this.sheetId = this.sheets[0]?.id ?? null;
    this.bracket = bracketOf(storedBracket);
    this.fill();
  }

  get sheet(): SystemSheet | null {
    return this.sheets.find((s) => s.id === this.sheetId) ?? null;
  }

  get computed(): ComputedSheet {
    const sheet = this.sheet;
    return computeSheet(this.system, sheet === null ? new SheetProfile() : SheetProfile.of(sheet));
  }

  get who(): string {
    const sheet = this.sheet;
    return sheet === null ? '' : dartTrim(this.model.entries.get(sheet.entryId)?.name ?? '');
  }

  /** What the sheet says, put in the fields for the kind chosen: the first numbered track and its level, the stat and
   * its value, the latest skill or title held. */
  fill(): void {
    const c = this.computed;
    const numbered = c.tracks.filter((t) => t.level !== null);
    this.trackId ??= numbered[0]?.track.id ?? null;
    const track = numbered.find((t) => t.track.id === this.trackId);
    if (track !== undefined) this.level = `${track.level}`;
    const stats = c.rows.filter((r) => typeof r.value === 'number');
    this.statId ??= stats[0]?.variable.id ?? null;
    const group = this.kind === 'skill' ? 'skill' : this.kind === 'title' ? 'title' : null;
    if (group !== null) {
      const held = c.items.filter((i) => i.group !== null && groupNamed(i.group, group));
      const latest = held.length === 0 ? null : held[held.length - 1];
      this.name = latest?.item.name ?? '';
      this.rank = latest === null ? '' : this.system.rankName(latest.item);
      this.detail = latest?.item.description ?? '';
    }
  }

  /** "To": a character, or You (null). */
  chooseSheet(sheetId: string | null): void {
    this.sheetId = sheetId;
    if (sheetId !== null) {
      this.trackId = null;
      this.statId = null;
      this.fill();
    }
  }

  chooseKind(kind: MessageKind): void {
    this.kind = kind;
    if (kind === 'skill' || kind === 'title') {
      this.fill();
    } else if (kind !== 'levelUp' && kind !== 'stat') {
      this.name = '';
      this.rank = '';
      this.detail = '';
    }
  }

  chooseTrack(trackId: string): void {
    this.trackId = trackId;
    const t = this.computed.tracks.find((x) => x.track.id === trackId);
    if (t !== undefined) this.level = `${t.level}`;
  }

  chooseStat(statId: string): void {
    this.statId = statId;
  }

  /** The bracket chosen (and the value to keep under `bracketKey`). */
  chooseBracket(b: Bracket): string {
    this.bracket = b;
    return b;
  }

  type(field: SpeaksField['key'], text: string): void {
    this[field] = text;
  }

  get parts(): MessageParts {
    const c = this.computed;
    const stat = c.rows.find((r) => r.variable.id === this.statId);
    const track = c.tracks.find((t) => t.track.id === this.trackId);
    return {
      kind: this.kind,
      who: this.who,
      track: track?.track.name ?? 'Level',
      level: intOrNull(dartTrim(this.level)) ?? track?.level ?? 1,
      name: this.name,
      rank: this.rank,
      stat: stat?.variable.name ?? '',
      from: typeof stat?.value === 'number' ? stat.value : 0,
      by: numOrNull(dartTrim(this.by).replace('+', '')) ?? 1,
      detail: this.detail,
    };
  }

  get lines(): string[] {
    return messageLines(this.parts, this.bracket);
  }

  /** The text Copy puts on the clipboard, and what is said after. */
  copied(): string {
    this.message = speaksWords.copied;
    return this.lines.join('\n');
  }

  /** What is shown: the "To" chips, the kinds, the kind's own chips and fields, the brackets, the window. */
  view(): {
    to: { id: string | null; label: string; selected: boolean }[];
    kinds: { kind: MessageKind; label: string; selected: boolean }[];
    tracks: { id: string; label: string; selected: boolean }[];
    stats: { id: string; label: string; selected: boolean }[];
    fields: SpeaksField[];
    brackets: { bracket: Bracket; label: string; tooltip: string; selected: boolean }[];
    look: WindowLook;
    lines: string[];
    semanticsLabel: string;
  } {
    const c = this.computed;
    const numbered = c.tracks.filter((t) => t.level !== null);
    const stats = c.rows.filter((r) => typeof r.value === 'number');
    const lines = this.lines;
    const f = (key: SpeaksField['key'], label: string, more: Partial<SpeaksField> = {}): SpeaksField => ({
      key,
      label,
      hint: more.hint ?? null,
      lines: more.lines ?? 1,
      number: more.number ?? false,
    });
    let fields: SpeaksField[];
    switch (this.kind) {
      case 'levelUp':
        fields = [f('level', 'Level reached', { number: true }), f('detail', 'A line more (optional)', { hint: '+5 attribute points to assign', lines: 2 })];
        break;
      case 'stat':
        fields = [f('by', 'By how much', { number: true }), f('detail', 'A line more (optional)', { lines: 2 })];
        break;
      case 'skill':
      case 'title':
        fields = [f('name', this.kind === 'skill' ? 'Skill' : 'Title'), f('rank', 'Rank (optional)'), f('detail', 'What it does (optional)', { lines: 2 })];
        break;
      case 'quest':
      case 'questDone':
        fields = [f('name', 'Quest'), f('detail', this.kind === 'quest' ? 'Objective, reward… (a line each)' : 'Reward (optional)', { lines: 2 })];
        break;
      default:
        fields = [f('name', 'Warning'), f('detail', 'A line more (optional)', { lines: 2 })];
    }
    return {
      to: [
        ...this.sheets.map((s) => ({ id: s.id as string | null, label: this.model.entries.get(s.entryId)!.name, selected: this.sheetId === s.id })),
        { id: null, label: speaksWords.you, selected: this.sheetId === null },
      ],
      kinds: messageKinds.map((k) => ({ kind: k, label: messageKindLabel[k], selected: this.kind === k })),
      tracks: this.kind === 'levelUp' && numbered.length > 1 ? numbered.map((t) => ({ id: t.track.id, label: t.track.name, selected: this.trackId === t.track.id })) : [],
      stats: this.kind === 'stat' ? stats.map((r) => ({ id: r.variable.id, label: `${r.variable.name} ${r.display}`, selected: this.statId === r.variable.id })) : [],
      fields,
      brackets: brackets.map((b) => ({ bracket: b, ...bracketChip(b), selected: this.bracket === b })),
      look: windowLookOf(windowKindOf(this.system)),
      lines,
      semanticsLabel: `The message: ${lines.join(' ')}`,
    };
  }
}

/** The chapter the lines go to: the one open in Write (`selected`), else the one last written in (`last`), else the
 * first; null when there is none (or it is no longer stored, `stored`). */
export function speaksChapter(
  model: StoryModel,
  selected: string | null,
  last: unknown,
  stored: (nodeId: string) => boolean,
): { id: string; title: string; said: string } | null {
  const chapters = readingOrder(model.nodes.values()).filter((n) => isDocument(n.kind));
  const pick = chapters.find((n) => n.id === selected) ?? chapters.find((n) => n.id === last) ?? chapters[0] ?? null;
  if (pick === null || !stored(pick.id)) return null;
  return { id: pick.id, title: pick.displayTitle, said: `At the end of “${pick.displayTitle}”.` };
}
