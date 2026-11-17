// Scriptor's outputs for what dump.dart dumps of the Flutter app: Categories & fields, the views' settings, templates
// and every connection, keyed and shaped the same way, made by the ported code (src/domain/codex/screens/*,
// typePresets.ts, worldPresets.ts, templates.ts).

import { CastData } from '../../../../src/domain/characters/castData';
import { fieldsFor } from '../../../../src/domain/codex/capabilities';
import { CodexChanges, ChangeRefused } from '../../../../src/domain/codex/codexChanges';
import {
  connectableRecords,
  connectionForm,
  connectionReads,
  connectionStatusLabel,
  connectionsPanel,
  ownKind,
  saveConnection,
  statusOfCanon,
} from '../../../../src/domain/codex/screens/connections';
import { graphLinkTicked, kindUses } from '../../../../src/domain/codex/screens/kindUses';
import {
  addField,
  addPreset,
  chosenKind,
  editField,
  entryCount,
  fieldRow,
  fieldsChange,
  kindChoiceLabel,
  kindEditor,
  kindsInOrder,
  moveField,
  plainNumber,
  presetAdded,
} from '../../../../src/domain/codex/screens/kinds';
import { TemplateStore } from '../../../../src/domain/codex/templates';
import { typePresets } from '../../../../src/domain/codex/typePresets';
import { worldPresets } from '../../../../src/domain/codex/worldPresets';
import type { JsonMap } from '../../../../src/domain/json';
import { EntityRef, type EntityType } from '../../../../src/domain/model/entityRef';
import { canonStatuses } from '../../../../src/domain/records/canon';
import { connectionTypes, Link } from '../../../../src/domain/records/link';
import type { NovelSnapshot } from '../../../../src/domain/snapshot/novelSnapshot';

class Novel {
  clock = 1000;
  ids = 0;
  constructor(public snapshot: NovelSnapshot) {}

  act<T>(change: (c: CodexChanges) => T): T {
    const c = new CodexChanges(this.snapshot, { now: ++this.clock, createId: () => `id${++this.ids}` });
    const result = change(c);
    this.snapshot = c.snapshot;
    return result;
  }
}

function attempt(run: () => unknown): unknown {
  try {
    return run();
  } catch (e) {
    if (e instanceof ChangeRefused) return { refused: e.message };
    throw e;
  }
}

