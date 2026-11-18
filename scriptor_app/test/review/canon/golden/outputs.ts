// Scriptor's outputs for phase 7's canon port, keyed and shaped as dump.dart's, so the agreement test can compare them
// with the Flutter app's (canon.golden.json). See dump.dart for what is read.

import { CanonChanges } from '../../../../src/domain/canon/canonChanges';
import { checkRecords } from '../../../../src/domain/canon/checks';
import { FactSource, factSources, factWords, quoted } from '../../../../src/domain/canon/facts';
import { type OverlayMark, badgeOf, canonKey, canonOverlay, markWords, mergeMarks } from '../../../../src/domain/canon/overlay';
import { type FactPair, type FactReview, type Flag, describeSource, normalize, reviewCanon } from '../../../../src/domain/canon/review';
import { ChangeRefused } from '../../../../src/domain/codex/codexChanges';
import { type Consequence, type Report, analyze, worldFromRows } from '../../../../src/domain/consequences/consequences';
import { audit } from '../../../../src/domain/continuity/audit';
import { ContinuityRule } from '../../../../src/domain/continuity/rules';
import { type JsonMap, str } from '../../../../src/domain/json';
import { StoryModel } from '../../../../src/domain/model/storyModel';
import { isDocument } from '../../../../src/domain/outline';
import { docBlocks } from '../../../../src/domain/prose';
import { CanonFact } from '../../../../src/domain/records/canon';
import { maps } from '../../../../src/domain/records/jsonRecord';
import { ReviewItem } from '../../../../src/domain/records/review';
import { NovelSnapshot } from '../../../../src/domain/snapshot/novelSnapshot';
import { reviewTimeline } from '../../../../src/domain/timeline/review';
import { dartToUpperCase } from '../../../../src/domain/exchange/dartUpperCase';
import { dartTrim } from '../../../../src/domain/text/dartString';

// ---------------------------------------------------------------------------------------------------- as JSON

const flagJson = (f: Flag) => ({
  key: f.key,
  kind: f.kind,
  otherId: f.otherId,
  message: f.message,
  dismiss: f.dismiss === null ? null : { factId: f.dismiss.factId, entryId: f.dismiss.entryId, field: f.dismiss.field },
});

const canonJson = (r: { reviews: FactReview[]; pairs: FactPair[] }) => ({
  reviews: r.reviews.map((x) => ({ fact: x.fact.id, flags: x.flags.map(flagJson) })),
  pairs: r.pairs.map((p) => ({ a: p.a.id, b: p.b.id, stated: p.stated })),
});

function markJson(m: OverlayMark | null): JsonMap | null {
  if (m === null) return null;
  const badge = badgeOf(m);
  return {
    status: m.status === null ? null : { key: m.status.key, label: m.status.label, hint: m.status.hint, glyph: m.status.glyph },
    warnings: m.warnings.map((w) => ({ key: w.key, source: w.source, severity: w.severity, title: w.title, rule: w.rule, message: w.message, because: w.because })),
    badge: badge === null ? null : { glyph: badge.glyph, tone: badge.tone },
    words: markWords(m),
  };
}

const consequenceJson = (c: Consequence) => ({
  key: c.key,
  tier: c.tier,
  kind: c.kind,
  message: c.message,
  basis: c.basis,
  target: c.target,
  excerpt: c.excerpt,
  match: c.match,
  nodeId: c.nodeId,
  entryIds: c.entryIds,
  threadId: c.threadId,
  relationId: c.relationId,
  eventId: c.eventId,
  factId: c.factId,
});

const reportJson = (r: Report) => ({
  title: r.title,
  found: r.found,
  anchorIds: r.anchorIds,
  seeds: r.seeds.map((e) => e['id']),
  suggested: r.suggested.map((e) => e['id']),
  established: r.established.map(consequenceJson),
  potential: r.potential.map(consequenceJson),
  summary: r.summary.map((p) => ({ label: p.label, count: p.count })),
  summaryLine: r.summaryLine,
  downstream: r.downstream,
});

// ------------------------------------------------------------------------------------------------------ a novel

const byCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const stableRules = (rules: ContinuityRule[]) =>
  [...rules].sort((a, b) => {
    const c = a.createdAt - b.createdAt;
    return c !== 0 ? c : byCodeUnits(a.id, b.id);
  });

