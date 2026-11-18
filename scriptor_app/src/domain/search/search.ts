// SEARCH ACROSS THE WHOLE NOVEL (FEATURES.md #355): every chapter and scene (title, headings, text, summary, notes,
// plan) and every World entry (name, summary, description, tags, fields as a reader sees them, notes) flattened into
// blocks with a precise address; a query finds the records holding every word of it (in the chosen scope), ranks them
// by where the words are, and shows the strongest passages in reading order. Read only: it never changes the novel.
// A port of flutter_app/lib/shared/domain/search/search.dart. (The Flutter app's scope "Codex" is Scriptor's World;
// `searchScopeLabel` says so, the key stays `codex`.)

import { dartEscape } from '../characters/pageText';
import { filledFields } from '../continuity/rules';
import { localeCompare } from '../exchange/collation';
import { type JsonMap, isMap, listOf, str } from '../json';
import { dartSort } from '../manuscript/dartSort';
import { planLabels, planTextFields } from '../plot/plotChanges';
import { docBlocks } from '../prose';
import { type Category, builtinCategoryKeys } from '../records/category';
import { type Entry } from '../records/entry';
import { type StoryNode } from '../records/storyNode';
import { dartTrim , dartToLowerCase } from '../text/dartString';

/** `node` (a chapter, scene or group) or `entry` (a World entry). */
export type SearchEntityType = 'node' | 'entry';

/** What a block of text is. */
export type SearchField =
  | 'title'
  | 'heading'
  | 'body'
  | 'summary'
  | 'notes'
  | 'plan'
  | 'name'
  | 'description'
  | 'tags'
  | 'attribute';

/** Where to look: everything, the manuscript, the world (the Flutter app's codex), or the author's notes. */
export type SearchScope = 'all' | 'manuscript' | 'codex' | 'notes';
export const searchScopes: readonly SearchScope[] = ['all', 'manuscript', 'codex', 'notes'];
/** The Flutter app's labels. */
export const searchScopeFlutterLabel: Readonly<Record<SearchScope, string>> = {
  all: 'Everything',
  manuscript: 'Manuscript',
  codex: 'Codex',
  notes: 'Notes',
};
/** As Scriptor says them: the codex is World. */
export const searchScopeLabel: Readonly<Record<SearchScope, string>> = {
  all: 'Everything',
  manuscript: 'Manuscript',
  codex: 'World',
  notes: 'Notes',
};

/** One block of text with a precise address. `group` is `manuscript`, `notes`, or the category of an entry. */
export type SearchBlock = {
  /** `<entityId>:<field>:<index>`. */
  id: string;
  entityType: SearchEntityType;
  entityId: string;
  entityTitle: string;
  /** A chapter's kind (`chapter`, `scene`…) or an entry's category. */
  entityKind: string;
  group: string;
  field: SearchField;
  /** A field's name (`attribute`) or a plan field's (`plan`). */
  label: string;
  /** Paragraph number for text; line or row otherwise. */
  index: number;
  text: string;
};

const lines = (text: string): string[] => text.split('\n');

/** Every searchable block of a chapter, scene or group. */
export function nodeBlocks(node: StoryNode, doc: unknown, plan: JsonMap | null): SearchBlock[] {
  const blocks: SearchBlock[] = [];
  const add = (group: string, field: SearchField, index: number, text: string, label = '') => {
    if (dartTrim(text).length === 0) return;
    blocks.push({
      id: `${node.id}:${field}:${index}`,
      entityType: 'node',
      entityId: node.id,
      entityTitle: node.title,
      entityKind: str(node.raw['kind']),
      group,
      field,
      label,
      index,
      text,
    });
  };
  add('manuscript', 'title', 0, node.title);
  docBlocks(doc).forEach((b, i) => add('manuscript', b.heading ? 'heading' : 'body', i, b.text));
  lines(node.summary).forEach((t, i) => add('notes', 'summary', i, t));
  lines(str(node.raw['notes'])).forEach((t, i) => add('notes', 'notes', i, t));
  if (plan !== null) {
    planTextFields.forEach((f, i) => add('notes', 'plan', i, str(plan[f]), planLabels[f] ?? f));
    listOf(plan['beats'])
      .filter(isMap)
      .forEach((beat, i) => add('notes', 'plan', 100 + i, str(beat['text']), `Beat ${i + 1}`));
  }
  return blocks;
}

/** Every searchable block of an entry. Field values are indexed as a reader sees them. */
export function entryBlocks(entry: Entry, category: Category, nameOf: (entryId: string) => string | null): SearchBlock[] {
  const blocks: SearchBlock[] = [];
  const add = (group: string, field: SearchField, index: number, text: string, label = '') => {
    if (dartTrim(text).length === 0) return;
    blocks.push({
      id: `${entry.id}:${field}:${index}`,
      entityType: 'entry',
      entityId: entry.id,
      entityTitle: entry.name,
      entityKind: entry.category,
      group,
      field,
      label,
      index,
      text,
    });
  };
  add(entry.category, 'name', 0, entry.name);
  lines(entry.summary).forEach((t, i) => add(entry.category, 'summary', i, t));
  lines(entry.description).forEach((t, i) => add(entry.category, 'description', i, t));
  add(
    entry.category,
    'tags',
    0,
    listOf(entry.raw['tags'])
      .filter((t): t is string => typeof t === 'string')
      .join(', '),
  );
  filledFields(entry, category, nameOf).forEach((f, i) => add(entry.category, 'attribute', i, f.text, f.label));
  lines(str(entry.raw['notes'])).forEach((t, i) => add('notes', 'notes', i, t));
  return blocks;
}

