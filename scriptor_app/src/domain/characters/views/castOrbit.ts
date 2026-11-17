// ORBIT: the cast as an orrery round the heart of the book. The protagonists burn in the middle; round them, on rings
// seen a little from above, the principals, the rest of the cast, the minor and background cast, and in the wings (a
// broken ring, faint) those not on the page yet. Each ring runs clockwise from the top in the order they enter the
// book. The more chapters a character is in, the larger they are; the more of those they share with the heart, the
// brighter the line between them. The thin ring round each is how well the author knows them (of the interview's
// questions, how many their profile answers). Under the orrery, the one to know next, with **Interview**.
//
// It draws what is recorded and read from the text, and nothing else. A press on anyone opens them; a hover lights
// their line to the heart. The pure parts of flutter_app/lib/features/characters/widgets/cast_orbit.dart: who goes on
// which ring, the one to know next, every position, size and colour the orrery is drawn with (`orbitSky`, for one
// frame of its rise), and the legend.
//
// HOW IT IS DRAWN (orbitSky gives every number):
// - A box of `width` × `height`, radius 12, a border of outlineVariant at 60%, filled with a radial gradient (radius
//   0.9 of the shorter side's half, from the centre) from the accent at 8% over surfaceContainerHigh to
//   surfaceContainerLow.
// - The sky, behind everything: `stars` (90 dots of onSurfaceVariant at their alpha, radius as given, the same every
//   time); the heart's glow (a circle of `glow.radius` at `heartAt`, a radial gradient from `glow.tone` at 28% to 0%);
//   each orbit an ellipse of `rx` × `ry` about `centre`, a 1.2 stroke of outlineVariant at `alpha` (the wings dashed: 6
//   drawn, 6 left, from the ellipse's rightmost point clockwise, as SVG dashes an ellipse); each tether a quadratic
//   Bézier from `heartAt` through `bend` to `to`, round caps, `width` wide, in outlineVariant mixed toward `tone` by
//   `mix` (Color.lerp) at `alpha` (`tetherColour` makes it).
// - The bodies, nearest the top first, then the heart: each a press target of `hit` × `hit` centred on `at`, at opacity
//   `shown` (0.6 more when `faint`), scaled 1.12 when lit (160 ms): a circle of `size` (surfaceContainerLowest), with a
//   shadow in their tone when it is the heart (55%, blur size × 0.45, spread size × 0.04) or lit (45%, blur size ×
//   0.35, spread 1); inside it, `band` + 1.5 in (none when band is 0), their picture (cover, at their focal point) or
//   cameo, or below 22 a plain circle of their tone; round it, when known is given and band > 0, the known ring
//   (`knownRing`). Over a body whose `named` is set, and over each heart, a name plate: 140 wide centred on `at.x`, its
//   top `plateTop`, surfaceContainerLow at 88%, radius 8, 6/1 padding, the name (`plate`; 14 bold for the heart, else
//   labelSmall), one line.
// - The rise: once, 1400 ms, as the view opens (at once with reduced motion): `rise` from 0 to 1, each frame drawn
//   anew.

import { formatNumber, plural } from '../../desk/format';
import { compareNum, dartSort } from '../../manuscript/dartSort';
import { type StoryOrder } from '../../model/storyOrder';
import { dartToUpperCase } from '../../exchange/dartUpperCase';
import { type Listed } from '../cast';
import { castTone, presenceOf } from '../screens/library';
import { DartRandom, andList, byCodeUnits, easeOutBack, easeOutCubic, firstName, mix } from './common';
import { clamp } from '../pageText';

/** The rings of the orbit, from the middle out. */
export type OrbitRing = 'principals' | 'cast' | 'minor' | 'wings';
export const orbitRings: readonly OrbitRing[] = ['principals', 'cast', 'minor', 'wings'];
export const orbitRingLabel: Readonly<Record<OrbitRing, string>> = {
  principals: 'Principals',
  cast: 'The cast',
  minor: 'Minor & background',
  wings: 'In the wings',
};

const rankOfRole: Readonly<Record<string, number>> = { Protagonist: 0, Antagonist: 1, Supporting: 2, Minor: 4, Background: 5 };

/** A character's place in the company (0 a protagonist … 5 the background cast): the most important of their roles;
 * with none, between the principals and the minor cast. (cast_photo.dart's `castRank`.) */
export function castRank(l: Listed): number {
  const roles = l.profile.roles;
  if (roles.length === 0) return 3;
  return roles.map((r) => rankOfRole[r] ?? 3).reduce((a, b) => (a < b ? a : b));
}

