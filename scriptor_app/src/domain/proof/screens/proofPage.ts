// BEFORE A READER SEES IT on screen: every slip in the book, as a proofreader marks them, each in its sentence with the
// slip marked in red, what it is, and where; a kind at a time or all. "Read it there" opens the chapter at it, to be
// put right by hand: nothing here changes a word. The pure parts of flutter_app/lib/features/review/proof_page.dart and
// of the More card that reads the book for it (app/shell/proof_card.dart).

import { readingOrder } from '../../model/storyOrder';
import { isDocument } from '../../outline';
import { type JsonMap } from '../../json';
import { StoryNode } from '../../records/storyNode';
import { dartTrim } from '../../text/dartString';
import { type Proof, type Slip, proofsJob, slipTitle, slips } from '../proof';

/** The proofreader's red. */
export const proofRed = '#B5402F';

/** What the proof reads, from the novel's rows as stored: its chapters and scenes in reading order with their titles,
 * and the names the book holds (every entry's, trimmed). */
export function proofInputs(chapterRows: readonly JsonMap[], entryRows: readonly JsonMap[]) {
  const nodes = readingOrder(chapterRows.map((r) => new StoryNode(r))).filter((n) => isDocument(n.kind));
  const titles = new Map(nodes.map((n) => [n.id, n.title]));
  const names = new Set<string>();
  for (const r of entryRows) {
    const name = typeof r['name'] === 'string' ? r['name'] : r['name'] === null || r['name'] === undefined ? '' : String(r['name']);
    if (dartTrim(name).length > 0) names.add(dartTrim(name));
  }
  return { order: nodes.map((n) => n.id), titles, names };
}

/** The proof of the book, from the chapters as stored (`CharacterService.storedChapters`): a job to run away from the
 * screen. */
export function proofReading(storedContents: readonly string[], chapterRows: readonly JsonMap[], entryRows: readonly JsonMap[]) {
  const { order, titles, names } = proofInputs(chapterRows, entryRows);
  return { titles, run: proofsJob(storedContents, order, titles, names) };
}

/** The page as shown: what is said at the top, the chips (all, then each kind found, with its count) and the slips the
 * chip chosen leaves. */
export function proofView(proofs: readonly Proof[], title: string, only: Slip | null) {
  const counts = new Map<Slip, number>();
  for (const p of proofs) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
  const n = proofs.length;
  return {
    heading: 'Before a reader sees it',
    said:
      n === 0
        ? `Nothing to check in ${title}: it reads clean.`
        : `${n === 1 ? 'One thing' : `${n} things`} to check in ${title}, as a proofreader would mark ` +
          'them. Nothing here changes your words: each is put right in its chapter.',
    chips:
      n === 0
        ? []
        : [
            { kind: null as Slip | null, label: `All ${n}`, selected: only === null },
            ...slips
              .filter((k) => counts.has(k))
              .map((k) => ({ kind: k as Slip | null, label: `${slipTitle[k]} ${counts.get(k)}`, selected: only === k })),
          ],
    shown: proofs.filter((p) => only === null || p.kind === only),
  };
}

/** A chip pressed: the one chosen again shows all. */
export function proofChipPressed(only: Slip | null, kind: Slip | null): Slip | null {
  return kind === null ? null : only === kind ? null : kind;
}

/** A slip's card: its kind in capitals, its sentence split round the slip, what is said, and where. */
export function proofCard(p: Proof, chapterTitle: string) {
  return {
    kind: slipTitle[p.kind].toUpperCase(),
    before: p.text.substring(0, p.start),
    marked: p.end > p.start ? p.text.substring(p.start, p.end) : '',
    after: p.text.substring(p.end),
    note: p.note,
    where: dartTrim(chapterTitle).length === 0 ? `Chapter ${p.chapter}` : `Chapter ${p.chapter} · ${dartTrim(chapterTitle)}`,
    read: 'Read it there',
    /** A slip with no words to find (a chapter with no title or no words) opens the chapter itself. */
    findsWords: p.find.length > 0,
  };
}

/** The title the page names the book by. */
export function proofTitle(novelTitle: string): string {
  return dartTrim(novelTitle).length === 0 ? 'your book' : dartTrim(novelTitle);
}
