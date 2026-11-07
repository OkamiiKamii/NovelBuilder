// Reference outputs of the original app's canon and continuity review: the record check's rules, the canon review,
// the marks laid over the views, the knowledge checks and spread, the manuscript continuity check (word by word), the
// gathered review and its decisions, and the text helpers the manuscript check reads with. On real files and a
// generated canon novel (written beside the goldens so the Dart tests read the very same records).
// GOLDEN_OUT=<dir> npx vitest run golden/canon.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { checkRecords } from '@/modules/canon/checks';
import { badgeOf, canonOverlay, markWords, mergeMarks } from '@/modules/canon/overlay';
import { normalize, reviewCanon } from '@/modules/canon/review';
import { checkKnowledge, knowledgeSpread } from '@/modules/characters/knowledge';
import { audit } from '@/modules/continuity/audit';
import { ageOf, colourOf, coloursIn, durationsIn, excerptAround, find, fingerprint, isActing, isUsed, sentencesOf, toNumber } from '@/modules/continuity/text';
import { buildModel } from '@/modules/model/model';
import { reviewTimeline } from '@/modules/timeline/review';
import { collectWarnings, withStatus } from '@/modules/review/collect';
import { resolveCategories } from '@/modules/codex/schema';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES: Record<string, string> = {
  'qa-sample': '../qa/qa-sample.novel.json',
  'made-in-the-app': '../src/modules/projects/fixtures/made-in-the-app.novel.json',
};
const json = (value: unknown) => JSON.stringify(value, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? (Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity') : v instanceof Map ? Object.fromEntries(v) : v instanceof Set ? [...v] : v), 1);

// ---------------------------------------------------------------------------------------------------- the canon novel

function canonNovel() {
  const P = 'canon';
  let order = 0;
  const node = (id: string, title: string, kind: string, parentId: string | null = null) => ({ id, projectId: P, parentId, kind, title, order: order++, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, createdAt: order, updatedAt: 0 });
  const field = (id: string, key: string, value: string) => ({ id, key, value, type: 'text' });
  const entry = (id: string, name: string, category: string, fields: unknown[] = []) => ({ id, projectId: P, category, name, summary: '', description: '', image: null, notes: '', tags: [], fields, createdAt: order++, updatedAt: 0 });
  const text = (t: string, links: [string, string][] = []) => {
    // A paragraph whose linked words carry an entity link.
    const parts: unknown[] = [];
    let rest = t;
    for (const [words, entryId] of links) {
      const at = rest.indexOf(words);
      if (at < 0) continue;
      if (at > 0) parts.push({ type: 'text', text: rest.slice(0, at) });
      parts.push({ type: 'text', text: words, marks: [{ type: 'entityLink', attrs: { entryId } }] });
      rest = rest.slice(at + words.length);
    }
    if (rest) parts.push({ type: 'text', text: rest });
    return { type: 'paragraph', content: parts };
  };
  const doc = (...paragraphs: unknown[]) => ({ type: 'doc', content: paragraphs });
  const nodes = [node('c1', 'Chapter 1', 'chapter'), node('c2', 'Chapter 2', 'chapter'), node('s2a', 'The duel', 'scene', 'c2'), node('c3', 'Chapter 3', 'chapter'), node('c4', 'Chapter 4', 'chapter')];
  const contents = [
    { id: 'c1', projectId: P, doc: doc(text('Mira drew the Sunblade and raised it high.'), text('Orrin was nineteen years old, and his hands were steady.'), text('Her grey eyes shone with tears. Mira wept.'), text('They travelled for two days to reach Saltport from Greykeep.'), { type: 'heading', content: [{ type: 'text', text: 'Interlude' }] }, text('Orrin gripped the Sunblade with both hands.')), updatedAt: 0 },
    { id: 'c2', projectId: P, doc: doc(text('Mira smiled at the guard.'), text('They spoke of Mira often, and of the Sunblade.'), text('The Heiress said nothing.', [['The Heiress', 'mira']])), updatedAt: 0 },
    { id: 's2a', projectId: P, doc: doc(text('Deep underground, the caves were cold.'), text('Kai cast the fire spell anyway, half an hour later.')), updatedAt: 0 },
    { id: 'c3', projectId: P, doc: doc(text('The Sunblade lay forgotten.'), text('Orrin drew the Sunblade, the blade in his hand.'), text('Pell, 23, laughed.'), text('Alex’s hair was black as night.')), updatedAt: 0 },
    { id: 'c4', projectId: P, doc: doc(text('Mira returned, said nothing, and walked on.'), text('It took a week to reach Saltport from Greykeep.')), updatedAt: 0 },
  ];
  const entries = [
    entry('mira', 'Mira', 'character', [field('mira-eyes', 'Eyes', 'Blue'), field('mira-age', 'Age', '19')]),
    entry('orrin', 'Orrin', 'character', [field('orrin-age', 'Age', '20')]),
    entry('pell', 'Pell', 'character', [field('pell-age', 'Age', '25')]),
    entry('alex', 'Alex', 'character', [field('alex-hair', 'Hair', 'Blonde')]),
    entry('kai', 'Kai', 'character'),
    entry('sunblade', 'Sunblade', 'item'),
    entry('greykeep', 'Greykeep', 'location'),
    entry('saltport', 'Saltport', 'location'),
    entry('spell', 'Fire Spell', 'lore'),
    entry('guild', 'Guild', 'faction'),
    entry('crown', 'Crown', 'faction'),
  ];
  const rule = (id: string, kind: string, more: Record<string, unknown>) => ({ id, projectId: P, kind, entryId: null, aliases: [], state: null, label: '', words: [], scope: 'scene', holderId: null, toEntryId: null, amount: null, unit: 'days', fromNodeId: null, untilNodeId: null, note: '', createdAt: order++, updatedAt: 0, ...more });
  const continuityRules = [
    rule('r1', 'status', { entryId: 'mira', state: 'deceased', fromNodeId: 'c1', untilNodeId: 'c4' }),
    rule('r2', 'possession', { entryId: 'sunblade', state: 'held', holderId: 'mira', fromNodeId: 'c2' }),
    rule('r3', 'travel', { entryId: 'greykeep', toEntryId: 'saltport', amount: 10, unit: 'days' }),
    rule('r4', 'power', { entryId: 'spell', aliases: ['fire spell'], words: ['underground'], scope: 'scene', label: '' }),
    rule('r5', 'status', { entryId: 'orrin', state: 'condition', label: 'lost his left hand', words: ['both hands'] }),
    rule('r6', 'status', { entryId: 'pell', state: 'absent', fromNodeId: 'c2' }),
    rule('r7', 'possession', { entryId: 'sunblade', state: 'lost', fromNodeId: 'c2', untilNodeId: 'c3' }),
  ];
  const resolution = (id: string, key: string, kind: string, nodeId: string | null = null) => ({ id, projectId: P, key, kind, note: 'Remembered', message: 'm', nodeId, createdAt: 0, updatedAt: 0 });
  const continuityResolutions = [
    resolution('d1', 'status|r1|c2|mentioned', 'intentional', 'c2'),
    resolution('d2', 'status|r9|gone|x', 'dismissed'),
    resolution('d3', 'timeline|dates|nothing', 'resolved'),
    resolution('d4', 'records|opposed|l1|l2', 'review'),
    resolution('d5', 'canon|f3|unpaired', 'dismissed'),
  ];
  const source = (id: string, type: string, refId: string | null, quote = '') => ({ id, type, refId, block: null, quote, note: '', createdAt: 0 });
  const fact = (id: string, subject: string, statement: string, status: string, more: Record<string, unknown> = {}) => ({ id, projectId: P, subject, statement, kind: 'lore', status, entryIds: [], sources: [], conflictsWith: [], replacedById: null, dismissed: [], history: [], notes: '', createdAt: order++, updatedAt: 0, ...more });
  const canonFacts = [
    fact('f1', 'Royal Academy', 'Founded 1,000 years ago', 'canon', { sources: [source('src1', 'chapter', 'c1', 'founded')] }),
    fact('f2', 'royal academy', 'Founded 500 years ago', 'provisional'),
    fact('f3', 'Weather', 'It always rains', 'conflicting'),
    fact('f4', 'Age', '21', 'canon', { entryIds: ['orrin'] }),
    fact('f5', 'Old name', 'Called Westhold', 'retconned'),
    fact('f6', 'Older name', 'Called Easthold', 'retconned', { replacedById: 'f7' }),
    fact('f7', 'Newer name', 'Called Northhold', 'non-canon'),
    fact('f8', 'Moons', 'Two moons', 'canon', { conflictsWith: ['f9'] }),
    fact('f9', 'Sky', 'One moon', 'canon'),
    fact('f10', 'Dawn', 'The dawn was false', 'provisional', { sources: [source('src2', 'event', 'e-retcon'), source('src3', 'note', null)] }),
    fact('f11', 'Royal Academy', 'Founded long ago', 'canon', { dismissed: [{ factId: 'f1' }] }),
    fact('f12', 'Age', 'Orrin is 20', 'canon', { entryIds: ['orrin'] }),
    fact('f13', 'Eyes', 'Green', 'provisional', { entryIds: ['mira'], dismissed: [] }),
    fact('f14', 'Réal', 'Café crème', 'canon'),
    fact('f15', 'Real', 'Cafe creme', 'provisional'),
  ];
  const year = (y: number, month: number | null = null) => ({ precision: 'exact', year: y, month, day: null, hour: null, minute: null });
  const event = (id: string, name: string, when: unknown, more: Record<string, unknown> = {}) => ({ id, projectId: P, name, description: '', when, duration: null, importance: 'minor', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, threadIds: [], labels: [], createdAt: order++, ...more });
  const timelineEvents = [
    event('e1', 'The coronation', year(10)),
    event('e-retcon', 'The false dawn', year(11), { canon: 'retconned', nodeIds: ['c3'] }),
    event('e2', 'The aftermath', year(12), { afterId: 'e-retcon' }),
    event('e3', 'Two days on', { precision: 'relative', anchorId: 'e-retcon', amount: 2, unit: 'days', direction: 'after' }),
    event('e4', 'The vigil', year(13), { characters: [{ id: 'mira', age: null }], nodeIds: ['c3'] }),
    event('e5', 'A dream', year(14), { canon: 'non-canon' }),
  ];
  const chapterPlans = [{ id: 'c3', projectId: P, objective: '', beats: [], entityIds: [], appearIds: ['mira'], mentionIds: [], createdAt: 0, updatedAt: 0 }];
  const characterRelations = [{ id: 'rel1', projectId: P, fromId: 'mira', toId: 'orrin', stages: [{ id: 'st0', startNodeId: null, label: 'Friends' }, { id: 'st1', startNodeId: 'c2', label: 'Rivals' }], createdAt: 0, updatedAt: 0 }];
  const link = (id: string, fromId: string, toId: string, type: string, more: Record<string, unknown> = {}) => ({ id, projectId: P, fromId, toId, fromLabel: '', toLabel: '', createdAt: order++, type, ...more });
  const loreLinks = [
    link('l1', 'guild', 'crown', 'allied-with'),
    link('l2', 'crown', 'guild', 'at-war-with'),
    link('l3', 'mira', 'guild', 'member-of', { validity: { from: { kind: 'node', nodeId: 'c3' }, until: { kind: 'node', nodeId: 'c1' } } }),
    link('l4', 'orrin', 'guild', 'member-of', { validity: { from: { kind: 'date', when: year(10, 13) }, until: null } }),
    link('l5', 'pell', 'guild', 'member-of', { validity: { from: { kind: 'node', nodeId: 'gone-node' }, until: null } }),
    link('l6', 'kai', 'crown', 'member-of', { validity: { from: { kind: 'event', eventId: 'e-retcon' }, until: null } }),
    link('l7', 'alex', 'crown', 'member-of', { canon: 'non-canon', validity: { from: { kind: 'event', eventId: 'e-retcon' }, until: null } }),
    link('l8', 'alex', 'guild', 'related', { canon: 'provisional' }),
  ];
  const journeys = [{ id: 'j1', projectId: P, travellerIds: ['kai'], fromId: 'greykeep', toId: 'saltport', via: [], departure: { kind: 'node', nodeId: 'gone-node2' }, arrival: null, afterId: null, method: '', methodId: null, duration: null, distance: null, distanceUnit: '', eventIds: [], note: '', createdAt: 0, updatedAt: 0 }];
  const progressChanges = [{ id: 'p1', projectId: P, entryId: 'pell', categoryId: 'cat', action: 'set', subject: '', value: '3', refId: null, abilityId: null, at: { kind: 'event', eventId: 'e-retcon' }, cost: '', note: '', createdAt: 0, updatedAt: 0 }];
  const progressCategories = [{ id: 'cat', projectId: P, name: 'Level', shape: 'value', ladder: [], characterIds: [], order: 0, createdAt: 0, updatedAt: 0 }];
  const krec = (id: string, characterId: string, state: string, more: Record<string, unknown> = {}) => ({ id, characterId, state, belief: '', nodeId: null, eventId: null, how: '', fromId: null, ...more });
  const characterSecrets = [
    {
      id: 's1', projectId: P, entryId: 'mira', title: 'The heir', description: 'Mira is the heir', status: 'Hidden', self: 'knows', knows: ['alex'], suspects: [], unaware: [], reader: 'unaware', readerNodeId: null, firstNodeId: 'c1', revealNodeId: 'c4', revealEventId: 'e1', nodeIds: [], threadIds: [], notes: '',
      records: [
        krec('k1', 'orrin', 'unaware', { nodeId: 'c1', eventId: 'e1' }),
        krec('k2', 'pell', 'knows', { nodeId: 'c2', fromId: 'orrin', how: 'overheard' }),
        krec('k3', 'kai', 'false', { belief: 'Pell is the heir', nodeId: 'c1' }),
        krec('k4', 'orrin', 'knows', { eventId: 'e4', nodeId: 'c4' }),
        krec('k6', 'alex', 'suspects', { eventId: 'e2' }),
        krec('k5', 'kai', 'partial', {}),
      ],
      needs: [{ id: 'n1', characterId: 'orrin', nodeId: 'c2', eventId: null, note: 'uses it' }, { id: 'n2', characterId: 'kai', nodeId: 'c3', eventId: 'e2', note: '' }],
      createdAt: 0, updatedAt: 0,
    },
    { id: 's2', projectId: P, entryId: 'pell', title: 'Plain secret', description: '', status: 'Hidden', self: 'unaware', knows: [], suspects: ['orrin'], unaware: ['mira'], reader: 'knows', readerNodeId: null, firstNodeId: null, revealNodeId: null, revealEventId: null, nodeIds: [], threadIds: [], notes: '', createdAt: 0, updatedAt: 0 },
  ];
  const characterProfiles = [{ id: 'mira', projectId: P, entryId: 'mira', aliases: ['The Heiress'], createdAt: 0, updatedAt: 0 }];
  const duplicates = [entry('mira2', 'mira', 'character')];
  return {
    format: 'novel-builder/project',
    version: 4,
    exportedAt: 0,
    project: { id: P, title: 'Canon', createdAt: 0, updatedAt: 0 },
    collections: { chapters: nodes, chapterContents: contents, loreEntries: [...entries, ...duplicates], continuityRules, continuityResolutions, canonFacts, timelineEvents, chapterPlans, characterRelations, loreLinks, journeys, progressChanges, progressCategories, characterSecrets, characterProfiles },
  };
}

// ---------------------------------------------------------------------------------------------------- the report

function report(c: Record<string, any[]>, project: unknown) {
  const rows = (k: string) => (c[k] ?? []) as any[];
  const model = buildModel({ project, nodes: rows('chapters'), plans: rows('chapterPlans'), entries: rows('loreEntries'), schemas: rows('loreSchemas'), links: rows('loreLinks'), relations: rows('characterRelations'), events: rows('timelineEvents'), threads: rows('plotThreads'), systems: rows('systems'), sheets: rows('systemSheets'), timeline: null, calendar: rows('storyCalendars')[0] ?? null, progressCategories: rows('progressCategories'), progress: rows('progressChanges'), journeys: rows('journeys') } as any);
  const facts = rows('canonFacts').map((f) => ({ sources: [], conflictsWith: [], dismissed: [], history: [], entryIds: [], ...f }));
  const rules = rows('continuityRules');
  const resolutions = rows('continuityResolutions');
  const secrets = rows('characterSecrets');
  const categories = new Map(resolveCategories(rows('loreSchemas')).map((k) => [k.key, k]));
  const categoryOf = (key: string) => categories.get(key);
  const records = checkRecords(model, { facts, rules });
  const canon = reviewCanon(facts, [...model.entries.values()], [...model.nodes.values()], categoryOf);
  const timeline = reviewTimeline(model, rules);
  const auditResult = audit({ nodes: rows('chapters'), docs: new Map(rows('chapterContents').map((x) => [x.id, x.doc])), entries: rows('loreEntries'), rules: [...rules].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)), resolutions, categoryOf });
  const knowledge = checkKnowledge(secrets, model);
  const overlay = canonOverlay(model, { records, timeline, canon: canon.reviews, continuity: auditResult.open });
  const markOut = (m: any) => (m ? { status: m.status, warnings: m.warnings.map((w: any) => w.key), badge: badgeOf(m), words: markWords(m) } : null);
  const warnings = collectWarnings('P', { model, facts, rules, markers: rows('structureMarkers'), aliases: new Map(rows('characterProfiles').map((p) => [p.entryId, p.aliases ?? []])), secrets, travel: { settings: rows('travelSettings')[0] ?? null, maps: rows('worldMaps'), pins: rows('mapPins') }, snapshots: rows('progressSnapshots'), manuscript: [...auditResult.open, ...auditResult.resolved.map((r) => r.issue)] });
  const status = withStatus(warnings, resolutions, true);
  const statusUnchecked = withStatus(warnings, resolutions, false);
  return {
    records: records.map((f) => ({ ...f, refs: f.refs })),
    canon: { reviews: canon.reviews.map((r) => ({ fact: r.fact.id, flags: r.flags })), pairs: canon.pairs.map((p) => ({ a: p.a.id, b: p.b.id, stated: p.stated })) },
    audit: { open: auditResult.open, resolved: auditResult.resolved.map((r) => ({ issue: r.issue.key, resolution: r.resolution.id })), stale: auditResult.stale.map((r) => r.id), scanned: auditResult.scanned },
    knowledge,
    spread: Object.fromEntries(secrets.flatMap((s) => (['reading', 'story'] as const).map((axis) => [`${s.id}/${axis}`, (() => {
      const sp = knowledgeSpread(s, model, axis);
      return { points: sp.points, rows: sp.rows.map((r) => ({ characterId: r.characterId, name: r.name, cells: r.cells.map((x) => ({ record: x.record?.id ?? null, here: x.here.map((h) => h.id), needs: x.needs.map((n) => n.id) })), now: { state: r.now.state, record: r.now.record?.id ?? null, source: r.now.source }, unplaced: r.unplaced.map((u) => u.id) })), tellings: sp.tellings };
    })()]))),
    overlay: Object.fromEntries([...overlay.entries()].map(([k, m]) => [k, markOut(m)])),
    merged: markOut(mergeMarks([...overlay.values()].slice(0, 5))),
    warnings,
    status: { items: status.items.map((i) => ({ key: i.key, status: i.status, decision: i.decision?.id ?? null })), gone: status.gone.map((d) => d.id), goneUnchecked: statusUnchecked.gone.map((d) => d.id) },
  };
}