/** Who goes where: the heart, and the rings in order from the middle out (only those with anyone on them). */
export type OrbitPlan = { heart: Listed[]; rings: Map<OrbitRing, Listed[]> };

/** How well a character is known: of `of` questions, `known` answered. */
export type Known = { known: number; of: number };

/** Who goes where in the orbit. At the heart, the protagonists (up to three, the most in the book first); with none,
 * the one character most in the book. Round them: the antagonists and supporting cast (and any more protagonists),
 * then those with no role, then the minor and background cast. While the book has chapters, anyone not on the page yet
 * waits in the wings, outermost. Each ring in reading order of where they first appear, then by name. */
export function orbitPlan(cast: readonly Listed[], options: { hasChapters: boolean }): OrbitPlan {
  const bySeen = (a: Listed, b: Listed) => {
    const s = b.seenIn.length - a.seenIn.length;
    return s !== 0 ? Math.sign(s) : byCodeUnits(a.entry.name, b.entry.name);
  };
  const leads = dartSort(
    cast.filter((l) => castRank(l) === 0),
    bySeen,
  );
  const heart = leads.length > 0 ? leads.slice(0, 3) : dartSort([...cast], bySeen).slice(0, 1);
  const rings = new Map<OrbitRing, Listed[]>();
  for (const l of cast) {
    if (heart.includes(l)) continue;
    const rank = castRank(l);
    const ring: OrbitRing =
      options.hasChapters && l.seenIn.length === 0 ? 'wings' : rank <= 2 ? 'principals' : rank === 3 ? 'cast' : 'minor';
    let list = rings.get(ring);
    if (list === undefined) rings.set(ring, (list = []));
    list.push(l);
  }
  const firstOf = (l: Listed) => (l.first < 0 ? 1 << 30 : l.first);
  for (const people of rings.values()) {
    dartSort(people, (a, b) => {
      const f = compareNum(firstOf(a), firstOf(b));
      return f !== 0 ? f : byCodeUnits(a.entry.name, b.entry.name);
    });
  }
  const ordered = new Map<OrbitRing, Listed[]>();
  for (const r of orbitRings) {
    const people = rings.get(r);
    if (people !== undefined) ordered.set(r, people);
  }
  return { heart, rings: ordered };
}

/** Of the heart and the principals, the one known least (and not yet well); with every one of them known well, the
 * least known of the rest. Null when the whole cast is known well. */
export function nextToKnow(plan: OrbitPlan, known: (l: Listed) => Known): Listed | null {
  const part = (l: Listed) => {
    const k = known(l);
    return k.of === 0 ? 1 : k.known / k.of;
  };
  const least = (people: readonly Listed[]): Listed | null => {
    let best: Listed | null = null;
    for (const l of people) {
      const k = known(l);
      if (k.of === 0 || k.known >= k.of) continue;
      if (best === null || part(l) < part(best) || (part(l) === part(best) && l.seenIn.length > best.seenIn.length)) {
        best = l;
      }
    }
    return best;
  };
  return (
    least([...plan.heart, ...(plan.rings.get('principals') ?? [])]) ??
    least(orbitRings.filter((r) => r !== 'principals').flatMap((r) => plan.rings.get(r) ?? []))
  );
}

/** A point on the orrery. */
export type Point = { x: number; y: number };

/** A ring drawn: its half-width and half-height about the centre, whether it is broken (the wings), its alpha. */
export type OrbitDrawn = { ring: OrbitRing; rx: number; ry: number; dashed: boolean; shown: number; alpha: number };

/** One of the cast on the orrery (or at the heart). */
export type Body = {
  listed: Listed;
  /** The ring it is on; null for the heart. */
  ring: OrbitRing | null;
  heart: boolean;
  at: Point;
  size: number;
  /** The press target, square, centred on `at`. */
  hit: number;
  /** How far it has risen, its opacity (0 to 1). */
  shown: number;
  /** The share of their chapters they share with the heart (0 to 1). */
  share: number;
  /** Their name on a plate under them. */
  named: boolean;
  plate: string;
  plateTop: number;
  faint: boolean;
  tone: string;
  /** The ring round them of how well they are known, its width (0: none, too small), and how much of it is lit. */
  band: number;
  known: Known | null;
  /** "in 3 of 12 chapters", "not on the page yet", or null in a book with no chapters. */
  where: string | null;
  semanticsLabel: string;
  tooltip: string;
};

