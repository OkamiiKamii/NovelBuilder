// Small, hand-made novels for tests, with readable ids. A port of flutter_app/test/shared/domain/builder.dart.

import { type JsonMap } from '../../src/domain/json';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';

export class NovelBuilder {
  readonly collections: Record<string, JsonMap[]> = {};
  private created = 0;

  constructor(readonly projectId = 'novel') {}

  private add(collection: string, row: JsonMap): this {
    (this.collections[collection] ??= []).push({ projectId: this.projectId, createdAt: ++this.created, ...row });
    return this;
  }

  node(
    id: string,
    o: { kind?: string; parent?: string | null; order?: number; title?: string; mentions?: string[] } = {},
  ): this {
    return this.add('chapters', {
      id,
      parentId: o.parent ?? null,
      kind: o.kind ?? 'chapter',
      title: o.title ?? id,
      order: o.order ?? 0,
      summary: '',
      notes: '',
      status: 'drafting',
      mentions: o.mentions ?? [],
      wordCount: 0,
      charCount: 0,
    });
  }

  entry(id: string, o: { category?: string; name?: string; fields?: JsonMap[] } = {}): this {
    return this.add('loreEntries', {
      id,
      category: o.category ?? 'character',
      name: o.name ?? id,
      fields: o.fields ?? [],
      tags: [],
    });
  }

  link(
    id: string,
    from: string,
    to: string,
    o: { type?: string; fromType?: string; toType?: string; validity?: JsonMap } = {},
  ): this {
    return this.add('loreLinks', {
      id,
      fromId: from,
      toId: to,
      fromType: o.fromType ?? 'entry',
      toType: o.toType ?? 'entry',
      fromLabel: '',
      toLabel: '',
      ...(o.type !== undefined ? { type: o.type } : {}),
      ...(o.validity !== undefined ? { validity: o.validity } : {}),
    });
  }

  event(
    id: string,
    o: {
      when?: JsonMap;
      characters?: string[];
      nodeIds?: string[];
      locationId?: string;
      afterId?: string;
      threadIds?: string[];
      duration?: JsonMap;
    } = {},
  ): this {
    return this.add('timelineEvents', {
      id,
      name: id,
      description: '',
      when: o.when ?? { precision: 'unknown' },
      duration: o.duration ?? null,
      importance: 'minor',
      locationId: o.locationId ?? null,
      characters: (o.characters ?? []).map((c) => ({ id: c, age: null })),
      entryIds: [],
      nodeIds: o.nodeIds ?? [],
      afterId: o.afterId ?? null,
      threadIds: o.threadIds ?? [],
    });
  }

  relation(id: string, from: string, to: string, stages: JsonMap[]): this {
    return this.add('characterRelations', { id, fromId: from, toId: to, stages });
  }

  thread(id: string, o: { characterIds?: string[]; beats?: JsonMap[] } = {}): this {
    return this.add('plotThreads', {
      id,
      title: id,
      status: 'active',
      category: 'main',
      characterIds: o.characterIds ?? [],
      locationIds: [],
      beats: o.beats ?? [],
      targetNodeId: null,
    });
  }

  journey(id: string, o: { travellers?: string[]; from?: string; to?: string; via?: string[] } = {}): this {
    return this.add('journeys', {
      id,
      travellerIds: o.travellers ?? [],
      fromId: o.from ?? null,
      toId: o.to ?? null,
      via: o.via ?? [],
      eventIds: [],
    });
  }

  row(collection: string, row: JsonMap): this {
    return this.add(collection, row);
  }

  build(): NovelSnapshot {
    return new NovelSnapshot({
      project: { id: this.projectId, title: 'Test novel', status: 'drafting' },
      collections: this.collections,
    });
  }
}

export const year = (y: number, o: { month?: number; season?: string } = {}): JsonMap => ({
  precision: 'approximate',
  year: y,
  month: o.month ?? null,
  season: o.season ?? null,
});

export const exact = (y: number, o: { month?: number; day?: number } = {}): JsonMap => ({
  precision: 'exact',
  year: y,
  month: o.month ?? null,
  day: o.day ?? null,
  hour: null,
  minute: null,
});

export const stage = (
  id: string,
  o: { startNodeId?: string; title?: string; directional?: boolean; fromRole?: string; toRole?: string } = {},
): JsonMap => ({
  id,
  startNodeId: o.startNodeId ?? null,
  preset: 'custom',
  category: 'custom',
  label: '',
  fromRole: o.fromRole ?? '',
  toRole: o.toRole ?? '',
  directional: o.directional ?? false,
  title: o.title ?? '',
  affinity: 'neutral',
  event: '',
  notes: '',
});
