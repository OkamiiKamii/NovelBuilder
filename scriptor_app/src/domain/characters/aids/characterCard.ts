// THEIR CARD: a character as a card to share, the way writers post their people ("meet my protagonist"): their face in
// an oval, their name, what they are, the facts that fit a card, a tie or two, and a line they say in the book (or the
// first sentence of their summary), on their own colour, with the book's name. Laid out at 360 × 450 and made into a
// picture at three times that (1080 × 1350, a portrait post). Nothing about the novel is changed; the picture is made
// only when the author asks. The pure parts of flutter_app/lib/features/characters/widgets/character_card_share.dart
// (and of core/widgets/stamp.dart, the postage stamp the face is set in), as todaysPage.ts did for today's page.
//
// The line they say is read away from the screen, as the Flutter card reads it: the spoken-lines job (voice.ts, owned
// by the cast's views) over `cardLineInput(cast, entryId)`; `cardLine(lines)` then picks the line.
//
// What a press changes: nothing in the novel. "A line they say" (shown once a line is found) swaps the line for the
// summary; Share makes the picture (1080 × 1350 PNG) named `cardFileName(name)` and shares it (a phone's share sheet;
// on failure, "The picture could not be made: <error>"); Close closes.

import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { dartToUpperCase } from '../../exchange/dartUpperCase';
import { stableSorted } from '../../reader/stableSort';
import { CharacterRelation } from '../../records/relation';
import { roleOf } from '../../relationships/history';
import { type CastData } from '../castData';
import { type GlanceCard, glanceOf } from '../glance';
import { castTone } from '../screens/library';
import { type Rgba, boundLook, cssOf, lerpColour, rgbaOf, white, withAlpha } from './colour';

/** A line taken out of its sentence, ended as an excerpt is: “You want to go out there,” Ilse said → “You want to go
 * out there.” */
export function quoted(words: string): string {
  const t = dartTrim(words).replace(/[,;:\s]+$/, '');
  if (t.length === 0) return t;
  return /[.!?…—–-]$/.test(t) ? t : `${t}.`;
}

/** The card's size, drawn three times over for the picture. */
export const characterCardSize = { width: 360, height: 450 } as const;
export const characterCardPixelRatio = 3;

/** The chapters and scenes in the order of the book, and the names to listen for: what the spoken-lines job reads.
 * Null when there is nothing to read (no chapters, or no names). */
export function cardLineInput(cast: CastData, entryId: string): { chapters: string[]; names: string[] } | null {
  const model = cast.model;
  const chapters = stableSorted(
    [...model.nodes.values()].filter((n) => n.kind === 'chapter' || n.kind === 'scene'),
    (a, b) => (model.order.position.get(a.id) ?? 0) - (model.order.position.get(b.id) ?? 0),
  ).map((n) => n.id);
  const names = cast.findNames[entryId] ?? [];
  if (chapters.length === 0 || names.length === 0) return null;
  return { chapters, names };
}

/** The line for the card, of the lines they say in the book (in order): the first of four words or more, not an
 * exclamation, else the first; as an excerpt (`quoted`). Null when they say nothing. */
export function cardLine(lines: readonly { words: string }[]): string | null {
  const good = lines.find((l) => l.words.split(' ').length >= 4) ?? lines[0];
  return good === undefined ? null : quoted(good.words);
}

/** The card's words for a character of the cast: their glance (what they are, their facts, their ties as they stand
 * last, "Ilse Marrow’s apprentice"), the book's name, their colour. */
export function characterCardOf(cast: CastData, entryId: string): { card: GlanceCard; book: string; tone: string } | null {
  const entry = cast.entries.find((e) => e.id === entryId);
  if (entry === undefined) return null;
  const profile = cast.profiles.get(entry.id) ?? null;
  const names = new Map(cast.entries.map((e) => [e.id, dartTrim(e.name)]));
  const ties: string[] = [];
  for (const r of cast.snapshot.rows('characterRelations').map((row) => new CharacterRelation(row))) {
    if (r.fromId !== entry.id && r.toId !== entry.id) continue;
    const other = names.get(r.fromId === entry.id ? r.toId : r.fromId);
    const stages = r.stages;
    if (other === undefined || other.length === 0 || stages.length === 0) continue;
    const role = roleOf(stages[stages.length - 1], r, entry.id);
    ties.push(`${other}’s ${dartToLowerCase(role)}`);
  }
  return {
    card: glanceOf(entry.raw, { profile: profile?.raw ?? null, what: 'Character', ties }),
    book: cast.novelTitle,
    tone: castTone(entry.id),
  };
}