export type SnippetPart = { text: string; hit: boolean };

export type Snippet = {
  blockId: string;
  field: SearchField;
  label: string;
  /** The block's position, for jumping to the exact paragraph. */
  index: number;
  /** The tail of the paragraph before and the head of the one after, for context. */
  before: string;
  parts: SnippetPart[];
  after: string;
  /** The matched words as written, to find them again at the destination. */
  term: string;
};

export type EntityResult = {
  entityType: SearchEntityType;
  entityId: string;
  title: string;
  kind: string;
  group: string;
  matchCount: number;
  snippets: Snippet[];
};

type Ranking = { result: EntityResult; score: number; ranked: { block: SearchBlock; score: number }[] };

export type GroupResult = { group: string; matchCount: number; items: EntityResult[] };

/** Built-in groups in their fixed order; the author's own categories follow them, before notes. */
export const groupOrder: readonly string[] = ['manuscript', ...builtinCategoryKeys];
export const minQueryLength = 2;

const snippetsPerEntity = 3;
const windowBefore = 110;
const windowAfter = 190;
const contextLength = 140;

/** Where a match counts most when ranking. */
const fieldWeight: Readonly<Record<SearchField, number>> = {
  title: 100,
  name: 100,
  heading: 40,
  tags: 30,
  summary: 20,
  attribute: 15,
  description: 10,
  body: 10,
  notes: 10,
  plan: 10,
};