export function novel(s: NovelSnapshot): Record<string, unknown> {
  const cast = new CastData('novel', s);
  const model = cast.model;
  const entries = cast.entries;
  const kinds = kindsInOrder(model.categories.values());
  const read = new CodexChanges(s, {
    now: 0,
    createId: () => {
      throw new Error('reading');
    },
  });

  const edits: Record<string, unknown> = {};
  for (const k of kinds) {
    const live = k.fields.filter((f) => !f.archived);
    if (live.length === 0) continue;
    const n = new Novel(s);
    const id = live[0].id;
    edits[k.key] = [
      attempt(() => n.act(fieldsChange(k.key, (stored) => moveField(stored, id, 1))).raw),
      attempt(() => n.act(fieldsChange(k.key, (stored) => addField(stored, 'new-field'))).raw),
      attempt(
        () =>
          n.act(fieldsChange(k.key, (stored) => editField(stored, 'new-field', { name: 'Renamed', required: true, help: null })))
            .raw,
      ),
      attempt(() => n.act(fieldsChange(k.key, (stored) => editField(stored, id, { archived: true }))).raw),
      attempt(() => n.act(fieldsChange(k.key, (stored) => editField(stored, id, { archived: null }))).raw),
      [-1, 1, 5].map((by) => moveField(k.fields.map((f) => f.raw), id, by).map((f) => f['id'])),
    ];
  }

  const presets: Record<string, unknown> = {};
  for (const p of [...typePresets, ...worldPresets]) {
    const n = new Novel(s);
    presets[p.id] = attempt(() => {
      const after = n.act(addPreset(p));
      return { after: after.map((c) => c.raw), show: presetAdded(after, p).show };
    });
  }

  const refs = [
    ...entries.map((e) => new EntityRef('entry', e.id)),
    ...cast.documents.map((d) => new EntityRef('node', d.id)),
    ...[...model.events.values()].map((e) => new EntityRef('event', e.id)),
    ...[...model.threads.values()].map((t) => new EntityRef('thread', t.id)),
  ];
  const first = refs.length === 0 ? new EntityRef('entry', 'none') : refs[0];

  let connect: unknown = null;
  if (entries.length >= 2) {
    const n = new Novel(s);
    const a = new EntityRef('entry', entries[0].id);
    const b = new EntityRef('entry', entries[1].id);
    const form = { ...connectionForm(null), to: b };
    connect = [
      attempt(() => n.act(saveConnection(a, null, { ...form, kind: 'owns', label: ' holds ', notes: 'a note', canon: 'provisional' })).raw),
      attempt(() => {
        const editing = new Link(n.snapshot.rows('loreLinks').find((r) => r['id'] === 'id1')!);
        return n.act(
          saveConnection(a, editing, { ...connectionForm(editing), kind: ownKind, own: 'sworn enemy of', label: 'hates', reverse: 'fears', notes: '', canon: 'canon' }),
        ).raw;
      }),
      attempt(() => n.act(saveConnection(a, null, { ...form, kind: ownKind, own: 'sworn enemy of', label: 'hates' })).raw),
      attempt(() => n.act(saveConnection(a, null, { ...form, to: a, kind: 'related' })).raw),
    ];
  }

  const pick = <T extends object, K extends keyof T>(o: T, keys: readonly K[]) =>
    Object.fromEntries(keys.map((k) => [k, o[k]])) as Pick<T, K>;

  return {
    kinds: kinds.map((k) => ({ key: k.key, choice: kindChoiceLabel(k, entryCount(entries, k)) })),
    chosen: chosenKind(kinds, null).key,
    editors: Object.fromEntries(
      kinds.map((k) => {
        const e = kindEditor(k, entries, entryCount(entries, k));
        const live = k.fields.filter((f) => !f.archived);
        const uses = kindUses(k, model.links);
        return [
          k.key,
          {
            editor: {
              ...pick(e, ['title', 'caption', 'colours', 'graph', 'saveTemplate', 'fieldsTitle', 'archive'] as const),
              active: e.active.map((f) => f.id),
              archived: e.archived.map((a) => ({ id: a.def.id, subtitle: a.subtitle })),
            },
            rows: live.map((def, i) => {
              const { types: _types, ...row } = fieldRow(def, {
                first: i === 0,
                last: i === live.length - 1,
                kinds: [...model.categories.values()],
              });
              void _types;
              return row;
            }),
            uses: pick(uses, ['caption', 'timeline', 'map', 'rank', 'ownership', 'tree', 'graph'] as const),
            graphLinks: fieldsFor(k, 'graphLinks').flatMap((def) =>
              [true, false].map((on) => graphLinkTicked(k, def.id, on)({ ...k.uses })),
            ),
            template: CodexChanges.kindTemplate(k),
          },
        ];
      }),
    ),
    schema: read.schemaSnapshot(),
    edits,
    presets,
    panels: Object.fromEntries(
      refs.map((r) => {
        const p = connectionsPanel(cast, r);
        return [
          r.key,
          {
            title: p.title,
            empty: p.empty,
            lines: p.lines.map((l) => ({
              connection: l.connection.id,
              outgoing: l.outgoing,
              words: l.words,
              other: { ref: l.other.ref.key, name: l.other.name, opens: l.other.opens },
              status: l.status === null ? null : { status: l.status.status, label: l.status.label },
              keptIn: l.keptIn,
              link: l.link?.id ?? null,
            })),
          },
        ];
      }),
    ),
    connectable: Object.fromEntries(
      (['entry', 'node', 'event', 'thread', 'relation'] as EntityType[]).map((t) => [
        t,
        connectableRecords(cast, t, first).map((r) => ({ ref: r.ref.key, label: r.label })),
      ]),
    ),
    forms: model.links.map((l) => formJson(connectionForm(l))),
    connect,
  };
}

function formJson(f: ReturnType<typeof connectionForm>): JsonMap {
  return { kind: f.kind, own: f.own, label: f.label, reverse: f.reverse, notes: f.notes, canon: f.canon };
}

export function misc(): Record<string, unknown> {
  const settings = new Map<string, unknown>();
  let ids = 0;
  let clock = 5000;
  const t = new TemplateStore(
    { read: (k) => settings.get(k) ?? null, write: (k, v) => settings.set(k, v) },
    { createId: () => `t${++ids}`, clock: () => ++clock },
  );
  const out: Record<string, unknown> = {};
  out['saved'] = [
    t.save('  Zeta world ', ' all of it ', [{ key: 'x', name: 'X' }]).raw,
    t.save('alpha', '', []).raw,
    t.save('Émile', 'one', []).raw,
  ];
  out['refused'] = (() => {
    try {
      t.save('   ', '', []);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  })();
  out['list'] = t.list().map((x) => x.raw);
  t.remove('t2');
  out['afterRemove'] = t.list().map((x) => x.raw);
  return {
    ...out,
    typePresets: typePresets.map((p) => ({ id: p.id, name: p.name, description: p.description, categories: p.categories })),
    worldPresets: worldPresets.map((p) => ({ id: p.id, name: p.name, description: p.description, categories: p.categories })),
    reads: Object.fromEntries([...connectionTypes.map((x) => x.key), 'sworn enemy of', ''].map((k) => [k, connectionReads(k)])),
    statuses: canonStatuses.map((c) => ({ key: c, label: connectionStatusLabel(c), status: statusOfCanon(c) })),
    plain: [0, 3, -4, 2.5, 10.0, 1e21, -0.125].map(plainNumber),
    newForm: formJson(connectionForm(null)),
  };
}
