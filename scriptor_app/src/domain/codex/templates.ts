// TEMPLATES (FEATURES.md #218): a set of categories and fields the author saved to start other novels from, one kind of
// record or every category of a novel. Templates belong to the author, not to a novel, so they are kept with the app's
// settings on this device (under `codex.templates`), never in a novel's file. A template is applied with
// CodexChanges.addKinds(template.categories), which only ever adds. A port of
// flutter_app/lib/shared/data/template_store.dart, over any settings store with `read` and `write` (the app's
// SettingsStore), and of the licence labels of shared/domain/sharing/template_files.dart that the list shows.

import { localeCompare } from '../exchange/collation';
import { type JsonMap, mapOrNull, str } from '../json';
import { stableSorted } from '../reader/stableSort';
import { maps } from '../records/jsonRecord';
import { dartTrim } from '../text/dartString';

/** Where the templates are kept in the device's settings. */
export const templatesKey = 'codex.templates';

/** What the store needs of the settings: the app's SettingsStore. */
export type TemplateSettings = { read(key: string): unknown; write(key: string, value: unknown): void };

export class SavedTemplate {
  constructor(readonly raw: JsonMap) {}

  get id(): string {
    return str(this.raw['id']);
  }
  get name(): string {
    return str(this.raw['name']);
  }
  get description(): string {
    return str(this.raw['description']);
  }
  /** The categories it adds, as stored (fields, rules and view settings). */
  get categories(): JsonMap[] {
    return maps(this.raw['categories']);
  }
  /** For one received as a file: whose it is, under what terms, which version (`{id, version, author, license,
   * madeAt}`). Null for the author's own. */
  get shared(): JsonMap | null {
    return mapOrNull(this.raw['shared']);
  }
}

export class TemplateStore {
  private readonly createId: () => string;
  private readonly clock: () => number;

  constructor(
    readonly settings: TemplateSettings,
    args: { createId: () => string; clock?: () => number },
  ) {
    this.createId = args.createId;
    this.clock = args.clock ?? Date.now;
  }

  /** Every template, by name. */
  list(): SavedTemplate[] {
    return stableSorted(
      maps(this.settings.read(templatesKey))
        .filter((t) => str(t['name']).length > 0)
        .map((t) => new SavedTemplate(t)),
      (a, b) => localeCompare(a.name, b.name),
    );
  }

  /** Keeps a new template. Throws (with a message fit to show) when it has no name. */
  save(name: string, description: string, categories: readonly JsonMap[]): SavedTemplate {
    if (dartTrim(name).length === 0) throw new Error('Give the template a name.');
    const template: JsonMap = {
      id: this.createId(),
      name: dartTrim(name),
      description: dartTrim(description),
      categories: [...categories],
      createdAt: this.clock(),
    };
    this.settings.write(templatesKey, [...maps(this.settings.read(templatesKey)), template]);
    return new SavedTemplate(template);
  }

  /** Keeps a template received as a file, with whose it is, its terms and its version. Any earlier version stays. */
  saveShared(args: { name: string; description: string; categories: readonly JsonMap[]; shared: JsonMap }): SavedTemplate {
    const template: JsonMap = {
      id: this.createId(),
      name: dartTrim(args.name).length === 0 ? 'Untitled template' : dartTrim(args.name),
      description: dartTrim(args.description),
      categories: [...args.categories],
      createdAt: this.clock(),
      shared: args.shared,
    };
    this.settings.write(templatesKey, [...maps(this.settings.read(templatesKey)), template]);
    return new SavedTemplate(template);
  }

  remove(id: string): void {
    this.settings.write(
      templatesKey,
      maps(this.settings.read(templatesKey)).filter((t) => t['id'] !== id),
    );
  }
}

/** The terms a template is shared under (Dart's TemplateLicense), in the enum's order; an unknown one is Personal. */
export type TemplateLicense = 'useAndShare' | 'ccBy' | 'ccByNc' | 'cc0' | 'personal';
export const templateLicenses: readonly TemplateLicense[] = ['useAndShare', 'ccBy', 'ccByNc', 'cc0', 'personal'];
export const templateLicenseLabel: Readonly<Record<TemplateLicense, string>> = {
  useAndShare: 'Free to use, change and share',
  ccBy: 'CC BY 4.0',
  ccByNc: 'CC BY-NC 4.0',
  cc0: 'CC0 (no rights reserved)',
  personal: 'Personal use only',
};
export const templateLicenseTerms: Readonly<Record<TemplateLicense, string>> = {
  useAndShare: 'Use it, change it and pass it on. Credit is appreciated.',
  ccBy: 'Use, change and share it, also commercially, giving credit to its maker.',
  ccByNc: 'Use, change and share it with credit, but not for commercial use.',
  cc0: 'Use it in any way, with no conditions.',
  personal: 'Use it for your own writing; please do not pass it on.',
};
export function templateLicenseOf(key: unknown): TemplateLicense {
  return templateLicenses.find((l) => l === key) ?? 'personal';
}