/** The query's words, lower-cased, without repeats, at most twelve. */
export function queryTerms(query: string): string[] {
  const out: string[] = [];
  for (const t of dartToLowerCase(query).split(/\s+/)) {
    if (t.length > 0 && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 12);
}

function inScope(group: string, scope: SearchScope): boolean {
  switch (scope) {
    case 'all':
      return true;
    case 'manuscript':
      return group === 'manuscript';
    case 'notes':
      return group === 'notes';
    case 'codex':
      return group !== 'manuscript' && group !== 'notes';
  }
}

/** Cuts at a word boundary and marks the cut with an ellipsis. */
function clip(text: string, start: number, end: number): { text: string; offset: number } {
  let from = start < 0 ? 0 : start;
  let to = end > text.length ? text.length : end;
  if (from > 0) {
    const space = text.indexOf(' ', from);
    from = space !== -1 && space < start + 30 ? space + 1 : from;
  }
  if (to < text.length) {
    const space = text.lastIndexOf(' ', to);
    to = space > end - 30 ? space : to;
  }
  if (to < from) to = from;
  return {
    text: `${from > 0 ? '…' : ''}${text.substring(from, to)}${to < text.length ? '…' : ''}`,
    offset: from - (from > 0 ? 1 : 0),
  };
}

function highlight(text: string, pattern: RegExp): SnippetPart[] {
  const parts: SnippetPart[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const start = m.index;
    const end = start + m[0].length;
    if (end === start) continue;
    if (start > last) parts.push({ text: text.substring(last, start), hit: false });
    parts.push({ text: m[0], hit: true });
    last = end;
  }
  if (last < text.length) parts.push({ text: text.substring(last), hit: false });
  return parts;
}

function firstMatch(pattern: RegExp, text: string): { start: number; text: string } | null {
  pattern.lastIndex = 0;
  const m = pattern.exec(text);
  pattern.lastIndex = 0;
  return m === null ? null : { start: m.index, text: m[0] };
}

/** JavaScript's sort is stable; so is this one, as the Dart port says it. */
function stableSort<T>(list: T[], compare: (a: T, b: T) => number): void {
  const indexed = list.map((v, i) => [i, v] as const);
  indexed.sort((a, b) => {
    const c = compare(a[1], b[1]);
    return c !== 0 ? c : a[0] - b[0];
  });
  indexed.forEach((e, i) => (list[i] = e[1]));
}

const compareNum = (a: number, b: number): number => (a < b ? -1 : a > b ? 1 : 0);
const compareCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** An in-memory keyword index over a novel's blocks: one pass to build, a scan of lower-cased text per query. */
export class SearchIndex {
  private readonly lower: string[] = [];
  private readonly byEntity = new Map<string, number[]>();
  private readonly byId = new Map<string, number>();

  constructor(readonly blocks: readonly SearchBlock[]) {
    blocks.forEach((b, i) => {
      this.lower.push(dartToLowerCase(b.label.length > 0 ? `${b.label} ${b.text}` : b.text));
      this.byId.set(b.id, i);
      let list = this.byEntity.get(b.entityId);
      if (list === undefined) this.byEntity.set(b.entityId, (list = []));
      list.push(i);
    });
  }

  get size(): number {
    return this.blocks.length;
  }

  private neighbour(block: SearchBlock, delta: number): string {
    if (block.field !== 'body' && block.field !== 'heading') return '';
    // Blank paragraphs are not indexed, so look a little further for the nearest text.
    for (let step = 1; step <= 3; step++) {
      for (const field of ['body', 'heading']) {
        const i = this.byId.get(`${block.entityId}:${field}:${block.index + delta * step}`);
        if (i !== undefined) return this.blocks[i].text;
      }
    }
    return '';
  }

  private snippet(block: SearchBlock, pattern: RegExp): Snippet {
    const shown = block.label.length > 0 ? `${block.label}: ${block.text}` : block.text;
    const first = firstMatch(pattern, shown)?.start ?? -1;
    const at = first < 0 ? 0 : first;
    const window = clip(shown, at - windowBefore, at + windowAfter);
    const previous = this.neighbour(block, -1);
    const next = this.neighbour(block, 1);
    return {
      blockId: block.id,
      field: block.field,
      label: block.label,
      index: block.index,
      before: window.offset <= 0 && previous.length > 0 ? clip(previous, previous.length - contextLength, previous.length).text : '',
      parts: highlight(window.text, pattern),
      after: window.text.endsWith('…') || next.length === 0 ? '' : clip(next, 0, contextLength).text,
      term: firstMatch(pattern, block.text)?.text ?? '',
    };
  }

  /** The records that hold every word of `query` (within `scope`), grouped and ranked, each with its strongest
   * passages in reading order. */
  search(query: string, scope: SearchScope): GroupResult[] {
    const terms = queryTerms(query);
    if (dartTrim(query).length < minQueryLength || terms.length === 0) return [];
    const everyTerm = (1 << terms.length) - 1;
    const sorted = dartSort([...terms], (a, b) => compareNum(b.length, a.length));
    const pattern = new RegExp(sorted.map(dartEscape).join('|'), 'giu');
    const results = new Map<string, Ranking>();
    const order: string[] = [];

    for (const indexes of this.byEntity.values()) {
      // A record matches when every word of the query appears somewhere in it (within the chosen scope).
      let seen = 0;
      const hits: { i: number; mask: number }[] = [];
      for (const i of indexes) {
        if (!inScope(this.blocks[i].group, scope)) continue;
        let mask = 0;
        for (let t = 0; t < terms.length; t++) {
          if (this.lower[i].includes(terms[t])) mask |= 1 << t;
        }
        if (mask !== 0) hits.push({ i, mask });
        seen |= mask;
      }
      if (seen !== everyTerm) continue;
      for (const { i, mask } of hits) {
        const block = this.blocks[i];
        const key = `${block.entityId}|${block.group}`;
        let r = results.get(key);
        if (r === undefined) {
          order.push(key);
          r = {
            result: {
              entityType: block.entityType,
              entityId: block.entityId,
              title: block.entityTitle,
              kind: block.entityKind,
              group: block.group,
              matchCount: 0,
              snippets: [],
            },
            score: 0,
            ranked: [],
          };
          results.set(key, r);
        }
        const score = fieldWeight[block.field] + (mask === everyTerm ? 25 : 0);
        r.result.matchCount++;
        r.score = (r.score > score ? r.score : score) + 1;
        r.ranked.push({ block, score });
      }
    }

    const ranked = order.map((k) => results.get(k)!);
    stableSort(ranked, (a, b) => {
      const s = compareNum(b.score, a.score);
      return s !== 0 ? s : localeCompare(a.result.title, b.result.title);
    });
    const groups = new Map<string, { matchCount: number; items: EntityResult[] }>();
    for (const r of ranked) {
      // The strongest passages, in reading order.
      const strongest = [...r.ranked];
      stableSort(strongest, (a, b) => {
        const s = compareNum(b.score, a.score);
        return s !== 0 ? s : compareNum(a.block.index, b.block.index);
      });
      const kept = strongest.slice(0, snippetsPerEntity);
      stableSort(kept, (a, b) => compareNum(a.block.index, b.block.index));
      r.result.snippets = kept.map((k) => this.snippet(k.block, pattern));
      const g = groups.get(r.result.group) ?? { matchCount: 0, items: [] };
      g.items.push(r.result);
      groups.set(r.result.group, { matchCount: g.matchCount + r.result.matchCount, items: g.items });
    }
    const custom = dartSort(
      [...groups.keys()].filter((g) => !groupOrder.includes(g) && g !== 'notes'),
      compareCodeUnits,
    );
    const out: GroupResult[] = [];
    for (const g of [...groupOrder, ...custom, 'notes']) {
      const found = groups.get(g);
      if (found !== undefined) out.push({ group: g, matchCount: found.matchCount, items: found.items });
    }
    return out;
  }
}
