// THE LOOM (Plan › Plot threads): each thread a strand across every chapter of the book, knotted where it develops,
// with the chapter it should resolve in, how far the words go, a frayed end when it has gone quiet, and a bracket over
// a long gap. The pure parts of flutter_app/lib/features/plot/widgets/loom.dart: where the strand sits (StrandPlan), the
// card's words, and the drawing as shapes for react-native-svg (`strandDrawing`, `legendDrawing`), in the Flutter
// painter's exact geometry.
//
// Colours are given by role, for the screen to resolve: `tone` (the thread's own colour, castTone(thread.id)), `track`
// (outlineVariant), `ink` (onSurfaceVariant) and `fray` (error); each with an alpha that replaces the colour's own (Flutter's
// `withValues(alpha:)`). The strand box is the card's width × 30.

import { plural } from '../../desk/format';
import type { BeatRole } from '../../records/thread';
import { type ThreadReport, beatPlace, openStatuses } from '../diagnostics';
import { categoryName } from '../plotChanges';
import { threadStatusName } from './threads';
import type { StoryModel } from '../../model/storyModel';
import { castTone } from '../../characters/screens/library';
import { dartTrim } from '../../text/dartString';

export type StrandKnot = { chapter: number; role: BeatRole };

/** Where a thread's strand sits on the loom: the chapter of each placed development (with its role), the chapter it
 * should resolve in, and how its end is drawn. Worked out from the report only; nothing is stored. */
export class StrandPlan {
  private constructor(
    readonly knots: StrandKnot[],
    readonly target: number | null,
    /** Still being told (active, paused, planned): its strand runs on to the words written so far. */
    readonly open: boolean,
    /** Resolved: the strand ends in a tied knot at its last development. */
    readonly tied: boolean,
    /** Abandoned or retconned: drawn faint. */
    readonly faded: boolean,
    /** Paused or planned: drawn in dashes. */
    readonly dashed: boolean,
    /** Flagged as gone quiet (active, or paused for long): the loose end frays. */
    readonly quiet: boolean,
    /** A long stretch without a development, flagged: bracketed over the strand. */
    readonly gap: { from: number; to: number } | null,
  ) {}

  static of(report: ThreadReport, targetChapter: number | null): StrandPlan {
    const status = report.thread.statusKey;
    const knots = report.beats.flatMap((b) => (b.chapter !== null && !b.missing ? [{ chapter: b.chapter, role: b.beat.role }] : []));
    // The widest stretch between developments, where the report flags one (the same stretch it names).
    let gap: { from: number; to: number } | null = null;
    if (report.issues.some((i) => i.kind === 'gap')) {
      const chapters = [...new Set(knots.map((k) => k.chapter))].sort((a, b) => a - b);
      for (let i = 1; i < chapters.length; i++) {
        if (gap === null || chapters[i] - chapters[i - 1] > gap.to - gap.from) gap = { from: chapters[i - 1], to: chapters[i] };
      }
    }
    return new StrandPlan(
      knots,
      targetChapter,
      openStatuses.includes(status),
      status === 'resolved',
      status === 'abandoned' || status === 'retconned',
      status === 'paused' || status === 'planned',
      report.issues.some((i) => i.kind === 'quiet' || i.kind === 'paused'),
      gap,
    );
  }

  get first(): number | null {
    return this.knots.length === 0 ? null : Math.min(...this.knots.map((k) => k.chapter));
  }
  get last(): number | null {
    return this.knots.length === 0 ? null : Math.max(...this.knots.map((k) => k.chapter));
  }

  /** The strand in words, for a screen reader (the drawing says nothing a word does not). */
  describe(chapterCount: number, frontier: number): string {
    if (chapterCount === 0) return 'No chapters yet';
    const last = this.last;
    const parts: string[] = [
      this.knots.length === 0
        ? 'No developments placed in chapters'
        : `Developments in chapter${this.knots.length === 1 ? '' : 's'} ${[...new Set(this.knots.map((k) => k.chapter))].join(', ')} of ${chapterCount}`,
    ];
    if (this.tied) parts.push(`tied off at chapter ${last}`);
    if (this.open && last !== null && frontier > last) parts.push(`loose since chapter ${last}, words written to chapter ${frontier}`);
    if (this.quiet) parts.push('gone quiet, worth a look');
    if (this.gap !== null) parts.push(`a long gap between chapters ${this.gap.from} and ${this.gap.to}, worth a look`);
    if (this.target !== null) parts.push(`to resolve in chapter ${this.target}`);
    return parts.join('; ');
  }