function script(start: NovelSnapshot): unknown[] {
  let snapshot = start;
  let clock = 5000;
  let ids = 0;
  const out: unknown[] = [];
  const step = (name: string, change: (c: CanonChanges) => unknown) => {
    const c = new CanonChanges(snapshot, { now: ++clock, createId: () => `id${++ids}` });
    try {
      const result = change(c);
      snapshot = c.snapshot;
      out.push({ step: name, result: result instanceof FactSource ? result.raw : (result ?? null), facts: snapshot.rows('canonFacts') });
    } catch (e) {
      if (!(e instanceof ChangeRefused)) throw e;
      out.push({ step: name, refused: e.message });
    }
  };

  const model = StoryModel.fromSnapshot(start);
  const docs = [...model.nodes.values()]
    .filter((n) => isDocument(n.kind) && model.order.position.has(n.id))
    .sort((a, b) => model.order.position.get(a.id)! - model.order.position.get(b.id)!);
  const entry = [...model.entries.values()][0]?.id ?? null;
  const event = [...model.events.values()][0]?.id ?? null;
  const doc = docs[0]?.id ?? null;
  let quote: string | null = null;
  if (doc !== null) {
    const blocks = docBlocks(start.rows('chapterContents').find((r) => r['id'] === doc)?.['doc']);
    const long = blocks.filter((b) => dartTrim(b.text).length > 12);
    const text = long.length === 0 ? null : dartTrim(long[long.length - 1].text);
    if (text !== null) quote = dartToUpperCase(text.substring(2, text.length > 30 ? 30 : text.length));
  }
  const existing = start.rows('canonFacts').map((r) => str(r['id']));
  const some = (...xs: (string | null)[]) => xs.filter((x): x is string => x !== null);

  step('create', (c) => c.create({ subject: '  The Academy ', statement: ' Founded long ago ', entryIds: some(entry, 'gone', entry) }).id);
  step('create canon', (c) => c.create({ subject: 'The Academy', statement: 'Founded 900 years ago', status: 'canon', kind: 'nope' }).id);
  step('create blank', (c) => c.create().id);
  step('update provisional', (c) => c.update('id1', { statement: 'Founded 1,000 years ago', subject: '   ', kind: 'rule', notes: 'Check' }));
  step('update established', (c) => c.update('id3', { statement: 'Other' }));
  step('update missing', (c) => c.update('nope', { notes: 'x' }));
  step('set status', (c) => c.setStatus('id1', 'canon', '  Decided '));
  step('set same status', (c) => c.setStatus('id1', 'canon'));
  step('revise retcon', (c) => c.revise('id1', 'Founded 500 years ago', { reason: 'Book two' }));
  step('revise minor', (c) => c.revise('id1', 'Founded 500 years ago.', { minor: true }));
  step('revise same', (c) => c.revise('id1', 'Founded 500 years ago.'));
  step('annotate', (c) => c.annotate('id1', 'id2', 'Settled'));
  step('annotate missing', (c) => c.annotate('id1', 'nope', 'x'));
  if (doc !== null) step('source chapter', (c) => c.addSource('id1', { type: 'chapter', refId: doc, quote: quote ?? 'nothing' }));
  if (doc !== null) step('source chapter block', (c) => c.addSource('id1', { type: 'chapter', refId: doc, block: 3 }));
  if (entry !== null) step('source entry', (c) => c.addSource('id1', { type: 'entry', refId: entry, block: 2 }));
  if (event !== null) step('source event', (c) => c.addSource('id1', { type: 'event', refId: event }));
  step('source gone', (c) => c.addSource('id1', { type: 'event', refId: 'gone', note: ' notebook ' }));
  step('source odd', (c) => c.addSource('id1', { type: 'odd', note: 'p. 12' }));
  step('link', (c) => c.linkConflict('id1', 'id3'));
  step('link self', (c) => c.linkConflict('id1', 'id1'));
  if (existing.length > 0) step('link existing', (c) => c.linkConflict(existing[0], 'id1'));
  step('unlink', (c) => c.unlinkConflict('id3', 'id1'));
  step('dismiss fact', (c) => c.dismiss('id3', { factId: 'id1', entryId: null, field: null }));
  step('dismiss twice', (c) => c.dismiss('id3', { factId: 'id1', entryId: null, field: null }));
  step('dismiss field', (c) => c.dismiss('id1', { factId: null, entryId: entry ?? 'x', field: 'Age' }));
  step('dismiss nothing', (c) => c.dismiss('id1', { factId: null, entryId: null, field: 'Age' }));
  step('undismiss', (c) => c.undismiss('id1'));
  step('replaced', (c) => c.update('id1', { replacedById: { value: 'id3' } }));
  step('replaced self', (c) => c.update('id3', { replacedById: { value: 'id3' } }));
  step('entries', (c) => c.update('id1', { entryIds: some(entry, 'nope') }));
  if (doc !== null) step('locate', (c) => c.locate(doc, quote ?? 'nothing'));
  step('remove source', (c) => c.removeSource('id1', 'id9'));
  step('remove', (c) => c.removeFact('id5'));
  step('remove missing', (c) => c.removeFact('nope'));
  return out;
}