/** A line from the heart: to whom, how strong, in their colour; lit by a hover. */
export type Tether = {
  id: string;
  to: Point;
  bend: Point;
  strength: number;
  tone: string;
  lit: boolean;
  width: number;
  /** How far outlineVariant is mixed toward `tone`, and at what alpha. */
  mix: number;
  alpha: number;
};

/** One frame of the orrery: the box, the sky and every body. */
export type OrbitSky = {
  width: number;
  height: number;
  compact: boolean;
  centre: Point;
  heartAt: Point;
  /** The heart's size, and how far it has risen. */
  sun: number;
  heartShown: number;
  /** The glow's colour (null: the theme's accent, with no heart) and radius. */
  glow: { tone: string | null; radius: number };
  stars: { x: number; y: number; radius: number; alpha: number }[];
  orbits: OrbitDrawn[];
  tethers: Tether[];
  /** The ring's bodies, nearest the top first (drawn in that order, each with its plate), then the hearts. */
  bodies: Body[];
  hearts: Body[];
};

/** Where a character is, for the orbit: null in a book with no chapters. */
function whereOf(p: { count: number }, chapters: number): string | null {
  if (chapters === 0) return null;
  if (p.count === 0) return 'not on the page yet';
  return `in ${formatNumber(p.count)} of ${plural(chapters, 'chapter')}`;
}

const distance = (a: Point, b: Point) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

/** The stars behind the orrery, scattered over `width` × `height` with Dart's Random(7): the same every time. */
export function orbitStars(width: number, height: number): { x: number; y: number; radius: number; alpha: number }[] {
  const random = new DartRandom(7);
  const out: { x: number; y: number; radius: number; alpha: number }[] = [];
  for (let i = 0; i < 90; i++) {
    const x = random.nextDouble() * width;
    const y = random.nextDouble() * height;
    const alpha = 0.08 + random.nextDouble() * 0.22;
    const radius = 0.4 + random.nextDouble() * 1.0;
    out.push({ x, y, radius, alpha });
  }
  return out;
}

/** The orrery for `found` (in a book of `order`), `width` wide, at `rise` (0 to 1) of its rising; `known` when the
 * page knows how well each is known; `lit`, the one hovered. */
