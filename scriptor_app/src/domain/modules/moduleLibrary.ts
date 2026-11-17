// The author's own modules, built from a novel or received as files (as in the original app's module library). They
// belong to the author, not to a novel, so they are kept with the app's settings on this device (under
// `modules.library`). A novel that has one turned on keeps its own copy, so taking it out of the library changes no
// novel. A port of flutter_app/lib/shared/data/module_library.dart over the settings' read and write.

import { newId } from '../ids';
import { type JsonMap, mapOrNull, numOrNull } from '../json';
import { maps } from '../records/jsonRecord';
import { stableSorted } from '../reader/stableSort';
import { ModuleDefinition, builtinModules, parseDefinition } from './moduleDefs';

export const moduleLibraryKey = 'modules.library';

/** What the library needs of the settings: the app's SettingsStore. */
export type ModuleLibrarySettings = { read(key: string): unknown; write(key: string, value: unknown): void };

const at = (r: JsonMap): number => numOrNull(r['createdAt']) ?? 0;

export class ModuleLibrary {
  private readonly clock: () => number;
  private readonly createId: () => string;

  constructor(
    readonly settings: ModuleLibrarySettings,
    options: { clock?: () => number; createId?: () => string } = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.createId = options.createId ?? newId;
  }

  /** The author's modules, oldest first. */
  saved(): ModuleDefinition[] {
    const out: ModuleDefinition[] = [];
    for (const r of stableSorted(maps(this.settings.read(moduleLibraryKey)), (a, b) => at(a) - at(b))) {
      const d = mapOrNull(r['definition']);
      if (d !== null) out.push(new ModuleDefinition(d));
    }
    return out;
  }

  /** Every module that can be turned on: the built-in ones, then the author's. */
  available(): ModuleDefinition[] {
    return [...builtinModules, ...this.saved()];
  }

  /** Keeps a module in the library, replacing an earlier version of the same module. */
  save(definition: ModuleDefinition): ModuleDefinition {
    const clean = parseDefinition(definition.raw, { newId: this.createId });
    const rows = maps(this.settings.read(moduleLibraryKey));
    const earlier = rows.find((r) => r['id'] === clean.id);
    this.settings.write(moduleLibraryKey, [
      ...rows.filter((r) => r['id'] !== clean.id),
      { id: clean.id, definition: clean.raw, createdAt: earlier?.['createdAt'] ?? this.clock() },
    ]);
    return clean;
  }

  remove(moduleId: string): void {
    this.settings.write(
      moduleLibraryKey,
      maps(this.settings.read(moduleLibraryKey)).filter((r) => r['id'] !== moduleId),
    );
  }
}