/** The picture's file: "wren-hollis-card.png" ("character-card.png" for a name with no letters or digits). */
export function cardFileName(name: string): string {
  const slug = dartToLowerCase(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug.length === 0 ? 'character' : slug}-card.png`;
}

export const characterCardWords = {
  title: (name: string) => `${name}’s card`,
  withLine: 'A line they say',
  withLineNote: 'Their own words from your chapters, else their summary',
  close: 'Close',
  share: 'Share',
  failed: (error: string) => `The picture could not be made: ${error}`,
  /** At the card's foot (the Flutter app's name, as its cards carry it). */
  brand: 'NOVEL BUILDER',
} as const;

/** A text on the card: the face (`heading`, the theme's heading face; `text`, its text face), size, colour, weight,
 * letter spacing, italic, and the lines it may take (cut with "…"). All centred. */
export type CardLine = {
  text: string;
  face: 'heading' | 'text';
  size: number;
  color: string;
  weight: 400 | 600 | 700;
  letterSpacing: number;
  italic: boolean;
  /** Null: as many as it takes. */
  maxLines: number | null;
};

/** The card laid out, top to foot, in a 360 × 450 box: the ground a gradient top to foot (`ground`); 10 in, a rule
 * 1.2 wide (`frame` at 90%); 3 in, one 0.6 wide (`frame` at 45%); then, padded 18 at the sides, 14 above and 12 below,
 * a column centred: the book's name; 12; the face in a postage stamp (`stamp`); 12; the name; the epithet; 6 and what
 * they are; 10; a rule, a diamond, a rule (`rule`); 10; the facts; 4 and the ties; a space; the words (their line, or
 * the summary); a space (the two spaces share what is left equally); the brand. Each item is `null` when it is not on
 * the card. */
export type CharacterCardLayout = {
  ground: [string, string];
  outerRule: { inset: number; width: number; color: string };
  innerRule: { inset: number; width: number; color: string };
  padding: { left: number; top: number; right: number; bottom: number };
  book: CardLine;
  /** The stamp, 140 square turned −0.035 rad: its paper (the ground's top 82% towards white) perforated all round,
   * the face (132, `face`) inside a frame 1.2 wide, 8% of the size in. */
  stamp: { size: number; tilt: number; paper: string; frame: string; frameWidth: number; inset: number; elevation: number };
  /** The face in the stamp: their portrait (an uploaded picture, in an oval), else their cameo (cameo.ts, not bare)
   * in a circle of 132 on their colour's bound look (lift 0.1, sink 0.45, tinted), its ring their colour at 80%. */
  face: { size: number; ground: [string, string]; ink: string; frame: string };
  name: CardLine;
  epithet: CardLine | null;
  what: CardLine | null;
  rule: { length: number; thickness: number; lineColor: string; diamond: number; gap: number; color: string };
  facts: CardLine | null;
  ties: CardLine | null;
  words: CardLine | null;
  brand: CardLine;
};

/** The card's layout for a glance, the book's name, the character's colour (`#rrggbb`) and the line (null: none
 * found), with or without the line (`withLine`; the summary's first sentence stands without it). `system` is the
 * theme's style (System Monolith, Scriptor's, by default). */
