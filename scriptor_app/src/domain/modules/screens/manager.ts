// MODULE MANAGER, its pure parts: every module that can be switched on for this novel, where each stands (available,
// enabled, disabled, needing attention), what it shares with the others, and the author's own; "Made for your story"
// at its head; making a module from this novel; export and import. A port of the logic and words of
// flutter_app/lib/features/modules/modules_page.dart. Switching one on creates no records; switching one off deletes
// none.
//
// The page: the title "Module Manager" with `managerSubtitle`; Made for your story (when the novel's words call for a
// module not on: each its sign in a ring of 46, its name, "Your book mentions …", up to three features, **Turn on** and
// its try-on panel); "Genre modules" with the All / Enabled / Not enabled choice; on a phone the genre shelf
// (shelf.ts), wider the cards in 1, 2 (720+) or 3 (1100+) columns 12 apart; "Your modules" (or `managerWords.none`)
// and **Import a module…**; and, where the novel can be changed, "Make a module from this novel".

import { type JsonMap, mapOrNull, str } from '../../json';
import { type Category, Category as CategoryClass } from '../../records/category';
import { type NovelSnapshot } from '../../snapshot/novelSnapshot';
import { type ModuleFit } from '../moduleMatch';
import { ModuleChanges, type ModuleState, type ModuleStatus, moduleStateLabel } from '../moduleChanges';
import { ModuleDefinition, builtinModules } from '../moduleDefs';
import { maps } from '../../records/jsonRecord';

/** Which modules the manager shows. */
export type ShowModules = 'all' | 'on' | 'off';
export const showModules: readonly ShowModules[] = ['all', 'on', 'off'];
export const showModulesLabel: Readonly<Record<ShowModules, string>> = { all: 'All', on: 'Enabled', off: 'Not enabled' };

export const managerWords = {
  title: 'Module Manager',
  genre: 'Genre modules',
  yours: 'Your modules',
  none: 'None yet. Make one from this novel below, or import one someone has shared.',
  importButton: 'Import a module…',
  forStory: 'Made for your story',
  forStoryIntro: 'From the words in your book. A module adds the records and tools its kind of story needs.',
  turnOn: 'Turn on',
  make: 'Make a module from this novel',
  name: 'Module name',
  nameHint: 'Superhero / Urban Fantasy',
  genreLabel: 'Module is for',
  genreHint: 'Capes, masks and secret identities',
  description: 'Module description',
  categories: 'Categories and their fields',
  system: 'System rules',
  noSystem: 'No system',
  save: 'Save as a module',
  details: 'Details',
  yoursChip: 'Yours',
  open: 'Open module',
  configure: 'Configure',
  update: 'Update',
  disable: 'Disable',
  exportButton: 'Export',
  remove: 'Remove from my modules',
  keep: 'Add to my modules',
} as const;

export function managerSubtitle(on: number): string {
  return on === 0 ? 'No modules on: just the core' : `${on} ${on === 1 ? 'module' : 'modules'} on in this novel`;
}

/** Everything the manager reads of a novel: each module's standing, the author's own, those installed from elsewhere. */
export function managerView(
  snapshot: NovelSnapshot,
  library: readonly ModuleDefinition[],
): {
  installed: readonly JsonMap[];
  status: Map<string, ModuleStatus>;
  mine: ModuleDefinition[];
  /** Modules installed here whose definition is not in this device's library (the novel came from elsewhere). */
  foreign: ModuleDefinition[];
  isOn: (id: string) => boolean;
  on: number;
  onIds: Set<string>;
  subtitle: string;
  /** The categories that can go into a module made from this novel, each with the line of its fields. */
  packable: { category: Category; fields: string }[];
  systems: { id: string; name: string }[];
} {
  const read = new ModuleChanges(snapshot, {
    now: 0,
    createId: () => {
      throw new Error('reading');
    },
  });
  const installed = read.installed();
  const status = new Map(read.status(library).map((s) => [s.module.id, s]));
  const mine = library.filter((m) => !m.builtin);
  const foreign = installed
    .filter((r) => mapOrNull(r['definition'])?.['builtin'] !== true && !mine.some((m) => m.id === r['moduleId']))
    .map((r) => new ModuleDefinition(mapOrNull(r['definition'])!));
  const isOn = (id: string) => installed.some((r) => r['moduleId'] === id && r['enabled'] === true);
  const onIds = new Set(installed.filter((r) => r['enabled'] === true).map((r) => str(r['moduleId'])));
  const on = installed.filter((r) => r['enabled'] === true).length;
  return {
    installed,
    status,
    mine,
    foreign,
    isOn,
    on,
    onIds,
    subtitle: managerSubtitle(on),
    packable: read
      .categories()
      .filter((c) => !c.archived && c.fields.some((f) => !f.archived))
      .map((category) => ({
        category,
        fields: category.fields
          .filter((f) => !f.archived)
          .map((f) => f.name)
          .join(', '),
      })),
    systems: snapshot.rows('systems').map((s) => ({ id: str(s['id']), name: str(s['name'], 'Untitled system') })),
  };
}

