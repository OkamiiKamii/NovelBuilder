// Relationships: a port of flutter_app/test/shared/domain/relationships_test.dart (agreement with the original app's
// history and network on real files and a generated court, and its relationship, type and attribute tests), and the
// relationship parts of history_test.dart.

import { join } from 'node:path';

import { ChangeRefused } from '../../src/domain/codex/codexChanges';
import { type JsonMap, jsonEquals } from '../../src/domain/json';
import { StoryModel } from '../../src/domain/model/storyModel';
import { sortedStages, stageAt } from '../../src/domain/model/storyOrder';
import { CharacterRelation } from '../../src/domain/records/relation';
import { stageDifferences, timelineOf } from '../../src/domain/relationships/history';
import {
  Across,
  AsOf,
  Ever,
  type NetworkFilter,
  Now,
  type When,
  layoutNetwork,
  relationNetwork,
  stageShown,
} from '../../src/domain/relationships/network';
import { RelationChanges, type StageInput } from '../../src/domain/relationships/relationChanges';
import { TrackedAttribute } from '../../src/domain/relationships/relationTypes';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../fixtures';
import { NovelBuilder, stage } from '../model/builder';

const codeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The original test's report: what tool/golden/relationships.test.ts wrote from the original TypeScript app. */
function originalReport(s: NovelSnapshot): JsonMap {
  const model = StoryModel.fromSnapshot(s);
  const chapters = model.order.chapters.map((c) => c.id);
  const ids = (category: string) =>
    [...model.entries.values()]
      .filter((e) => e.category === category)
      .map((e) => e.id)
      .sort(codeUnits);
  const characters = ids('character');
  const factions = ids('faction');
  const name = (id: string) => model.entries.get(id)?.name ?? '?';
  const attributes = [new TrackedAttribute('trust', 'Trust')];
  const timelines: JsonMap = {};
  for (const r of model.relations.values()) {
    timelines[r.id] = timelineOf(r, model.order).map((t, i) => ({
      stage: t.stage.id,
      range: t.range,
      orphaned: t.orphaned,
      changes: stageDifferences(i === 0 ? null : timelineOf(r, model.order)[i - 1].stage, t.stage, {
        fromName: name(r.fromId),
        toName: name(r.toId),
        attributes,
      }),
    }));
  }
  const whens: [string, When][] = [
    ['current', new Now()],
    ['ever', new Ever()],
  ];
  if (chapters.length > 2) {
    whens.push(['at3', new AsOf(chapters[2])]);
    whens.push([
      'range',
      new Across(chapters.length > 1 ? chapters[1] : null, chapters.length > 3 ? chapters[3] : null),
    ]);
  }
  const filters: [string, NetworkFilter][] = [
    ['all', {}],
    ['ever', { when: new Ever() }],
    ['isolated', { isolated: true }],
    ['friends', { type: 'friends' }],
    ['noSocial', { hidden: new Set(['social', 'connection'] as const) }],
    ['faction', { factionId: factions[0] ?? null }],
    ['focus1', { focus: characters.length === 0 ? null : { id: characters[0], depth: 1 } }],
    ['focus2', { focus: characters.length === 0 ? null : { id: characters[0], depth: 2 } }],
  ];
  if (chapters.length > 2) filters.push(['at3', { when: new AsOf(chapters[2]) }]);
  const shown: JsonMap = {};
  for (const [k, w] of whens) {
    const byRelation: JsonMap = {};
    for (const r of model.relations.values()) byRelation[r.id] = stageShown(r, model, w)?.id ?? null;
    shown[k] = byRelation;
  }
  const networks: JsonMap = {};
  for (const [k, f] of filters) {
    const net = relationNetwork(model, f);
    networks[k] = {
      nodes: net.nodes.map((n) => ({ id: n.id, name: n.name, degree: n.degree, focus: n.focus })),
      edges: net.edges.map((e) => ({
        id: e.id,
        kind: e.kind,
        from: e.from,
        to: e.to,
        directed: e.directed,
        label: e.label,
        fromRole: e.fromRole,
        toRole: e.toRole,
        category: e.category ?? 'connection',
        affinity: e.affinity,
        stage: e.stage?.id ?? null,
        range: e.range,
      })),
      total: net.total,
      hidden: net.hidden,
    };
  }
  return { timelines, shown, networks };
}

