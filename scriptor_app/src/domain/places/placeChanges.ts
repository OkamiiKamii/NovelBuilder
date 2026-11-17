// Changes to places, maps and journeys: levels of place, what is inside what, maps and pins, journeys and the novel's
// travel methods, as in the original's place service. A port of
// flutter_app/lib/shared/domain/places/place_changes.dart.

import { ChangeRefused, RecordChanges } from '../codex/codexChanges';
import { type JsonMap, idOrNull, mapOrNull, str } from '../json';
import { StoryModel } from '../model/storyModel';
import { timeUnitOf } from '../records/event';
import { Journey } from '../records/journey';
import { strings } from '../records/jsonRecord';
import { Link } from '../records/link';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { TravelMethod, TravelSettings } from '../travel/travel';
import { parentsOf } from './explore';
import { MapPin, type PlaceLevel, PlaceSettings, WorldMap, levelPresets, mapImageLimit } from './places';

/** The collections a change to places or journeys reads and writes. */
export const placeCollections: readonly string[] = [
  'placeSettings',
  'worldMaps',
  'mapPins',
  'travelSettings',
  'journeys',
  'loreEntries',
  'loreLinks',
  'chapters',
  'chapterPlans',
  'timelineEvents',
  'loreSchemas',
  'storyCalendars',
];

const precisions = ['exact', 'approximate', 'relative', 'unknown'];

function text(v: unknown, max = 80): string {
  const s = typeof v === 'string' ? dartTrim(v) : '';
  return s.length > max ? s.substring(0, max) : s;
}

const positive = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

const imagePattern = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/;

/** Levels of place, what is inside what, maps and pins, as in the original's place service. */
export class PlaceChanges extends RecordChanges {
  settings(): PlaceSettings | null {
    const r = this.rows('placeSettings')[0];
    return r === undefined ? null : new PlaceSettings(r);
  }
  maps(): WorldMap[] {
    return this.rows('worldMaps').map((r) => new WorldMap(r));
  }
  pins(): MapPin[] {
    return this.rows('mapPins').map((r) => new MapPin(r));
  }

  private place(id: unknown, what = 'That place'): JsonMap {
    const entry = typeof id === 'string' ? this.row('loreEntries', id) : null;
    if (entry === null || entry['category'] !== 'location') throw new ChangeRefused(`${what} is not a location in this novel.`);
    return entry;
  }

  private map(id: string): WorldMap {
    const r = this.row('worldMaps', id);
    if (r === null) throw new ChangeRefused('That map is not in this novel.');
    return new WorldMap(r);
  }

  /** Levels as stored: each named once, ids kept, largest first. A level some place still has is never dropped. */
  setLevels(levels: readonly { id: string | null; name: string }[]): PlaceSettings {
    const clean: JsonMap[] = [];
    for (const level of levels) {
      const name = text(level.name, 40);
      if (name.length > 0 && !clean.some((l) => dartToLowerCase(str(l['name'])) === dartToLowerCase(name))) {
        clean.push({ id: level.id === null || level.id.length === 0 ? this.newId() : level.id, name });
      }
    }
    const current = this.settings();
    for (const level of current?.levels ?? ([] as PlaceLevel[])) {
      if (clean.some((c) => c['id'] === level.id)) continue;
      const using = this.rows('loreEntries').filter((e) => e['placeLevel'] === level.id).length;
      if (using > 0) {
        throw new ChangeRefused(
          `${using} ${using === 1 ? 'place is' : 'places are'} a ${level.name}. Give ${using === 1 ? 'it' : 'them'} ` +
            'another level first.',
        );
      }
    }
    const saved: JsonMap = {
      id: current?.id ?? this.newId(),
      projectId: this.projectId,
      levels: clean,
      createdAt: current?.raw['createdAt'] ?? this.now,
      updatedAt: this.now,
    };
    this.put('placeSettings', saved);
    return new PlaceSettings(saved);
  }

  /** Starts from a set of levels; with levels already, only adds the ones missing, after them. */
  applyPreset(presetId: string): PlaceSettings {
    const preset = levelPresets.find((p) => p.id === presetId);
    if (preset === undefined) throw new ChangeRefused('There is no such set of levels.');
    const current = this.settings()?.levels ?? [];
    return this.setLevels([
      ...current.map((l) => ({ id: l.id, name: l.name })),
      ...preset.levels
        .filter((n) => !current.some((l) => dartToLowerCase(l.name) === dartToLowerCase(n)))
        .map((n) => ({ id: null, name: n })),
    ]);
  }

