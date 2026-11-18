// The record check, ported: agreement with the original app on both real files (whole and damaged), and its fix and
// merge behaviour. A port of flutter_app/test/shared/domain/integrity_test.dart (the typed-connection tests there are
// already covered by the connections panel's tests).

import { join } from 'node:path';

import { CharacterChanges } from '../../../src/domain/characters/characterChanges';
import { ChangeRefused } from '../../../src/domain/codex/codexChanges';
import { mergeEntries, mergePlan, pointField, removeReference } from '../../../src/domain/integrity/fixes';
import {
  brokenReferences,
  duplicateCandidates,
  normalizeName,
  statusOf,
  unfitEntries,
  unresolvedFields,
  withoutReference,
} from '../../../src/domain/integrity/rules';
import { type JsonMap, jsonEquals, str } from '../../../src/domain/json';
import { deriveConnections } from '../../../src/domain/model/connections';
import { EntityRef } from '../../../src/domain/model/entityRef';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { maps, strings } from '../../../src/domain/records/jsonRecord';
import { NovelSnapshot, snapshotFormat } from '../../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../../fixtures';
import { expectJson } from '../../timeline/compare';

const golden = readJson(join(flutterFixturesDir, 'golden', 'integrity.golden.json')) as Record<string, unknown>;
const fixture = (name: string) => NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)) as JsonMap);
const fixtureNames = ['qa-sample', 'made-in-the-app'];

function damaged(s: NovelSnapshot): NovelSnapshot {
  const character = s.rows('loreEntries').find((e) => e['category'] === 'character')?.['id'];
  const chapter = s.rows('chapters').find((n) => n['kind'] === 'chapter')?.['id'];
  return s
    .withRows(
      'loreEntries',
      s.rows('loreEntries').filter((r) => r['id'] !== character),
    )
    .withRows(
      'chapters',
      s.rows('chapters').filter((r) => r['id'] !== chapter),
    );
}

export function integrityReport(s: NovelSnapshot): JsonMap {
  const model = StoryModel.fromSnapshot(s);
  const aliases = new Map(s.rows('characterProfiles').map((p) => [str(p['entryId']), strings(p['aliases'])]));
  return {
    broken: brokenReferences(model, s.rows('structureMarkers')).map((b) => ({
      key: b.key,
      where: b.where,
      table: b.table,
      rowId: b.rowId,
      missing: { type: b.missing.type, id: b.missing.id },
      says: b.says,
    })),
    unresolved: unresolvedFields(model).map((u) => ({
      key: u.key,
      entry: u.entry.id,
      fieldId: u.fieldId,
      fieldName: u.fieldName,
      value: u.value,
      suggestions: u.suggestions.map((e) => e.id),
    })),
    duplicates: duplicateCandidates([...model.entries.values()], aliases).map((d) => ({
      key: d.key,
      a: d.a.id,
      b: d.b.id,
      rule: d.rule === 'sameName' ? 'same-name' : 'alias',
      because: d.because,
    })),
    unfit: unfitEntries(model).map((u) => ({
      key: u.key,
      entry: u.entry.id,
      issues: u.issues.map((i) => ({ defId: i.defId, field: i.field, problem: i.problem, message: i.message })),
    })),
    statuses: deriveConnections(model).connections.map((c) => statusOf(c)),
  };
}

/** A small novel to change, step by step, as the app does. */
class Novel {
  s = NovelSnapshot.fromJson({ format: snapshotFormat, version: 4, project: { id: 'novel', title: 'Integrity' }, collections: {} });
  clock = 1000;
  private ids = 0;

  act<T>(change: (c: CharacterChanges) => T): T {
    const c = new CharacterChanges(this.s, { now: ++this.clock, createId: () => `id${++this.ids}` });
    const r = change(c);
    this.s = c.snapshot;
    return r;
  }

  put(collection: string, row: JsonMap): void {
    this.s = this.s.putRow(collection, { projectId: 'novel', ...row });
  }

  row(collection: string, id: string): JsonMap | null {
    return this.s.rows(collection).find((r) => r['id'] === id) ?? null;
  }
}

const linked = (entryId: string, text: string): JsonMap => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'entityLink', attrs: { entryId } }] }] }],
});

describe('agrees with the original app’s record check', () => {
  for (const name of fixtureNames) {
    test(`on ${name}`, () => expectJson(integrityReport(fixture(name)), golden[name], name));
    test(`on ${name} with records removed`, () => expectJson(integrityReport(damaged(fixture(name))), golden[`${name}-damaged`], `${name}-damaged`));
  }
  test('names compared for likeness, and references taken out', () => {
    const names = golden['names'] as JsonMap;
    expectJson(Object.fromEntries(Object.keys(names).map((n) => [n, normalizeName(n)])), names, 'names');
    expectJson(
      [
        withoutReference(
          {
            id: 'x',
            nodeIds: ['a', 'b'],
            characters: [{ id: 'b', age: 3 }, { id: 'c' }],
            locationId: 'b',
            value: 'a\nb\nc',
          },
          'b',
        ),
        withoutReference({ fields: [{ id: 'f', key: 'Leader', value: 'b' }], beats: [{ id: 'bt', nodeId: 'b', note: 'keep' }] }, 'b'),
        withoutReference(['b', { id: 'b' }, 'c'], 'b'),
      ],
      golden['without'],
      'without',
    );
  });
});

