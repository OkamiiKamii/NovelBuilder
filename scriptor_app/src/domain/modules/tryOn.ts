// TRY IT ON: what turning a module on would change in one novel, worked out by turning it on in a copy that is never
// saved (`ModuleChanges.enable`, the same change the press makes). A port of
// flutter_app/lib/shared/domain/modules/try_on.dart. Nothing is stored by working it out.

import { str } from '../json';
import { type Category } from '../records/category';
import { type NovelSnapshot } from '../snapshot/novelSnapshot';
import { dartTrim } from '../text/dartString';
import { ModuleChanges } from './moduleChanges';
import { type ModuleDefinition } from './moduleDefs';

/** A kind of record that gains fields, the fields, and the novel's own entries of that kind that gain them. */
export type TryOnGain = { kind: Category; fields: string[]; entries: string[] };

export type ModuleTryOn = {
  /** The kinds of record the novel has now (those in use; one tucked away is left out). */
  before: Category[];
  /** The kinds it would bring that the novel does not have. */
  added: Category[];
  gains: TryOnGain[];
  /** Its tools: their kind (`registry`, `board`…) and their titles. */
  tools: { type: string; title: string }[];
  offersSystem: boolean;
  changesNothing: boolean;
};

export function tryOnModule(snapshot: NovelSnapshot, module: ModuleDefinition): ModuleTryOn {
  let n = 0;
  const id = () => `try-on-${n++}`;
  const now = new ModuleChanges(snapshot, { now: 0, createId: id });
  const before = now.categories().filter((c) => !c.archived);
  const dry = new ModuleChanges(snapshot, { now: 0, createId: id });
  dry.enable(module);
  const had = new Map(before.map((c) => [c.key, c]));
  const added: Category[] = [];
  const gains: TryOnGain[] = [];
  const entries = snapshot.rows('loreEntries');
  for (const c of dry.categories()) {
    if (c.archived) continue;
    const was = had.get(c.key);
    if (was === undefined) {
      added.push(c);
      continue;
    }
    const known = new Set(was.fields.map((f) => f.id));
    const fields = c.fields.filter((f) => !known.has(f.id) && !f.archived).map((f) => f.name);
    if (fields.length === 0) continue;
    gains.push({
      kind: c,
      fields,
      entries: entries
        .filter((e) => str(e['category']) === c.key && dartTrim(str(e['name'])).length > 0)
        .map((e) => dartTrim(str(e['name']))),
    });
  }
  const tools = module.tools.map((t) => ({ type: str(t['type']), title: str(t['title']) }));
  return {
    before,
    added,
    gains,
    tools,
    offersSystem: module.system !== null,
    changesNothing: added.length === 0 && gains.length === 0 && tools.length === 0,
  };
}