  /** A place's level, or none. */
  setLevel(entryId: string, levelId: string | null): void {
    const entry = this.place(entryId);
    if (levelId !== null && !(this.settings()?.levels.some((l) => l.id === levelId) ?? false)) {
      throw new ChangeRefused('That level is not one of this novel’s.');
    }
    this.put('loreEntries', { ...entry, placeLevel: levelId, updatedAt: this.now });
  }

  /** What a place is inside: its "Located in" connection to another place, or none (at the top). A place cannot go
   * inside itself, or inside a place that is inside it. A connection that has ended stays, as history. */
  setParent(entryId: string, parentId: string | null): void {
    this.place(entryId);
    if (parentId !== null) {
      this.place(parentId, 'The place it is in');
      if (parentId === entryId) throw new ChangeRefused('A place cannot be inside itself.');
      const model = StoryModel.fromSnapshot(this.snapshot);
      const parent = parentsOf(model).parent;
      let steps = 0;
      for (let at: string | undefined = parentId; at !== undefined && steps < 10000; at = parent.get(at), steps++) {
        if (at === entryId) {
          throw new ChangeRefused(
            `${model.entries.get(parentId)!.name} is inside ${model.entries.get(entryId)!.name}, so it cannot also be ` +
              'what it is in.',
          );
        }
      }
    }
    const places = new Set(this.rows('loreEntries').filter((e) => e['category'] === 'location').map((e) => e['id']));
    for (const l of this.rows('loreLinks').map((r) => new Link(r))) {
      if (l.fromId === entryId && l.type === 'located-in' && l.isEntryLink && (l.validity?.until ?? null) === null) {
        if (places.has(l.toId)) this.remove('loreLinks', l.id);
      }
    }
    if (parentId !== null) {
      this.put('loreLinks', {
        id: this.newId(),
        projectId: this.projectId,
        fromId: entryId,
        toId: parentId,
        fromType: 'entry',
        toType: 'entry',
        type: 'located-in',
        fromLabel: '',
        toLabel: '',
        createdAt: this.now,
      });
    }
  }

  /** Creates a map (`id` null) or changes one. Its size is in its own units; a grid of 0 draws none. `placeId`
   * absent keeps the place; `{ value }` sets it (null for the whole world). */
  saveMap(
    id: string | null,
    args: {
      name?: string | null;
      placeId?: { value: string | null } | null;
      width?: number | null;
      height?: number | null;
      unit?: string | null;
      grid?: number | null;
    } = {},
  ): WorldMap {
    const current = id === null ? null : this.map(id);
    const named = text(args.name ?? current?.name, 80);
    if (named.length === 0) throw new ChangeRefused('Give the map a name.');
    const place = args.placeId !== undefined && args.placeId !== null ? args.placeId.value : (current?.placeId ?? null);
    if (place !== null) this.place(place, 'The place it is a map of');
    const g = args.grid ?? current?.grid ?? 10;
    const saved: JsonMap = {
      ...(current?.toJson() ?? {}),
      id: current?.id ?? this.newId(),
      projectId: this.projectId,
      name: named,
      placeId: place,
      width: positive(args.width) ?? current?.width ?? 100,
      height: positive(args.height) ?? current?.height ?? 100,
      unit: text(args.unit ?? current?.unit, 30),
      grid: Number.isFinite(g) && g >= 0 ? g : 0,
      image: current?.image ?? null,
      createdAt: current?.raw['createdAt'] ?? this.now,
      updatedAt: this.now,
    };
    this.put('worldMaps', saved);
    return new WorldMap(saved);
  }

  /** The map's background image, chosen from the author's own device, or none. Kept in this novel; never sent
   * anywhere. */
  setImage(id: string, image: string | null): void {
    const map = this.map(id);
    if (image !== null) {
      if (!imagePattern.test(image)) throw new ChangeRefused('That is not an image this app can show.');
      if (image.length > mapImageLimit * 1.37) {
        throw new ChangeRefused(
          `That image is too large for a map background (more than ${Math.trunc(Math.trunc(mapImageLimit / 1024) / 1024)} MB).`,
        );
      }
    }
    this.put('worldMaps', { ...map.toJson(), image, updatedAt: this.now });
  }