  /** The strand's reach in words: "Chapters 2–9 · tied off", "Chapters 3–5 · loose for 6 chapters". */
  span(frontier: number): string {
    const first = this.first;
    const last = this.last;
    if (first === null || last === null) return 'Not placed in any chapter yet';
    const reach = first === last ? `Chapter ${first}` : `Chapters ${first}–${last}`;
    if (this.tied) return `${reach} · tied off`;
    if (this.open && frontier > last) return `${reach} · loose for ${plural(frontier - last, 'chapter')}`;
    return reach;
  }
}

// ------------------------------------------------------------------------------------------------------ the drawing

export type LoomColor = 'tone' | 'track' | 'ink' | 'fray';
export type LoomPaint = { color: LoomColor; alpha: number };
export type LoomStroke = LoomPaint & { width: number; cap?: 'round' };
export type LoomShape =
  | { shape: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: LoomStroke }
  | { shape: 'circle'; cx: number; cy: number; r: number; fill?: LoomPaint; stroke?: LoomStroke }
  | { shape: 'path'; d: string; fill?: LoomPaint; stroke?: LoomStroke };

export type LoomMark = 'introduction' | 'development' | 'intersection' | 'resolution' | 'appears' | 'target' | 'frontier' | 'fray' | 'gap';

/** The marks used on the loom, said once above the threads (each drawn 18 × 14 by `legendDrawing`). */
export const loomLegend: readonly { mark: LoomMark; text: string }[] = [
  { mark: 'introduction', text: 'Introduced' },
  { mark: 'development', text: 'Develops' },
  { mark: 'intersection', text: 'Crosses another' },
  { mark: 'resolution', text: 'Resolved' },
  { mark: 'target', text: 'Meant to resolve' },
  { mark: 'frontier', text: 'Written so far' },
  { mark: 'fray', text: 'Gone quiet' },
  { mark: 'gap', text: 'Long gap' },
];

/** To a thousandth, rounding half away from zero (Dart's `(v * 1000).round() / 1000`), so both apps draw the same numbers. */
const n2 = (v: number) => (Math.sign(v) * Math.round(Math.abs(v) * 1000)) / 1000 + 0;

const diamond = (cx: number, cy: number, r: number) =>
  `M${n2(cx)} ${n2(cy - r)} L${n2(cx + r)} ${n2(cy)} L${n2(cx)} ${n2(cy + r)} L${n2(cx - r)} ${n2(cy)} Z`;

/** A knot's shapes at (cx, cy), in `alpha` of the tone (the strand's alpha: 1, or 0.5 when faded). */
function knot(cx: number, cy: number, mark: LoomMark, color: LoomColor, alpha: number): LoomShape[] {
  switch (mark) {
    case 'introduction':
      return [
        { shape: 'circle', cx, cy, r: 6, fill: { color, alpha: 0.2 } },
        { shape: 'circle', cx, cy, r: 6, stroke: { color, alpha, width: 2 } },
        { shape: 'circle', cx, cy, r: 2.5, fill: { color, alpha } },
      ];
    case 'development':
      return [{ shape: 'circle', cx, cy, r: 4.5, fill: { color, alpha } }];
    case 'intersection':
      return [
        { shape: 'circle', cx, cy, r: 4, fill: { color, alpha } },
        { shape: 'circle', cx, cy, r: 7, stroke: { color, alpha, width: 1.2 } },
      ];
    case 'resolution':
      return [{ shape: 'path', d: diamond(cx, cy, 6.5), fill: { color, alpha } }];
    case 'appears':
      return [{ shape: 'circle', cx, cy, r: 3, stroke: { color, alpha, width: 1.5 } }];
    case 'target':
      return [{ shape: 'path', d: diamond(cx, cy, 6), stroke: { color, alpha: 0.8, width: 1.2 } }];
    default:
      return [];
  }
}