export function characterCardLayout(args: {
  card: GlanceCard;
  book: string;
  tone: string;
  line: string | null;
  withLine?: boolean;
  system?: boolean;
}): CharacterCardLayout {
  const { card } = args;
  const tone = rgbaOf(args.tone);
  const look = boundLook(tone, { lift: 0.04, sink: 0.62, tinted: true, system: args.system ?? true });
  const ink = look.ink;
  const faint = withAlpha(ink, 0.72);
  const quote = (args.withLine ?? true) && args.line !== null && args.line.length > 0 ? args.line : null;
  const words = quote !== null ? `“${quote}”` : card.summary;
  const facts = card.facts
    .slice(0, 4)
    .map((f) => `${f.label} ${f.value}`)
    .join('  ·  ');
  const text = (
    t: string,
    face: CardLine['face'],
    size: number,
    color: Rgba,
    o: { weight?: CardLine['weight']; letterSpacing?: number; italic?: boolean; maxLines: number | null },
  ): CardLine => ({
    text: t,
    face,
    size,
    color: cssOf(color),
    weight: o.weight ?? 400,
    letterSpacing: o.letterSpacing ?? 0,
    italic: o.italic ?? false,
    maxLines: o.maxLines,
  });
  const faceLook = boundLook(tone, { lift: 0.1, sink: 0.45, tinted: true, system: args.system ?? true });
  return {
    ground: [cssOf(look.ground[0]), cssOf(look.ground[1])],
    outerRule: { inset: 10, width: 1.2, color: cssOf(withAlpha(look.frame, 0.9)) },
    innerRule: { inset: 10 + 1.2 + 3, width: 0.6, color: cssOf(withAlpha(look.frame, 0.45)) },
    padding: { left: 18, top: 14, right: 18, bottom: 12 },
    book: text(dartToUpperCase(args.book), 'heading', 9.5, faint, { weight: 600, letterSpacing: 2.4, maxLines: 1 }),
    stamp: {
      size: 140,
      tilt: -0.035,
      paper: cssOf(lerpColour(look.ground[0], white, 0.82)),
      frame: cssOf(look.frame),
      frameWidth: 1.2,
      inset: 140 * 0.08,
      elevation: 2,
    },
    face: {
      size: 132,
      ground: [cssOf(faceLook.ground[0]), cssOf(faceLook.ground[1])],
      ink: cssOf(faceLook.ink),
      frame: cssOf(withAlpha(tone, 0.8)),
    },
    name: text(card.name, 'heading', 25, ink, { weight: 700, maxLines: 2 }),
    epithet: card.epithet.length > 0 ? text(card.epithet, 'text', 14, faint, { italic: true, maxLines: 1 }) : null,
    what:
      card.what.length > 0
        ? text(dartToUpperCase(card.what), 'heading', 10, look.frame, { weight: 700, letterSpacing: 2, maxLines: null })
        : null,
    rule: { length: 54, thickness: 0.8, lineColor: cssOf(withAlpha(look.frame, 0.7)), diamond: 6, gap: 6, color: cssOf(look.frame) },
    facts: facts.length > 0 ? text(facts, 'text', 12.5, ink, { maxLines: 2 }) : null,
    ties:
      card.ties.length > 0
        ? text(card.ties.slice(0, 2).join('  ·  '), 'text', 12, faint, { italic: true, maxLines: 1 })
        : null,
    words: words.length > 0 ? text(words, 'text', 14.5, ink, { italic: quote !== null, maxLines: 4 }) : null,
    brand: text(characterCardWords.brand, 'heading', 7.5, withAlpha(faint, 0.6), { weight: 600, letterSpacing: 2.2, maxLines: 1 }),
  };
}

/** The stamp's perforations: round bites of radius size / 34 all along each edge of a `size` square (n + 1 of them
 * per edge, n = max(4, round(edge / (3 × radius))), from corner to corner), taken out of the paper. */
export function stampPerforations(size = 140): { radius: number; holes: { x: number; y: number }[] } {
  const hole = size / 34;
  const holes: { x: number; y: number }[] = [];
  const along = (fx: number, fy: number, tx: number, ty: number) => {
    const length = Math.hypot(tx - fx, ty - fy);
    const n = Math.max(4, Math.round(length / (hole * 3)));
    for (let i = 0; i <= n; i++) holes.push({ x: fx + ((tx - fx) * i) / n, y: fy + ((ty - fy) * i) / n });
  };
  along(0, 0, size, 0);
  along(size, 0, size, size);
  along(0, size, size, size);
  along(0, 0, 0, size);
  return { radius: hole, holes };
}