  /** Removes a map and its pins. The places themselves are not touched. */
  removeMap(id: string): void {
    this.map(id);
    for (const p of this.pins().filter((p) => p.mapId === id)) this.remove('mapPins', p.id);
    this.remove('worldMaps', id);
  }

  /** Puts a place on a map, or moves it there. Coordinates must be numbers; outside the map's edges is allowed. */
  pin(mapId: string, entryId: string, x: number, y: number): MapPin {
    this.map(mapId);
    this.place(entryId);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new ChangeRefused('Coordinates must be numbers.');
    const existing = this.pins().find((p) => p.mapId === mapId && p.entryId === entryId) ?? null;
    const saved: JsonMap = {
      id: existing?.id ?? this.newId(),
      projectId: this.projectId,
      mapId,
      entryId,
      x,
      y,
      createdAt: existing?.raw['createdAt'] ?? this.now,
      updatedAt: this.now,
    };
    this.put('mapPins', saved);
    return new MapPin(saved);
  }

  /** Takes a place off a map: it stays in the tree, and on other maps. */
  unpin(mapId: string, entryId: string): void {
    this.map(mapId);
    for (const p of this.pins().filter((p) => p.mapId === mapId && p.entryId === entryId)) this.remove('mapPins', p.id);
  }

  // ---------------------------------------------------------------------------------------------------- journeys

  travelSettings(): TravelSettings | null {
    const r = this.rows('travelSettings')[0];
    return r === undefined ? null : new TravelSettings(r);
  }
  journeys(): Journey[] {
    return this.rows('journeys').map((r) => new Journey(r));
  }

  private placeOrNone(id: unknown, what: string): string | null {
    if (id === null || id === undefined || id === '') return null;
    const entry = typeof id === 'string' ? this.row('loreEntries', id) : null;
    if (entry?.['category'] !== 'location') throw new ChangeRefused(`${what} is not a place in this novel.`);
    return id as string;
  }

  private mine(collection: string, id: unknown): boolean {
    return typeof id === 'string' && id.length > 0 && this.row(collection, id) !== null;
  }

  /** A point in the story: a chapter or scene or event of this novel, or a date the timeline can read; null when not
   * known. */
  private point(at: unknown, which: string): JsonMap | null {
    const a = mapOrNull(at);
    if (a === null) return null;
    if (a['kind'] === 'node' && this.mine('chapters', a['nodeId'])) return { kind: 'node', nodeId: a['nodeId'] };
    if (a['kind'] === 'event' && this.mine('timelineEvents', a['eventId'])) return { kind: 'event', eventId: a['eventId'] };
    const when = mapOrNull(a['when']);
    if (a['kind'] === 'date' && when !== null && precisions.includes(when['precision'] as string)) {
      if (when['precision'] === 'relative' && !this.mine('timelineEvents', when['anchorId'])) {
        throw new ChangeRefused(`When it ${which}: the event the date counts from is not in this novel.`);
      }
      return when['precision'] === 'unknown' ? null : { kind: 'date', when };
    }
    throw new ChangeRefused(`When it ${which}: that chapter, scene or event is not in this novel.`);
  }

