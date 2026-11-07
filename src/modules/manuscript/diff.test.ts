import { describe, expect, it } from 'vitest';
import { diffDocs, diffParagraphs, diffWords, type DiffBlock } from './diff';

/** Renders a comparison as text: {+added+} [-removed-]. */
const show = (blocks: DiffBlock[]) =>
  blocks.map((block) => {
    if (block.kind === 'changed') return `~ ${block.parts.map((p) => (p.op === 'same' ? p.text : p.op === 'add' ? `{+${p.text}+}` : `[-${p.text}-]`)).join('')}`;
    if (block.kind === 'moved') return `${block.side === 'from' ? '<' : '>'} ${block.text}`;
    return `${{ same: ' ', added: '+', removed: '-' }[block.kind]} ${block.text}`;
  });

const rebuild = (blocks: DiffBlock[], side: 'before' | 'after') =>
  blocks.flatMap((block) => {
    if (block.kind === 'changed') return [block.parts.filter((p) => p.op === 'same' || p.op === (side === 'after' ? 'add' : 'del')).map((p) => p.text).join('')];
    if (block.kind === 'moved') return (block.side === 'to') === (side === 'after') ? [block.text] : [];
    if (block.kind === 'same') return [block.text];
    return (block.kind === 'added') === (side === 'after') ? [block.text] : [];
  });

describe('word diff', () => {
  it('marks added, removed and replaced words', () => {
    expect(diffWords('The gate was black.', 'The old gate was black.')).toEqual([{ op: 'same', text: 'The ' }, { op: 'add', text: 'old ' }, { op: 'same', text: 'gate was black.' }]);
    expect(diffWords('She ran quickly home.', 'She ran home.')).toEqual([{ op: 'same', text: 'She ran ' }, { op: 'del', text: 'quickly ' }, { op: 'same', text: 'home.' }]);
    expect(diffWords('Mira laughed.', 'Mira wept.')).toEqual([{ op: 'same', text: 'Mira ' }, { op: 'del', text: 'laughed' }, { op: 'add', text: 'wept' }, { op: 'same', text: '.' }]);
    expect(diffWords('same text', 'same text')).toEqual([{ op: 'same', text: 'same text' }]);
    expect(diffWords('', 'new')).toEqual([{ op: 'add', text: 'new' }]);
  });

  it('keeps spacing exactly, including double spaces and indents', () => {
    const before = '\t"Wait."  She turned.';
    const after = '\t"Wait."  She turned away.';
    const parts = diffWords(before, after);
    expect(parts.filter((p) => p.op !== 'del').map((p) => p.text).join('')).toBe(after);
    expect(parts.filter((p) => p.op !== 'add').map((p) => p.text).join('')).toBe(before);
    expect(diffWords('one  two', 'one two')).toEqual([{ op: 'same', text: 'one' }, { op: 'del', text: '  ' }, { op: 'add', text: ' ' }, { op: 'same', text: 'two' }]);
  });
});

