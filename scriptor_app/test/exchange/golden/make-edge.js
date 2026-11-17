// Writes the edge-case novel used to compare the TypeScript book and exports against the Dart.
const fs = require('fs');
const P = 'edge0000-0000-4000-8000-000000000000';
const t = (text, marks) => ({ type: 'text', text, ...(marks ? { marks: marks.map((m) => ({ type: m })) } : {}) });
const p = (content, attrs) => ({ type: 'paragraph', attrs: { textAlign: null, ...(attrs || {}) }, ...(content ? { content } : {}) });
const h = (level, text) => ({ type: 'heading', attrs: { level, textAlign: null }, content: [t(text)] });
const doc = (...content) => ({ type: 'doc', content });
const node = (id, kind, title, parentId, order, extra) => ({
  id, projectId: P, parentId, kind, title, order, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0,
  createdAt: 1, updatedAt: 1, ...(extra || {}),
});
const chapters = [
  node('v1', 'volume', 'Ο Δρόμος ΣΣ ß', null, 0, { notes: 'Volume notes\nsecond line' }),
  node('c1', 'chapter', 'Chapter 1', 'v1', 0, {
    noteBefore: '  Hi! *Read* this <first>.\nSecond line  ', noteAfter: 'Bye # now', notes: 'Private\n\nnote',
    summary: 'Sum', status: 'drafting',
  }),
  node('s1', 'scene', 'Opening', 'c1', 0),
  node('s2', 'scene', 'Second', 'c1', 0),
  node('s3', 'scene', 'Blank', 'c1', 1),
  node('c2', 'chapter', '', 'v1', 1, { summary: 'Only a summary', publication: 'published' }),
  node('a1', 'act', '   ', 'v1', 2),
  node('c3', 'chapter', 'ÉCOLE Ñandú — İstanbul', 'a1', 0),
  node('x1', 'interlude', 'Between', null, 3),
  node('c4', 'chapter', 'The Last; Bell!', 'x1', 0),
  node('o1', 'chapter', 'Blank parent', '  ', 4),
  node('orph', 'chapter', 'Orphan', 'missing', 0),
  node('s9', 'scene', 'Loose', null, 5),
  node('tie-B', 'chapter', 'Tie B', null, 6),
  node('tie-a', 'chapter', 'Tie a', null, 6),
  node('half', 'chapter', 'Half', null, 5.5, { createdAt: 0 }),
  node('noorder', 'chapter', 'No order', null, undefined),
  node('a2', 'arc', 'Empty arc', null, 7),
];
for (const c of chapters) if (c.order === undefined) delete c.order;
const contents = [
  ['c1', doc(p([t('The chapter’s own opening, before its scenes.')]), p())],
  ['s1', doc(
    p(),
    p([t('  Bold ', ['bold']), t('it', ['italic']), t('al', ['italic', 'bold']), t(' under', ['underline']), t(' gone ', ['strike']), { type: 'hardBreak' }, t('after break & <tag> "quoted"')]),
    p([t('Centered')], { textAlign: 'center' }),
    p([t('Right')], { textAlign: 'right' }),
    p([t('Justified')], { textAlign: 'justify' }),
    p([t('Left')], { textAlign: 'left' }),
    p([t('* * *')]),
    p([t('Specials: *star* _under_ #hash |pipe| [link] {brace} `tick` \\slash')]),
    p([t('1. starts like a list')]),
    p([t('- starts like a dash')]),
    p([t('+ plus')]),
    p([t('   ')]),
    { type: 'horizontalRule' },
    p(),
    { type: 'blockquote', content: [p([t('Quoted line')]), p([t('two'), { type: 'hardBreak' }, t('three')])] },
    h(1, 'Heading one'),
    h(2, 'Heading two'),
    { type: 'heading', attrs: { level: 7.9 }, content: [t('Deep')] },
    { type: 'heading', content: [t('No level')] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [p([t('alpha & <b>')])] }, { type: 'listItem', content: [p([t('beta')]), p([t('more')])] }] },
    { type: 'orderedList', content: [{ type: 'listItem', content: [p([t('first')])] }] },
    p([t('Last words of s1 ')]),
    p(),
  )],
  ['s2', doc(p([t('---')]), p([t('Second scene text. Don’t stop; e.g. 3.14 and 1,000 well-known.')]), p([t('~~~')]))],
  ['s3', doc(p(), p([t('  ')]), p())],
  ['c3', doc(p([t('Une école.')]), p([t('#')]), p([t('⁂')]), p([t('Après.')]))],
  ['c4', doc(p([t('Bell rings.', ['bold', 'italic', 'underline', 'strike'])]))],
  ['o1', doc(p([t('Blank parent text.')]))],
  ['orph', doc(p([t('Orphan text.')]))],
  ['s9', doc(p([t('A loose scene.')]))],
  ['tie-B', doc(p([t('B text.')]))],
  ['tie-a', doc(p([t('a text.')]))],
  ['half', doc(p([t('Half text.')]))],
  ['noorder', doc()],
].map(([id, d]) => ({ id, projectId: P, doc: d, updatedAt: 1 }));
const file = {
  format: 'novel-builder/project',
  version: 4,
  exportedAt: 0,
  project: {
    id: P, title: 'Straße & <Sigma> “ΟΔΟΣ”', subtitle: 'A "test" & more', author: '  İlse Ünal  ', language: 'fr',
    cover: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==', createdAt: 1, updatedAt: 1,
  },
  collections: {
    chapters,
    chapterContents: contents,
    bookMatter: [{
      id: 'm1', projectId: P, dedication: 'For A\n\n  \nand B', epigraph: '  Line one\nLine two  ', epigraphSource: ' Anon & co ',
      copyright: '© 2026 <me>', acknowledgements: 'Thanks "all"', aboutAuthor: 'Writes.', castTitle: '  ',
      castList: 'The House:\nMira — the heir\nTomas – a clerk\nOld Fen - the ferryman\n\n  Nobody  \nAlso: here\nA-B no spaces\n',
      sceneBreak: '', updatedAt: 1,
    }],
    chapterPlans: [
      { id: 'c1', projectId: P, objective: 'Get there', conflict: '  ', emotionalArc: 'Up', beats: [{ id: 'b1', text: 'One' }, { id: 'b2', text: '' }], entityIds: ['ent1', 'nobody', 7] },
      { id: 's2', projectId: P, objective: '', beats: [], entityIds: [] },
      { id: 'c3', projectId: P, objective: '', beats: [], entityIds: ['ent1'] },
    ],
    loreEntries: [{ id: 'ent1', projectId: P, name: 'Mira', category: 'character' }],
    chapterRevisions: [
      { id: 'r1', projectId: P, nodeId: 'c1', savedAt: 1700000000000, label: '', wordCount: 1234567, doc: doc() },
      { id: 'r2', projectId: P, nodeId: 'c1', savedAt: 1700000000000, label: 'Tie', wordCount: 12.0, branchName: 'Alt', doc: doc() },
      { id: 'r3', projectId: P, nodeId: 's1', savedAt: 1690000000000.7, label: 'Older', wordCount: 'x', doc: doc() },
      { id: 'r4', projectId: P, nodeId: 'orph', savedAt: 1710000000000, label: 'Orphan', wordCount: 5, doc: doc() },
    ],
    chapterBranches: [
      { id: 'br1', projectId: P, nodeId: 'c1', name: 'Alt', doc: doc(h(1, 'Alt heading'), p([t('Alt text', ['italic'])])) },
    ],
  },
};
fs.writeFileSync(process.argv[2], JSON.stringify(file, null, 1) + '\n');