  /** Records a journey (`id` null) or changes one. Only who travels is needed; everything else is as far as the
   * author says. `input` holds the fields to set, as the original's journey input. */
  saveJourney(id: string | null, input: JsonMap): Journey {
    const current = id === null ? null : this.row('journeys', id);
    if (id !== null && current === null) throw new ChangeRefused('That journey is not in this novel.');
    const next: JsonMap = { ...(current ?? {}), ...input };
    const travellerIds: string[] = [];
    for (const t of new Set(strings(next['travellerIds']))) {
      const found = this.row('loreEntries', t);
      if (found === null || found['category'] === 'location') {
        throw new ChangeRefused('Who travels must be characters, factions or other records of this novel, not places.');
      }
      travellerIds.push(t);
    }
    if (travellerIds.length === 0) throw new ChangeRefused('Say who travels.');
    const via: string[] = [];
    for (const v of strings(next['via'])) {
      const p = this.placeOrNone(v, 'A place it passes through');
      if (p !== null) via.push(p);
    }
    const all = this.journeys();
    const afterId = idOrNull(next['afterId']);
    if (afterId !== null) {
      if (!all.some((j) => j.id === afterId)) throw new ChangeRefused('The journey it comes after is not in this novel.');
      let n = 0;
      for (let at: string | null = afterId; at !== null && n < 10000; at = all.find((j) => j.id === at)?.afterId ?? null, n++) {
        if (at === id) throw new ChangeRefused('A journey cannot come after itself, or after one that comes after it.');
      }
    }
    const methods = this.travelSettings()?.methods ?? [];
    const asked = idOrNull(next['methodId']);
    const methodId = asked !== null && methods.some((m) => m.id === asked) ? asked : null;
    if (asked !== null && methodId === null) throw new ChangeRefused('That travel method is not one of this novel’s.');
    const d = mapOrNull(next['duration']);
    const amount = d?.['amount'];
    const unit = timeUnitOf(d?.['unit']);
    const duration =
      d !== null && typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 && unit !== null ? { amount, unit } : null;
    if (d !== null && duration === null) {
      throw new ChangeRefused('A duration is a number of minutes, hours, days, weeks, months or years.');
    }
    const dist = next['distance'];
    const distance = typeof dist === 'number' && Number.isFinite(dist) && dist >= 0 ? dist : null;
    if (dist !== null && dist !== undefined && distance === null) throw new ChangeRefused('A distance is a number, 0 or more.');
    const eventIds: string[] = [];
    for (const e of new Set(strings(next['eventIds']))) {
      if (!this.mine('timelineEvents', e)) throw new ChangeRefused('A related event is not in this novel.');
      eventIds.push(e);
    }
    const saved: JsonMap = {
      id: current?.['id'] ?? this.newId(),
      projectId: this.projectId,
      travellerIds,
      fromId: this.placeOrNone(next['fromId'], 'Where it starts'),
      toId: this.placeOrNone(next['toId'], 'Where it ends'),
      via,
      departure: this.point(next['departure'], 'leaves'),
      arrival: this.point(next['arrival'], 'arrives'),
      afterId,
      method: text(next['method'], 120),
      methodId,
      duration,
      distance,
      distanceUnit: text(next['distanceUnit'], 30),
      eventIds,
      note: text(next['note'], 4000),
      createdAt: current?.['createdAt'] ?? this.now,
      updatedAt: this.now,
    };
    this.put('journeys', saved);
    return new Journey(saved);
  }

  /** Removes a journey. One that came after it now comes after what it came after. */
  removeJourney(id: string): void {
    const gone = this.row('journeys', id);
    if (gone === null) throw new ChangeRefused('That journey is not in this novel.');
    for (const j of this.journeys().filter((j) => j.afterId === id)) {
      this.put('journeys', { ...j.toJson(), afterId: gone['afterId'] ?? null, updatedAt: this.now });
    }
    this.remove('journeys', id);
  }

  /** The novel's travel methods. A speed is only ever the author's; a method some journey uses cannot be removed. */
  setMethods(methods: readonly TravelMethod[]): TravelSettings {
    const clean: JsonMap[] = [];
    for (const m of methods) {
      const name = text(m.name, 60);
      if (name.length === 0 || clean.some((c) => dartToLowerCase(str(c['name'])) === dartToLowerCase(name))) continue;
      const speed = m.speed;
      clean.push({
        id: m.id.length === 0 ? this.newId() : m.id,
        name,
        speed: speed !== null && Number.isFinite(speed) && speed > 0 ? speed : null,
        distanceUnit: text(m.distanceUnit, 30),
        per: m.per,
      });
    }
    const current = this.travelSettings();
    for (const gone of (current?.methods ?? []).filter((m) => !clean.some((c) => c['id'] === m.id))) {
      const using = this.journeys().filter((j) => j.methodId === gone.id).length;
      if (using > 0) {
        throw new ChangeRefused(
          `${using} ${using === 1 ? 'journey uses' : 'journeys use'} “${gone.name}”. Change ${using === 1 ? 'it' : 'them'} ` +
            'first.',
        );
      }
    }
    const saved: JsonMap = {
      id: current?.id ?? this.newId(),
      projectId: this.projectId,
      methods: clean,
      createdAt: current?.raw['createdAt'] ?? this.now,
      updatedAt: this.now,
    };
    this.put('travelSettings', saved);
    return new TravelSettings(saved);
  }
}
