import type { TemplateData } from '@/modules/codex/types';
import type { BlueprintContent } from '@/modules/systems/types';

/**
 * A tool is described, not coded: a module says "a board of Suspects grouped
 * by Status" and the app's generic board draws it. Categories and fields
 * are named, not referenced by id, so a module works in any project and can
 * be written to a file and shared.
 */
export type ToolDef = { id: string; title: string; hint?: string } & (
  /** A category of the worldbuilding database as a working list: find, filter, create, and edit every field of a record in place. */
  | { type: 'registry'; category: string; groupBy?: string; summary?: string[] }
  | { type: 'board'; category: string; groupBy: string; show?: string[] }
  | { type: 'table'; category: string; fields: string[] }
  | { type: 'matrix'; rows: string; columns: string; values?: string[] }
  | { type: 'meters'; category: string; fields: string[]; max: number }
  | { type: 'log'; states?: string[]; about?: string; second?: string; checklist?: boolean; suggestions?: string[]; value?: { label: string; min: number; max: number } }
  | { type: 'calculator'; inputs: { key: string; label: string; unit: string; value: number }[]; outputs: { label: string; formula: string; unit: string }[] }
  | { type: 'ranks' }
  | { type: 'inventory' }
  /** A family tree drawn from the Character Relationship Manager's family relationships: a view, not a second set of records. */
  | { type: 'lineage' }
  | { type: 'page'; to: CorePage }
);
/** Core pages a module can send the author to, rather than rebuild. */
export const CORE_PAGES = ['systems', 'progression', 'graph', 'timeline', 'relationships', 'plot', 'canon', 'characters', 'branches', 'continuity'] as const;
export type CorePage = (typeof CORE_PAGES)[number];
export type ToolType = ToolDef['type'];

/**
 * CLEAN CORE RULE
 * A module adds to a project and never takes away. Turning it on merges its
 * categories and fields into the Codex (existing ones are left as they are)
 * and shows its tools; it creates no records: no kingdom, spell or suspect
 * exists until the author makes one. A module that has a starter system
 * only offers it. Turning a module off hides its tools and sidebar entry,
 * and tucks away the categories it introduced when they are empty and no
 * other module that is on uses them; nothing that was written is deleted,
 * and the core (manuscript, Codex, export) never depends on a module being on.
 *
 * MODULE DATA OWNERSHIP
 * A module owns only the specialised shape it adds: categories, fields and
 * tool records. Characters, locations, relationships, timeline events, plot
 * threads, canon and progression stay in the core features; a module's
 * records point at them by id and never hold a second copy.
 */
export interface ModuleDefinition {
  id: string;
  name: string;
  /** Who it is for, in a few words. */
  genre: string;
  description: string;
  /** What the sidebar calls its workspace ("Fantasy", "Progression Systems"). Absent: the module's name. */
  nav?: string;
  /** A single character shown on its card. */
  icon?: string;
  /** The main things it does, a few words each, for its card. */
  features?: string[];
  /** Core features its records connect to, by their names in the sidebar. */
  integrates?: string[];
  version: number;
  builtin: boolean;
  /** Codex categories and fields it brings (Phase 14 template data). */
  schema: TemplateData;
  /** A starter system blueprint it offers (Phase 19). Never added on its own: the author adds it from the module's workspace, once. */
  system: BlueprintContent | null;
  tools: ToolDef[];
  /** Core pages this module brings into the sidebar. */
  unlocks: ('systems' | 'progression')[];
}

/** That a module is installed in a project, and whether it is switched on. */
export interface ProjectModule {
  id: string;
  projectId: string;
  moduleId: string;
  enabled: boolean;
  /** A copy of the definition, so the project still has its tools on a device that does not have the module in its library. */
  definition: ModuleDefinition;
  /** Keys of the Codex categories this module created here (not ones that already existed). */
  createdCategories: string[];
  /**
   * Which of this project's categories and fields the module's own names
   * stand for, recorded when it is turned on. Tools look things up through
   * these, so the author can rename a category or a field and nothing breaks.
   * Categories by the module's name for them; fields by `Category/Field`.
   */
  bindings?: { categories: Record<string, string>; fields: Record<string, string> };
  /** How the author has set this module up in this project. */
  settings?: ModuleSettings;
  /** The system blueprint this module added, so it is only ever added once. */
  systemId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** The author's own arrangement of a module in one project. Everything is optional; absent means "as the module comes". */
export interface ModuleSettings {
  /** Tools taken out of the workspace. */
  hidden?: string[];
  /** The order of the tools, by id. Tools not listed follow in the module's order. */
  order?: string[];
  /** The author's name for a tool, by tool id. */
  titles?: Record<string, string>;
  /** The author's own list of states or stages for a log, by tool id. */
  states?: Record<string, string[]>;
  /** The author's name for the module's entry in the sidebar. */
  nav?: string;
}

/** Something recorded with a module's tool: a line in a log, or a cell of a matrix. Kept when the module is off. */
export interface ModuleRecord {
  id: string;
  projectId: string;
  moduleId: string;
  toolId: string;
  kind: 'log' | 'cell';
  title: string;
  state: string;
  /** The chapter or scene it happens in. */
  nodeId: string | null;
  /** A second chapter, when the tool has one (where a red herring is debunked). */
  endNodeId: string | null;
  /** Codex entries it concerns. */
  entryIds: string[];
  /** The Story Timeline event it is, when it is one. The timeline keeps the date and the order. */
  eventId?: string | null;
  value: number | null;
  note: string;
  done: boolean;
  /** For a matrix cell: the row's and column's entry. */
  rowId: string | null;
  colId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type RecordChanges = Partial<Pick<ModuleRecord, 'title' | 'state' | 'nodeId' | 'endNodeId' | 'entryIds' | 'eventId' | 'value' | 'note' | 'done'>>;

export const MODULE_STATES = ['available', 'enabled', 'disabled', 'attention'] as const;
export type ModuleState = (typeof MODULE_STATES)[number];
export const MODULE_STATE_LABELS: Record<ModuleState, string> = { available: 'Available', enabled: 'Enabled', disabled: 'Disabled', attention: 'Needs attention' };

/** Where a module stands in a project, worked out from what is stored: nothing here is kept. */
export interface ModuleStatus {
  module: ModuleDefinition;
  state: ModuleState;
  /** Why it needs attention, in words for the author. */
  reasons: string[];
  /** The version installed here, when it is installed. */
  installed: number | null;
  /** A newer version of a built-in module is available than the one installed here. */
  updatable: boolean;
  /** Records made with it: entries in the categories it brought, and lines in its logs and tables. */
  usage: { entries: number; records: number };
  /** Other modules that use some of the same categories, and so the same records. */
  shares: { moduleId: string; name: string; enabled: boolean; categories: string[] }[];
}

/** A module an author has made, kept in their library on this device. */
export interface SavedModule {
  id: string;
  definition: ModuleDefinition;
  createdAt: number;
}

export const MODULE_FORMAT = 'novel-builder-module';