/** A frayed end: the strand coming apart to the right of (x, y) into loose fibres of uneven length, each curling away. */
function fray(x: number, y: number): LoomShape[] {
  return (
    [
      [-6, 9],
      [-2, 11],
      [2.5, 8],
      [6, 10],
    ] as const
  ).map(([dy, reach]) => ({
    shape: 'path' as const,
    d: `M${n2(x)} ${n2(y)} Q${n2(x + reach * 0.5)} ${n2(y + dy * 0.2)} ${n2(x + reach)} ${n2(y + dy)}`,
    stroke: { color: 'fray' as const, alpha: 1, width: 1.4, cap: 'round' as const },
  }));
}

/** Dashes from (ax, y) to (bx, y), `on` long with `off` between (Flutter's loop: from a towards b). */
function dashes(ax: number, bx: number, y: number, stroke: LoomStroke, on: number, off: number): LoomShape[] {
  const length = Math.abs(bx - ax);
  if (length <= 0) return [];
  const step = (bx - ax) / length;
  const out: LoomShape[] = [];
  for (let d = 0, n = 0; d < length && n < 100000; d += on + off, n++) {
    out.push({ shape: 'line', x1: n2(ax + step * d), y1: y, x2: n2(ax + step * Math.min(d + on, length)), y2: y, stroke });
  }
  return out;
}

const markOf = (role: BeatRole): LoomMark => role;

/** The strand drawn in a box `width` × `height` (30 on the card). Empty with no chapters. */
export function strandDrawing(plan: StrandPlan, chapterCount: number, frontier: number, width: number, height = 30): LoomShape[] {
  if (chapterCount === 0) return [];
  const out: LoomShape[] = [];
  const inset = 10;
  const w = width - inset * 2 - 10;
  const y = height / 2;
  const x = (chapter: number) => inset + (w * (chapter - 0.5)) / chapterCount;
  const alpha = plan.faded ? 0.5 : 1;

  // The book: a faint warp thread with a tick per chapter (or per tenth chapter in a long book).
  const warp: LoomStroke = { color: 'track', alpha: 0.7, width: 1 };
  out.push({ shape: 'line', x1: inset, y1: y, x2: n2(inset + w), y2: y, stroke: warp });
  const every = chapterCount > 60 ? 10 : chapterCount > 24 ? 5 : 1;
  for (let n = 1; n <= chapterCount; n++) {
    if (n % every !== 0 && n !== 1) continue;
    out.push({ shape: 'line', x1: n2(x(n)), y1: y - 3, x2: n2(x(n)), y2: y + 3, stroke: warp });
  }

  // How far the words go.
  if (frontier > 0 && frontier <= chapterCount) {
    const fx = n2(x(frontier) + w / chapterCount / 2);
    out.push({ shape: 'line', x1: fx, y1: 1, x2: fx, y2: height - 1, stroke: { color: 'ink', alpha: 0.6, width: 1.5 } });
  }

  if (plan.target !== null && plan.target >= 1 && plan.target <= chapterCount) out.push(...knot(x(plan.target), y, 'target', 'tone', alpha));

  const first = plan.first;
  const last = plan.last;
  if (first === null || last === null) return out;

  // The strand between its first and last developments.
  const strand: LoomStroke = { color: 'tone', alpha, width: 3, cap: 'round' };
  if (plan.dashed) out.push(...dashes(x(first), x(last), y, strand, 6, 4));
  else if (last > first) out.push({ shape: 'line', x1: n2(x(first)), y1: y, x2: n2(x(last)), y2: y, stroke: strand });

  // A thread still being told runs loose to where the words stop; one to check frays there.
  if (plan.open && frontier > last && frontier <= chapterCount) {
    // Up to the "written so far" line, leaving room for the fray to reach it.
    const end = x(frontier) + w / chapterCount / 2 - (plan.quiet ? 11 : 0);
    out.push(...dashes(x(last), end, y, { color: 'tone', alpha: 0.45, width: 2, cap: 'round' }, 3, 4));
    if (plan.quiet) out.push(...fray(end, y));
  }

  // A flagged gap: a bracket over the stretch, in the warning colour.
  if (plan.gap !== null) {
    const a = x(plan.gap.from) + 8;
    const b = x(plan.gap.to) - 8;
    if (b > a) {
      const top = y - 9;
      out.push({
        shape: 'path',
        d: `M${n2(a)} ${n2(y - 4)} L${n2(a)} ${n2(top)} L${n2(b)} ${n2(top)} L${n2(b)} ${n2(y - 4)}`,
        stroke: { color: 'fray', alpha: 1, width: 1.5 },
      });
    }
  }

  for (const k of plan.knots) out.push(...knot(x(k.chapter), y, markOf(k.role), 'tone', alpha));
  if (plan.tied && plan.knots.every((k) => k.chapter !== last || k.role !== 'resolution')) out.push(...knot(x(last), y, 'resolution', 'tone', alpha));
  return out;
}