describe('fixes, only when chosen', () => {
  test('a connection with a missing end goes whole; elsewhere only the reference goes', () => {
    const w = new Novel();
    w.put('loreLinks', { id: 'l', fromId: 'gone', toId: 'x', fromLabel: '', toLabel: '' });
    w.put('timelineEvents', {
      id: 'e',
      name: 'Siege',
      characters: [
        { id: 'gone', age: null },
        { id: 'kept', age: 4 },
      ],
      nodeIds: ['n1'],
      updatedAt: 1,
    });
    w.s = removeReference(w.s, 'loreLinks', 'l', 'gone', { now: 5 });
    expect(w.row('loreLinks', 'l')).toBeNull();
    w.s = removeReference(w.s, 'timelineEvents', 'e', 'gone', { now: 5 });
    expect(w.row('timelineEvents', 'e')!['characters']).toEqual([{ id: 'kept', age: 4 }]);
    expect([w.row('timelineEvents', 'e')!['name'], w.row('timelineEvents', 'e')!['updatedAt']]).toEqual(['Siege', 5]);
    // Text is changed in the editor, never from here.
    expect(() => removeReference(w.s, 'chapters', 'n1', 'gone', { now: 5 })).toThrow(ChangeRefused);
  });

  test('a field holding words is pointed at the entry the author chooses', () => {
    const w = new Novel();
    const guild = w.act((c) => c.createEntry('faction', 'Ash Guild')).id;
    w.put('loreEntries', {
      id: 'keep',
      category: 'location',
      name: 'Keep',
      fields: [{ id: 'f', key: 'Owner', value: 'Ash Guild\nsomeone', type: 'references' }],
    });
    const found = unresolvedFields(StoryModel.fromSnapshot(w.s));
    expect(found.map((u) => [u.value, ...u.suggestions.map((e) => e.id)])).toEqual([['Ash Guild', guild], ['someone']]);
    w.s = pointField(w.s, 'keep', 'f', 'Ash Guild', guild, { now: 9 });
    expect(maps(w.row('loreEntries', 'keep')!['fields'])[0]['value']).toBe(`${guild}\nsomeone`);
  });
});

describe('merging, only when asked, keeping every reference', () => {
  function twins() {
    const w = new Novel();
    const mira = w.act((c) => c.create({ name: 'Mira' })).id;
    const orrin = w.act((c) => c.create({ name: 'Orrin' })).id;
    const keep = w.act((c) => c.createEntry('location', 'The Keep')).id;
    const twin = w.act((c) => c.create({ name: 'mira ' })).id;
    w.act((c) => c.identity(twin, { aliases: ['The Wanderer'] }));
    w.put('chapters', { id: 'two', kind: 'chapter', title: 'Two', mentions: [twin] });
    w.put('chapterContents', { id: 'two', doc: linked(twin, 'mira') });
    w.put('chapterPlans', { id: 'two', appearIds: [twin] });
    w.put('timelineEvents', {
      id: 'siege',
      name: 'Siege',
      characters: [
        { id: mira, age: null },
        { id: twin, age: null },
      ],
    });
    w.put('plotThreads', { id: 'quest', title: 'Quest', characterIds: [mira, twin] });
    w.act((c) => c.createConnection({ from: new EntityRef('entry', twin), to: new EntityRef('entry', keep), type: 'knows-about' }));
    w.put('characterRelations', { id: 'rel', fromId: mira, toId: twin, stages: [] });
    const secret = w.act((c) => c.saveSecret(orrin, null, { title: 'The vault', knows: [twin] })).id;
    return { w, mira, twin, keep, secret };
  }

  test('the plan says what would happen, before anything does', () => {
    const t = twins();
    const before = t.w.s.toJson();
    const plan = mergePlan(t.w.s, t.mira, t.twin);
    expect(plan.repointed.map((r) => r.table)).toEqual(
      expect.arrayContaining(['chapterContents', 'chapterPlans', 'chapters', 'characterRelations', 'characterSecrets', 'loreLinks', 'plotThreads', 'timelineEvents']),
    );
    expect(plan.dropped.join(' | ')).toContain('1 relationship between the two');
    expect(plan.dropped.join(' | ')).toContain('the profile layout of “mira”');
    expect(jsonEquals(t.w.s.toJson(), before)).toBe(true);
    expect(() => mergePlan(t.w.s, t.mira, t.keep)).toThrow(ChangeRefused);
  });

  test('merged: nothing points at the merged entry, nothing is left broken, nothing is doubled', () => {
    const t = twins();
    const after = mergeEntries(t.w.s, t.mira, t.twin, { now: 99 });
    t.w.s = after;
    expect(JSON.stringify(after.toJson()).includes(t.twin)).toBe(false);
    expect(brokenReferences(StoryModel.fromSnapshot(after))).toEqual([]);
    expect(JSON.stringify(t.w.row('chapterContents', 'two'))).toContain(t.mira);
    expect(JSON.stringify(t.w.row('chapterContents', 'two'))).toContain('"text":"mira"');
    expect(t.w.row('timelineEvents', 'siege')!['characters']).toEqual([{ id: t.mira, age: null }]);
    expect(t.w.row('plotThreads', 'quest')!['characterIds']).toEqual([t.mira]);
    expect(t.w.row('characterSecrets', t.secret)!['knows']).toEqual([t.mira]);
    expect(after.rows('characterRelations')).toEqual([]);
    expect(after.rows('loreLinks').map((l) => l['type'])).toEqual(['knows-about']);
    const profile = after.rows('characterProfiles').filter((p) => p['entryId'] === t.mira);
    expect(profile).toHaveLength(1);
    expect(strings(profile[0]['aliases'])).toEqual(expect.arrayContaining(['mira', 'The Wanderer']));
    expect(str(t.w.row('loreEntries', t.mira)!['notes'])).toContain('Merged “mira” into this entry.');
    expect(t.w.row('loreEntries', t.twin)).toBeNull();
  });
});