export function orbitSky(
  found: readonly Listed[],
  order: StoryOrder,
  width: number,
  rise: number,
  options: { known?: ((l: Listed) => Known) | null; lit?: string | null } = {},
): OrbitSky {
  const known = options.known ?? null;
  const lit = options.lit ?? null;
  const chapters = order.chapters.length;
  const plan = orbitPlan(found, { hasChapters: chapters > 0 });
  const presence = new Map(found.map((l) => [l.entry.id, presenceOf(l, order)]));
  const heartMarks = Array.from({ length: chapters }, (_, i) => plan.heart.some((h) => presence.get(h.entry.id)!.chapters[i]));
  const share = (l: Listed) => {
    const p = presence.get(l.entry.id)!;
    if (p.count === 0) return 0;
    let together = 0;
    for (let i = 0; i < chapters; i++) if (p.chapters[i] && heartMarks[i]) together++;
    return together / p.count;
  };
  const most = [...presence.values()].reduce((m, p) => Math.max(m, p.count), 0);

  const compact = width < 600;
  const height = compact ? width * 1.2 : clamp(width * 0.56, 440.0, 640.0);
  const unit = Math.min(width, height);
  const big = clamp(unit * (compact ? 0.13 : 0.15), 42.0, 84.0);
  const small = big * 0.6;
  const sun = clamp(unit * 0.2, 64.0, 112.0) * (plan.heart.length > 1 ? 0.8 : 1);
  const centre = { x: width / 2, y: height / 2 };
  const rx0 = width / 2 - big / 2 - 14;
  const ry0 = height / 2 - big / 2 - 22;
  const rings = [...plan.rings];
  const k = rings.length;
  const inner = clamp(Math.max(0.4, (sun / 2 + big / 2 + 34) / ry0), 0.0, 0.8);
  const reach = (i: number) => (k === 1 ? (inner + 1) / 2 : inner + ((0.98 - inner) * i) / (k - 1));
  const risen = (from: number) => easeOutCubic(clamp((rise - from) / 0.6, 0.0, 1.0));
  // Where each ring is turned: so that no one sits straight behind someone on a ring further in, nor under the
  // heart's name. Measured on the page, so that where two rings run close (at their sides) they are kept apart too.
  const onRing = (theta: number, rx: number, ry: number): Point => ({
    x: centre.x + rx * Math.sin(theta),
    y: centre.y + -ry * Math.cos(theta),
  });
  const taken: Point[] = [{ x: centre.x + 0, y: centre.y + (sun / 2 + 10) }];
  const turn = (n: number, rx: number, ry: number): number => {
    const step = (2 * Math.PI) / n;
    let best = 0.0;
    let widest = -1.0;
    for (let c = 0; c < 36; c++) {
      const offset = (step * c) / 36;
      let gap = Infinity;
      for (let j = 0; j < n; j++) {
        const p = onRing(offset + step * j, rx, ry);
        for (const t of taken) gap = Math.min(gap, distance(p, t));
      }
      if (gap > widest + 1e-6) {
        widest = gap;
        best = offset;
      }
    }
    for (let j = 0; j < n; j++) taken.push(onRing(best + step * j, rx, ry));
    return best;
  };

  const body = (l: Listed, ring: OrbitRing | null, at: Point, size: number, shown: number, named: boolean): Body => {
    const heart = ring === null;
    const p = presence.get(l.entry.id)!;
    const where = whereOf(p, chapters);
    const k = known === null ? null : known(l);
    const tone = castTone(l.entry.id);
    return {
      listed: l,
      ring,
      heart,
      at,
      size,
      hit: Math.max(size, 48.0),
      shown: clamp(shown, 0.0, 1.0),
      share: heart ? 0 : share(l),
      named,
      plate: compact && !heart ? firstName(l.entry.name) : l.entry.name,
      plateTop: at.y + (heart ? sun : size) / 2 + (heart ? 6 : 2),
      faint: !heart && l.seenIn.length === 0 && chapters > 0,
      tone,
      band: size < 22 ? 0.0 : clamp(size * 0.06, 2.0, 4.0),
      known: k,
      where,
      semanticsLabel: [
        l.entry.name,
        ...l.profile.roles,
        ...(heart ? ['at the heart'] : []),
        ...(where !== null ? [where] : []),
        ...(k !== null && k.of > 0 ? [k.known >= k.of ? 'known well' : `known ${k.known} of ${k.of}`] : []),
      ].join(', '),
      tooltip: [
        l.entry.name,
        ...(l.profile.roles.length > 0 ? [l.profile.roles.join(', ')] : []),
        ...(where !== null ? [`${dartToUpperCase(where[0])}${where.substring(1)}`] : []),
        ...(k !== null && k.of > 0 ? [k.known >= k.of ? 'Known well' : `Known ${k.known} of ${k.of}`] : []),
      ].join(' · '),
    };
  };

  // The heart, side by side when there are two or three.
  const heartStep = sun * 0.62;
  const heartShown = easeOutBack(clamp(rise / 0.45, 0.0, 1.0));
  const hearts = plan.heart.map((l, j) => {
    const at = { x: centre.x + (j - (plan.heart.length - 1) / 2) * heartStep, y: centre.y + -8 };
    return body(l, null, at, Math.max(sun * heartShown, 1), heartShown, true);
  });

  const orbits: OrbitDrawn[] = [];
  const bodies: Body[] = [];
  rings.forEach(([ring, people], i) => {
    const f = reach(i);
    const rx = rx0 * f;
    const ry = ry0 * f;
    const t = risen(0.12 + i * 0.1);
    const dashed = ring === 'wings';
    orbits.push({ ring, rx, ry, dashed, shown: t, alpha: (dashed ? 0.6 : 0.85) * t });
    const n = people.length;
    const step = (2 * Math.PI) / n;
    const offset = turn(n, rx, ry);
    // Never so large as to touch the next on the ring, where the ring is tightest.
    const room = n === 1 ? big : ry * step * 0.9;
    people.forEach((l, j) => {
      const theta = offset + step * j - (1 - t) * 1.1;
      const r = 0.25 + 0.75 * t;
      const count = presence.get(l.entry.id)!.count;
      const grown = most === 0 ? 0.6 : Math.sqrt(count / most);
      // Further back (the top of the ring), a little smaller.
      const depth = 0.86 + (0.14 * (1 - Math.cos(theta))) / 2;
      const size = clamp(Math.min(small + (big - small) * grown, room) * depth, 8.0, big);
      const at = { x: centre.x + rx * r * Math.sin(theta), y: centre.y + -ry * r * Math.cos(theta) };
      bodies.push(body(l, ring, at, size, t, n <= (compact ? 8 : 12) && size >= 26));
    });
  });
  dartSort(bodies, (a, b) => compareNum(a.at.y, b.at.y));
  const heartAt =
    hearts.length === 0
      ? centre
      : { x: hearts.map((h) => h.at.x).reduce((a, b) => a + b) / hearts.length, y: hearts[0].at.y };

  const tethers: Tether[] = [];
  for (const b of bodies) {
    const isLit = lit === b.listed.entry.id;
    if (!(b.share > 0 || isLit)) continue;
    const strength = isLit ? 1.0 : b.share * b.shown;
    // A gentle arc, every one bent the same way round, as if the cast were turning about the heart.
    const mid = { x: heartAt.x * (1.0 - 0.5) + b.at.x * 0.5, y: heartAt.y * (1.0 - 0.5) + b.at.y * 0.5 };
    const along = { x: b.at.x - heartAt.x, y: b.at.y - heartAt.y };
    tethers.push({
      id: b.listed.entry.id,
      to: b.at,
      bend: { x: mid.x + -along.y * 0.16, y: mid.y + along.x * 0.16 },
      strength: b.share * b.shown,
      tone: b.tone,
      lit: isLit,
      width: isLit ? 2.4 : 0.8 + 1.6 * strength,
      mix: 0.4 + 0.6 * strength,
      alpha: 0.12 + 0.55 * strength,
    });
  }

  return {
    width,
    height,
    compact,
    centre,
    heartAt,
    sun,
    heartShown,
    glow: { tone: hearts.length === 0 ? null : castTone(hearts[0].listed.entry.id), radius: sun * 1.9 },
    stars: orbitStars(width, height),
    orbits,
    tethers,
    bodies,
    hearts,
  };
}