function textReport() {
  const samples = [
    'Mira drew the Sunblade and raised it high.',
    'Mira had said nothing; they spoke of Mira.',
    'said Mira, and Mira quietly smiled.',
    'The Sunblade in her hand gleamed. She pocketed the Sunblade.',
    'They rode for two days, then half an hour, then 3 weeks and a month. Twenty-two minutes later, nothing.',
    'Alex was nineteen years old. Twenty-year-old Alex laughed. Alex, 19, ran. Alex is 21 and tall.',
    'Her grey eyes shone. Alex’s hair was black. His hair is golden-brown. Whose blue-green eyes?',
    '“Run!” she cried. He ran… Then: nothing? Yes. “Done.” And so on.',
    'Ünïcödé names: Zoë met Éric at the Café. Zoë’s eyes were violet.',
  ];
  return {
    find: samples.map((s) => [find(s, ['Mira', 'Sunblade', 'Alex', 'Zoë', 'café']), find(s, ['café', 'TWO days', 'nothing'], true)]),
    acting: samples.map((s) => find(s, ['Mira', 'Alex', 'Zoë']).map((f) => isActing(s, f))),
    used: samples.map((s) => find(s, ['Sunblade']).map((f) => isUsed(s, f))),
    durations: samples.map(durationsIn),
    numbers: ['19', 'nineteen', 'twenty-two', 'a', 'hundred', 'twenty two', 'three point', '2.5', 'xyz'].map(toNumber),
    colours: samples.map(coloursIn),
    colourOf: samples.map((s) => [colourOf(s, 'eyes', ['Alex', 'Zoë']), colourOf(s, 'hair', ['Alex'])]),
    ages: samples.map((s) => sentencesOf(s).map((x) => ageOf(x, ['Alex']))),
    sentences: samples.map(sentencesOf),
    fingerprints: [...samples, '', '  Mixed   CASE  ', 'naïve ☃ 😀'].map(fingerprint),
    excerpts: [excerptAround('short', 2), excerptAround('x'.repeat(300) + ' MATCH ' + 'y'.repeat(300), 302), excerptAround('a '.repeat(200), 5), excerptAround('b '.repeat(200), 390)],
    normalize: ['Réal Café', 'ÉLAN, vital!', '  spaced   out ', 'naïve—ﬁne', 'Ångström 1,000', 'Œuvre'].map(normalize),
  };
}

test('canon', () => {
  const out: Record<string, unknown> = {};
  writeFileSync(join(OUT, 'canon.novel.json'), JSON.stringify(canonNovel(), null, 1));
  const files = { ...FIXTURES, canon: `${OUT}/canon.novel.json` };
  for (const [name, path] of Object.entries(files)) {
    const file = JSON.parse(readFileSync(path.startsWith('/') ? path : join(__dirname, path), 'utf8'));
    out[name] = report(file.collections, file.project);
  }
  out.text = textReport();
  writeFileSync(join(OUT, 'canon.golden.json'), json(out));
});