const court = () => NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, 'court.novel.json')));

class Novel {
  s = new NovelSnapshot({ project: { id: 'novel', title: 'Ties' }, collections: {} });
  clock = 1000;
  private ids = 0;

  act<T>(change: (c: RelationChanges) => T): T {
    const c = new RelationChanges(this.s, { now: ++this.clock, createId: () => `id${++this.ids}` });
    const r = change(c);
    this.s = c.snapshot;
    return r;
  }

  /** A character, as CharacterChanges.create makes its entry (its profile is the characters domain's). */
  character(name: string): string {
    return this.act((c) => c.createEntry('character', name)).id;
  }

  chapter(id: string, order: number): void {
    this.s = this.s.putRow('chapters', {
      id,
      projectId: 'novel',
      parentId: null,
      kind: 'chapter',
      title: id,
      order,
      createdAt: order,
    });
  }

  relation(id: string): CharacterRelation {
    return new CharacterRelation(this.s.rows('characterRelations').find((r) => r['id'] === id)!);
  }
}

describe('agrees with the original app', () => {
  const golden = readJson(join(flutterFixturesDir, 'golden', 'relationships.golden.json')) as Record<string, unknown>;
  for (const name of ['qa-sample', 'made-in-the-app']) {
    test(`on ${name}`, () => {
      const s = NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)));
      expect(originalReport(s)).toEqual(golden[name]);
    });
  }
  test('on a court of 40 characters and 120 relationships with histories', () => {
    expect(originalReport(court())).toEqual(golden['court']);
  });
});

describe('a relationship’s history', () => {
  test('changing how it stands never erases how it stood; a correction changes only that stage', () => {
    const w = new Novel();
    ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].forEach((c, i) => w.chapter(c, i));
    const kael = w.character('Kael');
    const mira = w.character('Mira');
    const rel = w.act((c) => c.createRelation(kael, mira)).id;
    const snapshot = () => w.relation(rel).stages.map((s) => s.raw);
    const before = snapshot();
    w.act((c) => c.recordChange(rel, { nodeId: 'c3', changes: { preset: 'rivals' } }));
    expect(jsonEquals(snapshot()[0], before[0])).toBe(true);
    const afterRivals = snapshot();
    w.act((c) => c.recordChange(rel, { unknown: true, changes: { preset: 'enemies' } }));
    w.act((c) => c.recordChange(rel, { nodeId: 'c6', changes: { preset: 'allies', affinity: 'trusting' } }));
    afterRivals.forEach((s, i) => expect(jsonEquals(snapshot()[i], s)).toBe(true));
    const model = StoryModel.fromSnapshot(w.s);
    expect(timelineOf(w.relation(rel), model.order).map((t) => t.range)).toEqual([
      'Chapters 1–2',
      'From chapter 3',
      'Stage 3, chapter not said',
      'Chapter 6+',
    ]);
    // A correction to one stage changes only it.
    const third = w.relation(rel).stages[2].id;
    const others = snapshot().filter((s) => s['id'] !== third);
    w.act((c) => c.updateStage(rel, third, { title: 'The long feud' }));
    expect(
      jsonEquals(
        snapshot().filter((s) => s['id'] !== third),
        others,
      ),
    ).toBe(true);
  });

  test('a change whose chapter is not said is never assumed begun at a chapter, and can be moved', () => {
    const w = new Novel();
    w.chapter('c1', 0);
    w.chapter('c2', 1);
    const a = w.character('A');
    const b = w.character('B');
    const rel = w.act((c) => c.createRelation(a, b)).id;
    const unknown = w.act((c) => c.addStage(rel, null, { unknown: true })).id;
    const model = StoryModel.fromSnapshot(w.s);
    const r = w.relation(rel);
    expect(stageShown(r, model, new AsOf('c2'))!.preset).toBe('friends');
    expect(stageShown(r, model, new Now())!.id).toBe(unknown); // at the end of the story it counts
    w.act((c) => c.moveStage(rel, unknown, -1));
    expect(w.relation(rel).stages[0].id).toBe(unknown);
  });

  test('what brought a change about is only what the author names, and must exist', () => {
    const w = new Novel();
    const a = w.character('A');
    const b = w.character('B');
    w.s = w.s.putRow('timelineEvents', { id: 'betrayal', projectId: 'novel', name: 'The betrayal' });
    const rel = w.act((c) => c.createRelation(a, b)).id;
    const made = w.act((c) =>
      c.recordChange(rel, { changes: { preset: 'enemies', storyEventId: { value: 'betrayal' } } }),
    );
    expect(made.storyAt).toEqual({ kind: 'event', eventId: 'betrayal' });
    expect([made.causeEventId, made.causeNodeId, made.event]).toEqual([null, null, '']); // not inferred
    expect(() => w.act((c) => c.updateStage(rel, made.id, { causeEventId: { value: 'nowhere' } }))).toThrow(
      ChangeRefused,
    );
  });
});