/** One mark of the legend, centred in a box of 18 × 14, in the `ink` colour (the fray and the gap in `fray`). */
export function legendDrawing(mark: LoomMark, width = 18, height = 14): LoomShape[] {
  const cx = width / 2;
  const cy = height / 2;
  switch (mark) {
    case 'frontier':
      return [{ shape: 'line', x1: cx, y1: 0, x2: cx, y2: height, stroke: { color: 'ink', alpha: 1, width: 1.5 } }];
    case 'fray':
      return fray(cx - 5, cy);
    case 'gap':
      return [{ shape: 'path', d: `M1 ${cy + 4} L1 ${cy - 3} L${width - 1} ${cy - 3} L${width - 1} ${cy + 4}`, stroke: { color: 'fray', alpha: 1, width: 1.5 } }];
    default:
      return knot(cx, cy, mark, 'ink', 1);
  }
}

// ------------------------------------------------------------------------------------------------------ the card

/** A thread on the loom, in words: its name with its kind and status, its premise, its strand's plan and reach, who it
 * follows and where it should end, its developments, and anything worth a look. The whole card opens the thread. */
export type StrandCard = {
  threadId: string;
  title: string;
  kind: string;
  premise: string | null;
  tone: string;
  plan: StrandPlan;
  /** The strand's words for a screen reader, or null with no chapters (then `noChapters` is said instead). */
  semanticsLabel: string | null;
  noChapters: string | null;
  span: string | null;
  follows: string | null;
  developments: { text: string; struck: boolean }[];
  noDevelopments: string | null;
  issues: string[];
};

export function strandCard(report: ThreadReport, model: StoryModel, frontier: number, chapterCount: number): StrandCard {
  const thread = report.thread;
  const people = thread.characterIds.flatMap((id) => {
    const e = model.entries.get(id);
    return e === undefined ? [] : [e.name];
  });
  const targetTitle = thread.targetNodeId === null ? '' : (model.nodes.get(thread.targetNodeId)?.title ?? '');
  const target = targetTitle.length > 0 ? targetTitle : dartTrim(String(thread.raw['targetNote'] ?? ''));
  const plan = StrandPlan.of(report, thread.targetNodeId === null ? null : (model.order.chapterNumber.get(thread.targetNodeId) ?? null));
  const status = threadStatusName(thread) ?? thread.statusKey;
  const follows = [...(people.length > 0 ? [people.join(', ')] : []), ...(target.length > 0 ? [`Resolves: ${target}`] : [])];
  return {
    threadId: thread.id,
    title: thread.title.length === 0 ? 'Untitled thread' : thread.title,
    kind: `${categoryName(thread)} · ${status}`,
    premise: dartTrim(thread.premise).length > 0 ? thread.premise : null,
    tone: castTone(thread.id),
    plan,
    semanticsLabel: chapterCount === 0 ? null : plan.describe(chapterCount, frontier),
    noChapters: chapterCount === 0 ? 'No chapters yet: the strand is drawn across them once there are some.' : null,
    span: chapterCount === 0 ? null : plan.span(frontier),
    follows: follows.length === 0 ? null : follows.join(' · '),
    developments: report.beats.map((p) => ({ text: `${beatPlace(p)} · ${p.beat.title.length === 0 ? '(appears)' : p.beat.title}`, struck: p.missing })),
    noDevelopments: report.beats.length === 0 ? 'No developments recorded yet.' : null,
    issues: report.issues.map((i) => i.message),
  };
}
