import { LORE_CATEGORIES } from '@/modules/codex/types';
import type { EntityResult, GroupResult, SearchBlock, SearchEngine, SearchField, SearchGroup, SearchScope, Snippet, SnippetPart } from './types';

/** Built-in groups in their fixed order; groups for categories the author created follow them, before notes. */
export const GROUP_ORDER: SearchGroup[] = ['manuscript', ...LORE_CATEGORIES];
export const MIN_QUERY_LENGTH = 2;

const SNIPPETS_PER_ENTITY = 3;
const WINDOW_BEFORE = 110;
const WINDOW_AFTER = 190;
const CONTEXT = 140;

/** Where a match counts for most when ranking. */
const FIELD_WEIGHT: Record<SearchField, number> = { title: 100, name: 100, heading: 40, tags: 30, summary: 20, attribute: 15, description: 10, body: 10, notes: 10, plan: 10 };

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const queryTerms = (query: string): string[] => [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))].slice(0, 12);

const inScope = (group: SearchGroup, scope: SearchScope): boolean =>
  scope === 'all' || (scope === 'manuscript' ? group === 'manuscript' : scope === 'notes' ? group === 'notes' : group !== 'manuscript' && group !== 'notes');

/** Cuts at a word boundary and marks the cut with an ellipsis. */
function clip(text: string, start: number, end: number): { text: string; offset: number } {
  let from = Math.max(0, start);
  let to = Math.min(text.length, end);
  if (from > 0) {
    const space = text.indexOf(' ', from);
    from = space !== -1 && space < start + 30 ? space + 1 : from;
  }
  if (to < text.length) {
    const space = text.lastIndexOf(' ', to);
    to = space > end - 30 ? space : to;
  }
  return { text: `${from > 0 ? '…' : ''}${text.slice(from, to)}${to < text.length ? '…' : ''}`, offset: from - (from > 0 ? 1 : 0) };
}

function highlight(text: string, pattern: RegExp): SnippetPart[] {
  const parts: SnippetPart[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), hit: false });
    parts.push({ text: match[0], hit: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false });
  return parts;
}

/**
 * An in-memory keyword index over a project's blocks. Building it is one pass;
 * each query is a scan of lower-cased strings, which stays in the low
 * milliseconds for a novel-sized project (see the performance test).
 */
export function buildIndex(blocks: SearchBlock[]): SearchEngine & { size: number } {
  const lower = blocks.map((b) => (b.label ? `${b.label} ${b.text}` : b.text).toLowerCase());
  const byEntity = new Map<string, number[]>();
  const byId = new Map<string, number>();
  blocks.forEach((block, i) => {
    byId.set(block.id, i);
    const list = byEntity.get(block.entityId);
    if (list) list.push(i);
    else byEntity.set(block.entityId, [i]);
  });

  const neighbour = (block: SearchBlock, delta: number): string => {
    if (block.field !== 'body' && block.field !== 'heading') return '';
    // Blank paragraphs are not indexed, so look a little further for the nearest text.
    for (let step = 1; step <= 3; step++) {
      for (const field of ['body', 'heading']) {
        const i = byId.get(`${block.entityId}:${field}:${block.index + delta * step}`);
        if (i !== undefined) return blocks[i].text;
      }
    }
    return '';
  };

  function snippet(block: SearchBlock, pattern: RegExp): Snippet {
    const shown = block.label ? `${block.label}: ${block.text}` : block.text;
    const first = shown.search(pattern);
    const at = Math.max(0, first);
    const window = clip(shown, at - WINDOW_BEFORE, at + WINDOW_AFTER);
    const previous = neighbour(block, -1);
    const next = neighbour(block, 1);
    return {
      blockId: block.id,
      field: block.field,
      label: block.label,
      index: block.index,
      before: window.offset <= 0 && previous ? clip(previous, previous.length - CONTEXT, previous.length).text : '',
      parts: highlight(window.text, pattern),
      after: window.text.endsWith('…') || !next ? '' : clip(next, 0, CONTEXT).text,
      term: block.text.match(pattern)?.[0] ?? '',
    };
  }

  return {
    size: blocks.length,

    search(query, scope) {
      const terms = queryTerms(query);
      if (query.trim().length < MIN_QUERY_LENGTH || !terms.length) return [];
      const everyTerm = (1 << terms.length) - 1;
      const pattern = new RegExp(terms.sort((a, b) => b.length - a.length).map(escapeRegExp).join('|'), 'giu');
      const results = new Map<string, EntityResult & { score: number; ranked: { block: SearchBlock; score: number }[] }>();

      for (const indexes of byEntity.values()) {
        // An entity matches when every word of the query appears somewhere in it (within the chosen scope).
        let seen = 0;
        const hits: { i: number; mask: number }[] = [];
        for (const i of indexes) {
          if (!inScope(blocks[i].group, scope)) continue;
          let mask = 0;
          for (let t = 0; t < terms.length; t++) if (lower[i].includes(terms[t])) mask |= 1 << t;
          if (mask) hits.push({ i, mask });
          seen |= mask;
        }
        if (seen !== everyTerm) continue;

        for (const { i, mask } of hits) {
          const block = blocks[i];
          const key = `${block.entityId}|${block.group}`;
          let result = results.get(key);
          if (!result) {
            result = { entityType: block.entityType, entityId: block.entityId, title: block.entityTitle, kind: block.entityKind, group: block.group, matchCount: 0, snippets: [], score: 0, ranked: [] };
            results.set(key, result);
          }
          const score = FIELD_WEIGHT[block.field] + (mask === everyTerm ? 25 : 0);
          result.matchCount++;
          result.score = Math.max(result.score, score) + 1;
          result.ranked.push({ block, score });
        }
      }

      const groups = new Map<SearchGroup, GroupResult>();
      for (const { ranked, score: _score, ...result } of [...results.values()].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))) {
        // Show the strongest passages, in reading order.
        result.snippets = ranked
          .sort((a, b) => b.score - a.score || a.block.index - b.block.index)
          .slice(0, SNIPPETS_PER_ENTITY)
          .sort((a, b) => a.block.index - b.block.index)
          .map(({ block }) => snippet(block, pattern));
        const group = groups.get(result.group) ?? { group: result.group, matchCount: 0, items: [] };
        group.matchCount += result.matchCount;
        group.items.push(result);
        groups.set(result.group, group);
      }
      const custom = [...groups.keys()].filter((group) => !GROUP_ORDER.includes(group) && group !== 'notes').sort();
      return [...GROUP_ORDER, ...custom, 'notes'].flatMap((group) => groups.get(group) ?? []);
    },
  };
}