/** A tether's colour: outlineVariant (`line`, `#rrggbb`) mixed toward their tone, at its alpha. */
export function tetherColour(t: Tether, line: string): string {
  return mix(line, t.tone, t.mix, t.alpha);
}

/** The ring of how well someone is known, round a body: a track (outlineVariant at 70%) inset by half its
 * width, and the part known (the accent, round caps) from the top clockwise, `sweep` radians. */
export function knownRing(band: number, k: Known): { inset: number; width: number; part: number; sweep: number } {
  const part = k.known / k.of;
  return { inset: band / 2, width: band, part, sweep: 2 * Math.PI * clamp(part, 0.0, 1.0) };
}

/** The legend under the orrery: each ring with how many are on it (a sample of its line, the wings' broken: 4 drawn,
 * 3 left), what the drawing means, the one to know next (when the page knows how well each is known and can
 * interview), and who waits in the wings. */
export function orbitLegend(
  found: readonly Listed[],
  order: StoryOrder,
  options: { known?: ((l: Listed) => Known) | null; canInterview?: boolean } = {},
): {
  rings: { ring: OrbitRing; label: string; dashed: boolean }[];
  caption: string;
  next: { listed: Listed; known: Known; said: { name: string; rest: string }; button: string } | null;
  wings: string | null;
} {
  const known = options.known ?? null;
  const hasChapters = order.chapters.length > 0;
  const plan = orbitPlan(found, { hasChapters });
  const heartNames = andList(plan.heart.map((l) => l.entry.name));
  const lead = plan.heart.length === 1 ? firstName(plan.heart[0].entry.name) : 'the heart';
  const caption = [
    `At the heart, ${heartNames}; round them, clockwise from the top in the order they enter the book.`,
    ...(hasChapters
      ? [`The larger, the more chapters they are in; the brighter the line, the more they share the page with ${lead}.`]
      : []),
    ...(known !== null ? ['The ring round each is how well you know them.'] : []),
  ].join(' ');
  const next = known === null ? null : nextToKnow(plan, known);
  const wings = plan.rings.get('wings') ?? [];
  let nextShown: ReturnType<typeof orbitLegend>['next'] = null;
  if (next !== null && known !== null && options.canInterview === true) {
    const k = known(next);
    const standing = plan.heart.includes(next)
      ? 'at the heart of the book'
      : (plan.rings.get('principals')?.includes(next) ?? false)
        ? 'one of your principals'
        : 'in the cast';
    nextShown = {
      listed: next,
      known: k,
      said: { name: next.entry.name, rest: ` is ${standing}, and you know them ${k.known} of ${k.of}.` },
      button: `Interview ${firstName(next.entry.name)}`,
    };
  }
  return {
    rings: [...plan.rings].map(([ring, people]) => ({
      ring,
      label: `${orbitRingLabel[ring]} · ${formatNumber(people.length)}`,
      dashed: ring === 'wings',
    })),
    caption,
    next: nextShown,
    wings:
      wings.length === 0
        ? null
        : `In the wings, not on the page yet: ${andList(wings.slice(0, 6).map((l) => l.entry.name))}` +
          `${wings.length > 6 ? ` and ${formatNumber(wings.length - 6)} more` : ''}.`,
  };
}