describe('creating, types and attributes', () => {
  test('links two characters; refuses itself, a second record for the pair either way, and non-characters', () => {
    const w = new Novel();
    const a = w.character('Orrin');
    const b = w.character('Mira');
    const keep = w.act((c) => c.createEntry('location', 'Keep')).id;
    const rel = w.act((c) => c.createRelation(a, b, 'mentor-student'));
    const only = rel.stages[0];
    expect(rel.stages).toHaveLength(1);
    expect([only.label, only.fromRole, only.directional]).toEqual(['Mentor / Student', 'Mentor', true]);
    expect(() => w.act((c) => c.createRelation(a, a))).toThrow(ChangeRefused);
    expect(() => w.act((c) => c.createRelation(b, a))).toThrow(ChangeRefused);
    expect(() => w.act((c) => c.createRelation(a, keep))).toThrow(ChangeRefused);
    w.act((c) => c.reverse(rel.id));
    expect([w.relation(rel.id).fromId, w.relation(rel.id).toId]).toEqual([b, a]);
  });

  test('types of the novel’s own: checked, used like built-ins, re-word their stages; deleted, stages keep wording', () => {
    const w = new Novel();
    const a = w.character('A');
    const b = w.character('B');
    const refused = (f: () => unknown, words: string) => {
      expect(f).toThrow(ChangeRefused);
      expect(f).toThrow(words);
    };
    refused(() => w.act((c) => c.saveType({ label: ' ' })), 'name');
    refused(() => w.act((c) => c.saveType({ label: 'friends' })), 'already a type');
    refused(() => w.act((c) => c.saveType({ label: 'Liege', directional: true, fromRole: 'Lord' })), 'both roles');
    const oath = w.act((c) =>
      c.saveType({ label: 'Sworn', category: 'hierarchy', directional: true, fromRole: 'Liege', toRole: 'Sworn' }),
    );
    const rel = w.act((c) => c.createRelation(a, b, oath.key)).id;
    expect(w.relation(rel).stages[0].label).toBe('Sworn');
    w.act((c) => c.saveType({ typeId: oath.id, label: 'Oathbound' }));
    expect(w.relation(rel).stages[0].label).toBe('Oathbound');
    w.act((c) => c.removeType(oath.id));
    const kept = w.relation(rel).stages[0];
    expect([kept.preset, kept.label, kept.fromRole]).toEqual(['custom', 'Oathbound', 'Liege']);
  });

  test('attributes: none until chosen, each way 0–10, carried into a new stage, kept when untracked', () => {
    const w = new Novel();
    const a = w.character('A');
    const b = w.character('B');
    const rel = w.act((c) => c.createRelation(a, b)).id;
    const first = w.relation(rel).stages[0].id;
    const trust = (v: { from?: number; to?: number }): StageInput => ({
      attributes: new Map([
        ['trust', { from: v.from ?? null, to: v.to ?? null, setFrom: v.from !== undefined, setTo: v.to !== undefined }],
      ]),
    });
    expect(() => w.act((c) => c.updateStage(rel, first, trust({ from: 3 })))).toThrow(ChangeRefused);
    w.act((c) => c.trackAttribute('trust'));
    expect(() => w.act((c) => c.updateStage(rel, first, trust({ from: 11 })))).toThrow(ChangeRefused);
    w.act((c) => c.updateStage(rel, first, trust({ from: 8 })));
    w.act((c) => c.updateStage(rel, first, trust({ to: 2 })));
    expect(w.relation(rel).stages[0].attribute('trust')).toEqual({ from: 8, to: 2 });
    const second = w.act((c) => c.addStage(rel, null));
    expect(second.attribute('trust')).toEqual({ from: 8, to: 2 }); // as things stood
    w.act((c) => c.untrackAttribute('trust'));
    expect(w.relation(rel).stages[0].attribute('trust')).toEqual({ from: 8, to: 2 });
  });

  test('a value with a fraction is refused as Dart refuses it out of range (Dart cannot be given one)', () => {
    const w = new Novel();
    const a = w.character('A');
    const b = w.character('B');
    const rel = w.act((c) => c.createRelation(a, b)).id;
    w.act((c) => c.trackAttribute('trust'));
    const first = w.relation(rel).stages[0].id;
    expect(() =>
      w.act((c) =>
        c.updateStage(rel, first, {
          attributes: new Map([['trust', { from: 2.5, to: null, setFrom: true, setTo: false }]]),
        }),
      ),
    ).toThrow('Trust is given as a whole number from 0 to 10.');
  });
});