export function novel(s: NovelSnapshot): Record<string, unknown> {
  const model = StoryModel.fromSnapshot(s);
  const facts = s.rows('canonFacts').map((r) => new CanonFact(r));
  const rules = stableRules(s.rows('continuityRules').map((r) => new ContinuityRule(r)));
  const decisions = s.rows('continuityResolutions').map((r) => new ReviewItem(r));
  const categoryOf = (k: string) => model.categories.get(k) ?? null;
  const canon = reviewCanon(facts, [...model.entries.values()], [...model.nodes.values()], categoryOf);
  const records = checkRecords(model, { facts, rules });
  const timeline = reviewTimeline(
    model,
    rules.map((r) => r.raw),
  );
  const docs = new Map(s.rows('chapterContents').map((r) => [str(r['id']), r['doc']]));
  const audited = audit(model, docs, rules, decisions);
  const overlay = canonOverlay(model, { records, timeline, canon: canon.reviews, continuity: audited.open });
  const world = worldFromRows((c) => s.rows(c));
  const reports: Record<string, unknown> = {};
  // The Flutter app never finishes a subtree with a parent cycle (edge has one), so there it is left out on both sides.
  const parent = new Map(world.nodes.map((n) => [n.id, n.parentId]));
  const cycles = world.nodes.some((n) => {
    const seen = new Set<string>();
    let x: string | null | undefined = n.id;
    while (x != null && !seen.has(x)) {
      seen.add(x);
      x = parent.get(x);
    }
    return x != null;
  });
  if (cycles) reports['skipped'] = 'a parent cycle';
  for (const n of cycles ? [] : world.nodes) reports[`node:${n.id}`] = reportJson(analyze(world, { kind: 'node', nodeId: n.id }));
  for (const e of cycles ? [] : world.events) reports[`event:${str(e['id'])}`] = reportJson(analyze(world, { kind: 'event', eventId: str(e['id']) }));
  for (const t of cycles ? [] : world.threads) {
    for (const b of maps(t['beats'])) {
      reports[`beat:${str(t['id'])}/${str(b['id'])}`] = reportJson(analyze(world, { kind: 'beat', threadId: str(t['id']), beatId: str(b['id']) }));
    }
  }
  if (!cycles && world.nodes.length > 0 && world.entries.length > 0) {
    reports['chosen'] = reportJson(
      analyze(world, { kind: 'node', nodeId: world.nodes[0].id }, { include: [str(world.entries[world.entries.length - 1]['id']), 'gone'], exclude: [str(world.entries[0]['id'])] }),
    );
  }
  return {
    canon: canonJson(canon),
    sources: facts.flatMap((f) =>
      factSources(f).map((source) =>
        describeSource(source, {
          node: (id) => model.nodes.get(id),
          entry: (id) => model.entries.get(id),
          event: (id) => model.events.get(id)?.name,
          category: categoryOf,
        }),
      ),
    ),
    overlay: Object.fromEntries([...overlay.entries()].map(([k, v]) => [k, markJson(v)])),
    merged: markJson(mergeMarks(overlay.values())),
    consequences: reports,
    script: script(s),
  };
}

// --------------------------------------------------------------------------------------------------------- misc

export function misc(): Record<string, unknown> {
  const fact = (
    id: string,
    subject: string,
    statement: string,
    status: string,
    o: { entryIds?: string[]; conflicts?: string[]; sources?: JsonMap[]; dismissed?: JsonMap[]; createdAt?: number } = {},
  ): JsonMap => ({
    id,
    subject,
    statement,
    status,
    entryIds: o.entryIds ?? [],
    conflictsWith: o.conflicts ?? [],
    sources: o.sources ?? [],
    dismissed: o.dismissed ?? [],
    createdAt: o.createdAt ?? 0,
  });
  const snapshot = new NovelSnapshot({
    project: { id: 'p', title: 'Misc' },
    collections: {
      loreEntries: [
        {
          id: 'alex',
          category: 'character',
          name: 'Alex',
          fields: [
            { id: 'f1', key: 'Age', value: '19', type: 'text' },
            { id: 'f2', key: 'Eyes', value: 'grey', type: 'text' },
          ],
        },
      ],
      chapters: [{ id: 'c1', kind: 'chapter', title: 'Chapter 1', order: 0 }],
    },
  });
  const model = StoryModel.fromSnapshot(snapshot);
  const facts = [
    new CanonFact(fact('a', 'Age', 'Alex is 19', 'canon', { entryIds: ['alex'] })),
    new CanonFact(fact('b', 'Age', 'Alex is 20', 'provisional', { entryIds: ['alex'], createdAt: 1 })),
    new CanonFact(fact('c', 'Eyes', 'Blue', 'conflicting', { entryIds: ['alex'], sources: [{ id: 's', type: 'chapter', refId: 'c1', block: 4 }] })),
    new CanonFact(fact('d', 'Moons', 'Two', 'canon', { conflicts: ['e'] })),
    new CanonFact(fact('e', 'Moons', 'Three', 'retconned')),
    new CanonFact(fact('f', 'Moons', 'One', 'provisional', { dismissed: [{ factId: 'd' }] })),
    new CanonFact(fact('g', 'Weather', 'Rain', 'conflicting')),
    new CanonFact(fact('h', 'MOONS!', ' two ', 'provisional')),
  ];
  const r = reviewCanon(facts, [...model.entries.values()], [...model.nodes.values()], (k) => model.categories.get(k) ?? null);
  return {
    review: canonJson(r),
    normalize: ['Réal Café', 'ÉLAN, vital!', '  spaced  out ', 'naïve—ﬁne', ''].map((t) => normalize(t)),
    quoted: [quoted('short'), quoted(`  ${'x'.repeat(100)}  `)],
    words: facts.map(factWords),
    keys: [canonKey('a', 'fact:b'), canonKey('a', 'field:alex:age'), canonKey('a', 'unpaired')],
  };
}