/** Whether a module shows under the chosen filter. */
export const visibleUnder = (show: ShowModules, on: boolean): boolean => show === 'all' || (show === 'on') === on;

/** The phone shelf's or the wide grid's columns for a width. */
export const managerColumns = (width: number): number => (width >= 1100 ? 3 : width >= 720 ? 2 : 1);

/** The state chip's icon (Material Icons' names). */
export const stateIcon: Readonly<Record<ModuleState, string>> = {
  enabled: 'check_circle_outline',
  attention: 'warning_amber_outlined',
  disabled: 'pause_circle_outline',
  available: 'add_circle_outline',
};

/** One module's card: `listed` as the library has it, `at` where it stands here (null: not known here). What this
 * novel has installed is what the card describes; a module not installed is described as it comes. */
export function moduleCard(
  listed: ModuleDefinition,
  at: ModuleStatus | null,
  options: { owned: boolean; writes: boolean },
): {
  module: ModuleDefinition;
  state: ModuleState;
  stateLabel: string;
  stateIcon: string;
  isEnabled: boolean;
  yours: boolean;
  icon: string | null;
  name: string;
  genre: string | null;
  description: string;
  features: string[];
  featuresLabel: string;
  /** Before it is on: the try-on panel shows under it. */
  tryOn: boolean;
  reasons: string[];
  details: string[];
  version: string;
  usage: string | null;
  off: string | null;
  buttons: { kind: 'open' | 'configure' | 'update' | 'disable' | 'enable' | 'export' | 'remove' | 'keep'; label: string; semanticsLabel: string }[];
} {
  const module = at?.module ?? listed;
  const state = at?.state ?? 'available';
  const isEnabled = state === 'enabled' || state === 'attention';
  const adds = module.categories.map((c) =>
    c['builtin'] === true
      ? `${maps(c['fields']).length} ${maps(c['fields']).length === 1 ? 'field' : 'fields'} on ${CategoryClass.builtin(str(c['key'])).name}`
      : str(c['name']),
  );
  const details: string[] = [];
  if (adds.length > 0) details.push(`Adds to World: ${adds.join(', ')}.`);
  if (module.tools.length > 0) details.push(`Tools: ${module.tools.map((t) => str(t['title'])).join(', ')}.`);
  if (module.integrates.length > 0) details.push(`Works with: ${module.integrates.join(', ')}.`);
  if (module.system !== null) details.push(`Offers an example system, “${str(module.system['name'])}”. It is added only if you ask for it.`);
  details.push(
    at !== null && at.shares.length > 0
      ? `Shares records with: ${at.shares.map((x) => `${x.name} (${x.categories.join(', ')})`).join('; ')}. ` +
          'Switching either off leaves them in place for the other.'
      : 'Depends on no other module.',
  );
  const { owned, writes } = options;
  const buttons: ReturnType<typeof moduleCard>['buttons'] = [];
  if (isEnabled) buttons.push({ kind: 'open', label: managerWords.open, semanticsLabel: managerWords.open });
  if (isEnabled && writes) buttons.push({ kind: 'configure', label: managerWords.configure, semanticsLabel: `Configure ${module.name}` });
  if (at?.updatable === true && writes) buttons.push({ kind: 'update', label: managerWords.update, semanticsLabel: `Update ${module.name}` });
  if (writes) {
    buttons.push(
      isEnabled
        ? { kind: 'disable', label: managerWords.disable, semanticsLabel: `Disable ${module.name}` }
        : {
            kind: 'enable',
            label: state === 'disabled' ? 'Enable module again' : 'Enable module',
            semanticsLabel: `Enable ${module.name}`,
          },
    );
  }
  if (!module.builtin) buttons.push({ kind: 'export', label: managerWords.exportButton, semanticsLabel: managerWords.exportButton });
  if (owned) buttons.push({ kind: 'remove', label: managerWords.remove, semanticsLabel: `Remove ${module.name} from my modules` });
  if (!module.builtin && !owned) buttons.push({ kind: 'keep', label: managerWords.keep, semanticsLabel: managerWords.keep });
  return {
    module,
    state,
    stateLabel: moduleStateLabel[state],
    stateIcon: stateIcon[state],
    isEnabled,
    yours: !module.builtin,
    icon: module.icon.length > 0 ? module.icon : null,
    name: module.name,
    genre: module.genre.length > 0 ? module.genre : null,
    description: module.description,
    features: module.features,
    featuresLabel: `What ${module.name} does`,
    tryOn: !isEnabled,
    reasons: at?.reasons ?? [],
    details,
    version:
      `Version ${module.version}` +
      `${at !== null && at.installed !== null && at.installed !== listed.version ? ` installed · version ${listed.version} available` : ''}` +
      ` · ${module.builtin ? 'built in' : 'made by an author'} · works with this version of the app`,
    usage:
      at !== null && (at.entries > 0 || at.records > 0)
        ? `In use here: ${at.entries} ${at.entries === 1 ? 'record' : 'records'} in its categories, ${at.records} in its logs and tables.`
        : null,
    off: state === 'disabled' ? 'Switched off here. What was made with it is kept and comes back when it is enabled.' : null,
    buttons,
  };
}