test('the layout is the same every time and keeps everyone apart, on the court', () => {
  const model = StoryModel.fromSnapshot(court());
  const net = relationNetwork(model);
  const started = Date.now();
  const first = layoutNetwork(net.nodes, net.edges);
  expect(Date.now() - started).toBeLessThan(5000);
  expect(layoutNetwork(net.nodes, net.edges)).toEqual(first);
  const points = [...first.values()];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      expect(dx * dx + dy * dy).toBeGreaterThan(10 * 10); // no two characters on top of each other
    }
  }
});

describe('historical states are kept and retrievable (history_test.dart)', () => {
  const model = () =>
    StoryModel.fromSnapshot(
      new NovelBuilder()
        .node('ch1')
        .node('ch2', { order: 1 })
        .node('ch3', { order: 2 })
        .entry('mira')
        .entry('orrin')
        .relation('r', 'mira', 'orrin', [
          stage('friends', { title: 'Friends' }),
          stage('rivals', {
            startNodeId: 'ch2',
            title: 'Rivals',
            directional: true,
            fromRole: 'Rival',
            toRole: 'Friend',
          }),
        ])
        .build(),
    );

  test('a relationship is read at any chapter without losing earlier stages', () => {
    const m = model();
    const r = m.relations.get('r')!;
    expect(stageAt(r, 'ch1', m.order)!.id).toBe('friends');
    expect(stageAt(r, 'ch2', m.order)!.id).toBe('rivals');
    expect(stageAt(r, null, m.order)!.id).toBe('rivals'); // null means the end of the story
    expect(sortedStages(r, m.order).map((s) => s.id)).toEqual(['friends', 'rivals']);
  });

  test("directional roles are each side's own: A sees B as a rival while B sees A as a friend", () => {
    const stages = model().relations.get('r')!.stages;
    const last = stages[stages.length - 1];
    expect([last.fromRole, last.toRole, last.directional]).toEqual(['Rival', 'Friend', true]);
  });
});
