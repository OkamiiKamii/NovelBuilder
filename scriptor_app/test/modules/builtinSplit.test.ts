// The four split types and the built-in modules, unmocked (no flutterBuiltins): modules still name the old merged
// categories, and must find them whatever they are now called.

import { ModuleChanges } from '../../src/domain/modules/moduleChanges';
import { builtinModules } from '../../src/domain/modules/moduleDefs';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';

const mk = (snapshot: NovelSnapshot) => {
  let n = 0;
  return new ModuleChanges(snapshot, { now: 5, createId: () => `m${++n}` });
};
const attention = (snapshot: NovelSnapshot) =>
  mk(snapshot).status(builtinModules).filter((s) => s.state === 'attention').map((s) => [s.module.id, s.reasons]);

function allOn(): NovelSnapshot {
  let snapshot = new NovelSnapshot({ project: { id: 'novel', title: 'Book' }, collections: {} });
  for (const m of builtinModules) {
    const c = mk(snapshot);
    c.enable(m);
    snapshot = c.snapshot;
  }
  return snapshot;
}

describe('built-in modules after the type split', () => {
  test('every one turns on in an empty novel with nothing missing', () => {
    expect(attention(allOn())).toEqual([]);
  });

  test('they keep finding the four split types when the author has renamed them, with old-name bindings', () => {
    let snapshot = allOn();
    for (const key of ['faction', 'item', 'power', 'lore']) {
      const c = mk(snapshot);
      c.saveCategory(key, () => ({ name: `My ${key}` }));
      snapshot = c.snapshot;
    }
    expect(attention(snapshot)).toEqual([]);
  });
});

test('with any one module on, no two types share a name or a singular', () => {
  for (const m of builtinModules) {
    const c = mk(new NovelSnapshot({ project: { id: 'novel', title: 'Book' }, collections: {} }));
    c.enable(m);
    const shown = c.categories().filter((k) => !k.archived);
    const lower = (s: string) => s.trim().toLowerCase();
    const dupes = (pick: (k: (typeof shown)[number]) => string) =>
      shown.map(pick).map(lower).filter((v, i, all) => v.length > 0 && all.indexOf(v) !== i);
    expect([m.id, dupes((k) => k.name), dupes((k) => k.singular)]).toEqual([m.id, [], []]);
  }
});
