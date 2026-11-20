// System blueprints and the sheets that put codex entries on them: the SystemChanges of
// flutter_app/lib/shared/domain/systems/system_changes.dart (its `tidyBlueprint` and `instantiateBlueprint` are in
// ./blueprints.ts). Nothing in a blueprint is a fixed game concept; nothing here judges an author's numbers.
//
// The Dart makes new ids with the global `newId` here; this makes them with the change's own (`newId()`, the same
// generator in the app), so a test can hand them out in turn.

import { ChangeRefused, RecordChanges } from '../codex/codexChanges';
import { type JsonMap, mapOrNull, str } from '../json';
import { maps, strings } from '../records/jsonRecord';
import { SystemBlueprint, SystemSheet, blankSheet } from '../records/system';
import { instantiateBlueprint, tidyBlueprint } from './blueprints';
import { stageGrants, takesPoints } from './compute';
import { dartTrim } from '../text/dartString';
import { blankBlueprint } from './systemPresets';

/** The collections a change to systems reads and writes. */
export const systemCollections: readonly string[] = ['systems', 'systemSheets', 'loreEntries', 'loreLinks', 'chapters'];

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const finiteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export class SystemChanges extends RecordChanges {
  systems(): SystemBlueprint[] {
    return this.rows('systems').map((r) => new SystemBlueprint(r));
  }

  sheets(): SystemSheet[] {
    return this.rows('systemSheets').map((r) => new SystemSheet(r));
  }

  private owned(systemId: string): SystemBlueprint {
    const r = this.row('systems', systemId);
    if (r === null) throw new ChangeRefused('That system is not in this novel.');
    return new SystemBlueprint(r);
  }

  private ownedSheet(sheetId: string): SystemSheet {
    const r = this.row('systemSheets', sheetId);
    if (r === null) throw new ChangeRefused('That sheet is not in this novel.');
    return new SystemSheet(r);
  }

  /** Removes the connections that name a blueprint's items: all of them, or only `itemIds`. */
  private removeAbilityConnections(systemId: string, itemIds?: ReadonlySet<string>): void {
    const prefix = `${systemId}/`;
    const gone = (id: unknown): boolean =>
      typeof id === 'string' && id.startsWith(prefix) && (itemIds === undefined || itemIds.has(id.substring(prefix.length)));
    for (const l of [...this.rows('loreLinks')]) {
      if ((l['fromType'] === 'ability' && gone(l['fromId'])) || (l['toType'] === 'ability' && gone(l['toId']))) {
        this.remove('loreLinks', str(l['id']));
      }
    }
  }

  /** Creates a blueprint: empty, or as a fresh copy of a preset or of any other blueprint's content. */
  createSystem(content: JsonMap = blankBlueprint): SystemBlueprint {
    const saved: JsonMap = {
      id: this.newId(),
      projectId: this.projectId,
      ...instantiateBlueprint(content, () => this.newId()),
      createdAt: this.now,
      updatedAt: this.now,
    };
    this.put('systems', saved);
    return new SystemBlueprint(saved);
  }

  /** Changes a blueprint, worked out from it as stored right now, so quick edits in a row never overwrite one another.
   * An item taken out takes its connections with it. */
  updateSystem(systemId: string, change: (current: SystemBlueprint) => JsonMap): void {
    const current = this.owned(systemId);
    const next = tidyBlueprint({ ...current.raw, ...change(current) }, () => this.newId());
    const kept = new Set(maps(next['items']).map((i) => i['id']));
    const gone = new Set(current.items.filter((i) => !kept.has(i.id)).map((i) => i.id));
    if (gone.size > 0) this.removeAbilityConnections(systemId, gone);
    this.put('systems', { ...current.raw, ...next, updatedAt: this.now });
  }

  /** Sets a system aside (or brings it back). Only `off: true` is written; turning it on removes the key, so a system
   * never turned off stays as it was. Nothing else changes. */
  setSystemOff(systemId: string, off: boolean): void {
    const { off: _old, ...rest } = this.owned(systemId).raw;
    this.put('systems', off ? { ...rest, off: true, updatedAt: this.now } : { ...rest, updatedAt: this.now });
  }

  /** Deletes a blueprint and the sheets made from it. Codex entries are not changed. */
  removeSystem(systemId: string): void {
    this.owned(systemId);
    for (const s of this.sheets()) if (s.systemId === systemId) this.remove('systemSheets', s.id);
    this.removeAbilityConnections(systemId);
    this.remove('systems', systemId);
  }

  /** Puts a codex entry on a blueprint. An entry has one sheet per blueprint; asking again returns it. */
  addSheet(systemId: string, entryId: string): SystemSheet {
    this.owned(systemId);
    if (this.row('loreEntries', entryId) === null) throw new ChangeRefused('That codex entry is not in this novel.');
    const existing = this.sheets().find((s) => s.systemId === systemId && s.entryId === entryId);
    if (existing !== undefined) return existing;
    const sheet = blankSheet({ id: this.newId(), projectId: this.projectId, systemId, entryId, now: this.now });
    this.put('systemSheets', sheet);
    return new SystemSheet(sheet);
  }

  /** Changes what is particular to one entry: its own numbers, where it stands, what it holds, experience and points.
   * Assigning a class or skill stores only its id. Nothing here checks that a character "can afford" anything. */
  updateSheet(sheetId: string, change: (current: SystemSheet) => JsonMap): void {
    const current = this.ownedSheet(sheetId);
    const system = this.owned(current.systemId);
    const next: JsonMap = { ...current.raw, ...change(current) };
    const items = system.items;
    const known = new Set(items.map((i) => i.id));
    let itemIds = [...new Set(strings(next['itemIds']).filter((id) => known.has(id)))];
    // A group that allows one at a time keeps the one chosen last.
    for (const group of system.groupList.filter((g) => g.single)) {
      const inGroup = itemIds.filter((id) => items.find((i) => i.id === id)!.groupId === group.id);
      // None or one held in it: nothing to drop.
      if (inGroup.length < 2) continue;
      const drop = new Set(inGroup.slice(0, inGroup.length - 1));
      itemIds = itemIds.filter((id) => !drop.has(id));
    }
    const variableIds = new Set(system.variables.map((v) => v.id));
    const values: JsonMap = {};
    for (const [key, value] of Object.entries(mapOrNull(next['values']) ?? {})) {
      if (variableIds.has(key) && (typeof value === 'string' || finiteNumber(value))) values[key] = value;
    }
    const trackIds = new Set(system.tracks.map((t) => t.id));
    const progress: JsonMap = {};
    for (const [key, value] of Object.entries(mapOrNull(next['progress']) ?? {})) {
      if (trackIds.has(key)) progress[key] = value;
    }
    const levelled = new Set(system.tracks.filter((t) => t.kind === 'levels').map((t) => t.id));
    const xp = maps(next['xp'])
      .filter((e) => levelled.has(e['trackId'] as string) && finiteNumber(e['amount']) && e['amount'] !== 0)
      .map((e) => ({
        id: text(e['id']).length > 0 ? e['id'] : this.newId(),
        trackId: e['trackId'],
        amount: e['amount'],
        source: dartTrim(text(e['source'])),
        nodeId: typeof e['nodeId'] === 'string' && this.row('chapters', e['nodeId']) !== null ? e['nodeId'] : null,
        note: dartTrim(text(e['note'])),
      }));
    const pointed = new Set(system.variables.filter(takesPoints).map((v) => v.id));
    const spent: JsonMap = {};
    for (const [key, value] of Object.entries(mapOrNull(next['spent']) ?? {})) {
      if (pointed.has(key) && finiteNumber(value) && value !== 0) spent[key] = value;
    }
    // Only a held item can be off: one let go comes back on when it is given again. What the stages reached give is
    // held without being in itemIds, so it can stay off too, until that stage is left.
    const granted = stageGrants(system, new Map(Object.entries(progress)));
    const offIds = [...new Set(strings(next['offIds']).filter((id) => itemIds.includes(id) || granted.has(id)))];
    const saved: JsonMap = { ...current.raw, values, progress, itemIds, xp, spent, note: text(next['note']), updatedAt: this.now };
    // Written only when something is off, so a sheet that never used it stays as it was.
    if (offIds.length > 0) saved['offIds'] = offIds;
    else delete saved['offIds'];
    this.put('systemSheets', saved);
  }

  /** Switches a held item off (or on again) on a sheet: it stays held and listed, but changes nothing while off. */
  setItemOff(sheetId: string, itemId: string, off: boolean): void {
    this.updateSheet(sheetId, (cur) => {
      if (!this.owned(cur.systemId).items.some((i) => i.id === itemId)) throw new ChangeRefused('That item is not in this system.');
      return { offIds: [...cur.offIds.filter((id) => id !== itemId), ...(off ? [itemId] : [])] };
    });
  }

  /** Sets what a rank is worth (a number), or takes its power away (null). Boosts "by rank" read it. */
  setRankPower(systemId: string, rankId: string, power: number | null): void {
    if (power !== null && !finiteNumber(power)) throw new ChangeRefused('A rank’s power must be a number.');
    this.updateSystem(systemId, (cur) => {
      if (!cur.ranks.some((r) => r.id === rankId)) throw new ChangeRefused('That rank is not in this system.');
      return {
        ranks: maps(cur.raw['ranks']).map((r) => {
          if (r['id'] !== rankId) return r;
          const { power: _old, ...rest } = r;
          return power === null ? rest : { ...rest, power };
        }),
      };
    });
  }

  removeSheet(sheetId: string): void {
    this.ownedSheet(sheetId);
    this.remove('systemSheets', sheetId);
  }
}