/** The definition a press turns on: the author's own copy, else the library's, else the card's. */
export function definitionToEnable(
  module: ModuleDefinition,
  mine: readonly ModuleDefinition[],
  library: readonly ModuleDefinition[],
): ModuleDefinition {
  return mine.find((d) => d.id === module.id) ?? library.find((d) => d.id === module.id) ?? module;
}

/** What is said once a module is turned on or off. `at` is where it stood before the press. */
export function toggledMessage(module: ModuleDefinition, turningOn: boolean, at: ModuleStatus | null): string {
  if (turningOn) {
    return (
      `${module.name} is on. Its workspace is under Organize › Modules and its categories are in World. ` +
      'Nothing was created: its records are yours to make.'
    );
  }
  const sharing = (at?.shares ?? []).filter((x) => x.enabled);
  return (
    `${module.name} is off. Its tools are hidden; everything made with it is kept.` +
    (sharing.length === 0
      ? ''
      : ` ${sharing.map((x) => `${x.categories.join(', ')} ${x.categories.length === 1 ? 'stays' : 'stay'} in use by ${x.name}`).join('; ')}.`)
  );
}

export const updatedMessage = (module: ModuleDefinition): string => `${module.name} was updated. Only fields and tools were added.`;
export const removedMessage = (module: ModuleDefinition): string =>
  `${module.name} was removed from your modules. Novels that use it keep it.`;
export const keptMessage = (module: ModuleDefinition): string => `${module.name} was added to your modules.`;
export const savedMessage = (module: ModuleDefinition): string => `${module.name} was saved to your modules.`;
export const importedMessage = (module: ModuleDefinition): string =>
  `${module.name} was added to your modules. Switch it on to use it here.`;
export const notAModuleMessage = (fileName: string): string => `“${fileName}” is not a module. Nothing was added.`;

/** A file name made safe to save under: no path or reserved characters, spaces run together. */
export const safeName = (s: string): string =>
  s
    .trim()
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ');

/** The name a module is exported under, and the JSON written (indented two spaces, as the Flutter app writes it). */
export function exportFileName(module: ModuleDefinition): string {
  const name = safeName(module.name).length === 0 ? 'Module' : safeName(module.name);
  return `${name}.module.json`;
}

/** What is said once a module is exported (`result`: where it went, as the file saver says). */
export const exportedMessage = (result: string, module: ModuleDefinition): string =>
  `${result}: “${module.name}”. Only its categories, fields, tools and rules.`;

/** Made for your story: each module the story calls for (built-in only), with the words that say so. */
export function forYourStory(fits: readonly ModuleFit[]): { module: ModuleDefinition; words: string[]; said: string; features: string }[] {
  const out: { module: ModuleDefinition; words: string[]; said: string; features: string }[] = [];
  for (const f of fits) {
    const m = builtinModules.find((b) => b.id === f.moduleId);
    if (m === undefined) continue;
    const said = f.words.length === 1 ? f.words[0] : `${f.words.slice(0, f.words.length - 1).join(', ')} and ${f.words[f.words.length - 1]}`;
    out.push({ module: m, words: f.words, said: `Your book mentions ${said}.`, features: m.features.slice(0, 3).join(' · ') });
  }
  return out;
}

/** Made for your story, kept: what was found, for which novel, from what. The work is done once and away from the
 * screen, and again only when the chapters' stamp, the details or the modules on change. */
export function suggestionKey(args: {
  novelId: string;
  stamp: { count: number; latest: number | null };
  genres: readonly string[];
  tags: readonly string[];
  synopsis: string;
  on: ReadonlySet<string>;
}): string {
  return JSON.stringify([args.novelId, args.stamp.count, args.stamp.latest, args.genres, args.tags, args.synopsis, [...args.on].sort()]);
}

/** What is shown of the fits found: never another book's, and none already on. */
export const fitsShown = (fits: readonly ModuleFit[], fitsNovel: string | null, novelId: string, on: ReadonlySet<string>): ModuleFit[] =>
  fitsNovel !== novelId ? [] : fits.filter((f) => !on.has(f.moduleId));