describe('paragraph diff', () => {
  const before = ['The road ended at a wall.', 'Mira touched the gate.', 'Nobody answered.', 'She waited until dark.'];

  it('reports identical texts as identical', () => {
    const result = diffParagraphs(before, [...before]);
    expect(result.identical).toBe(true);
    expect(result.stats).toMatchObject({ wordsAdded: 0, wordsRemoved: 0, paragraphsChanged: 0, wordsBefore: 16, wordsAfter: 16 });
  });

  it('shows additions, deletions and edits in place', () => {
    const after = ['The road ended at a wall.', 'A crow watched from above.', 'Mira touched the cold gate twice.', 'She waited until dark.'];
    const result = diffParagraphs(before, after);
    expect(show(result.blocks)).toEqual([
      '  The road ended at a wall.',
      '+ A crow watched from above.',
      '~ Mira touched the {+cold +}gate{+ twice+}.',
      '- Nobody answered.',
      '  She waited until dark.',
    ]);
    expect(result.stats).toMatchObject({ wordsBefore: 16, wordsAfter: 21, wordsAdded: 7, wordsRemoved: 2, paragraphsChanged: 3 });
    expect(result.stats.charactersAfter - result.stats.charactersBefore).toBe(after.join('').length - before.join('').length);
  });

  it('recognises a moved paragraph', () => {
    const after = ['Nobody answered.', 'The road ended at a wall.', 'Mira touched the gate.', 'She waited until dark.'];
    expect(show(diffParagraphs(before, after).blocks)).toEqual([
      '> Nobody answered.',
      '  The road ended at a wall.',
      '  Mira touched the gate.',
      '< Nobody answered.',
      '  She waited until dark.',
    ]);
    expect(diffParagraphs(before, after).stats).toMatchObject({ wordsAdded: 0, wordsRemoved: 0, paragraphsChanged: 2 });
  });

  it('treats an unrelated replacement as a removal plus an addition, not an edit', () => {
    expect(show(diffParagraphs(['Rain fell on the black gate.'], ['Completely different sentence here now.']).blocks)).toEqual([
      '- Rain fell on the black gate.',
      '+ Completely different sentence here now.',
    ]);
  });

  it('always reconstructs both versions exactly from its output', () => {
    let seed = 42;
    const random = (max: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % max;
    const words = ['ash', 'gate', 'Mira', 'ran', 'the', 'a', 'storm', 'key', 'said', '"No."', 'and', 'fell'];
    const paragraph = () => Array.from({ length: 3 + random(12) }, () => words[random(words.length)]).join(random(5) ? ' ' : '  ');
    for (let round = 0; round < 60; round++) {
      const a = Array.from({ length: random(12) }, paragraph);
      const b = a.flatMap((p) => {
        const roll = random(10);
        if (roll === 0) return [];
        if (roll === 1) return [p, paragraph()];
        if (roll === 2) return [p.split(' ').filter((_, i) => i !== 1).join(' ') + ' extra'];
        return [p];
      });
      if (random(4) === 0 && b.length > 2) b.push(b.shift()!);
      const { blocks, stats } = diffParagraphs(a, b);
      expect(rebuild(blocks, 'after')).toEqual(b);
      expect(rebuild(blocks, 'before')).toEqual(a);
      expect(stats.wordsAfter - stats.wordsBefore).toBe(stats.wordsAdded - stats.wordsRemoved);
    }
  });

  it('compares saved documents, ignoring formatting', () => {
    const p = (...content: object[]) => ({ type: 'paragraph', content });
    const before = { type: 'doc', content: [p({ type: 'text', text: 'Mira laughed.' }), p({ type: 'text', text: 'The end.' })] };
    const after = { type: 'doc', content: [p({ type: 'text', text: 'Mi' }, { type: 'text', marks: [{ type: 'bold' }], text: 'ra' }, { type: 'text', text: ' laughed loudly.' }), p({ type: 'text', text: 'The end.' })] };
    expect(show(diffDocs(before, after).blocks)).toEqual(['~ Mira laughed{+ loudly+}.', '  The end.']);
    expect(diffDocs(before, before).identical).toBe(true);
    expect(diffDocs(null, before).stats).toMatchObject({ wordsBefore: 0, wordsAfter: 4, wordsAdded: 4 });
  });

  it('handles a long chapter quickly', () => {
    const chapter = Array.from({ length: 400 }, (_, i) => `Paragraph ${i} ${'lorem ipsum dolor sit amet '.repeat(5)}`);
    const edited = chapter.map((p, i) => (i % 25 === 0 ? `${p}with an added clause` : p)).filter((_, i) => i % 40 !== 7);
    const start = performance.now();
    const result = diffParagraphs(chapter, edited);
    expect(performance.now() - start).toBeLessThan(500);
    expect(result.blocks.filter((b) => b.kind === 'changed')).toHaveLength(16);
    expect(result.blocks.filter((b) => b.kind === 'removed')).toHaveLength(10);
  });
});
