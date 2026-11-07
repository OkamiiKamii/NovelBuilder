import type { CharacterHistory, CharacterNote, CharacterProfile, CharacterSecret, CharacterTemplate } from '@/modules/characters/types';
import type { BookMatter } from '@/modules/reader/book';
import type { Activity, Comment, Member, Suggestion } from '@/modules/collab/types';
import Dexie, { type Table } from 'dexie';
import type { CategorySchema, LoreEntry, LoreLink, Template } from '@/modules/codex/types';
import { upgradeStatus, type ChapterBranch, type ChapterContent, type ChapterDraft, type ChapterPlan, type ChapterRevision, type StoryNode } from '@/modules/manuscript/types';
import type { Goal, WritingSession } from '@/modules/progress/types';
import type { Project, ProjectStats } from '@/modules/projects/types';
import type { CharacterRelation } from '@/modules/relationships/types';
import type { SearchBlock, SearchState } from '@/modules/search/types';
import type { Brainstorm, Idea } from '@/modules/assistant/types';
import type { TimelineRecord } from '@/modules/branching/types';
import type { CanonFact } from '@/modules/canon/types';
import type { ContinuityRule, Resolution } from '@/modules/continuity/types';
import type { PlotThread } from '@/modules/plot/types';
import type { ModuleRecord, ProjectModule, SavedModule } from '@/modules/extensions/types';
import type { ProgressSnapshot } from '@/modules/progression/types';
import { upgradeShape } from '@/modules/systems/shape';
import type { SystemBlueprint, SystemSheet } from '@/modules/systems/types';
import type { BaseEntry, SyncConflict, SyncLogEntry, SyncState } from '@/modules/sync/types';
import type { StoryCalendarRow } from '@/modules/timeline/calendar';
import type { AlternateHistory } from '@/modules/timeline/histories';
import type { RelationSettings } from '@/modules/relationships/types';
import type { StructureMarker } from '@/modules/structure/types';
import type { ProgressCategory, ProgressChange } from '@/modules/progression/track';
import type { MapPin, PlaceSettings, WorldMap } from '@/modules/places/types';
import type { Journey, TravelSettings } from '@/modules/travel/types';
import type { TimelineEvent } from '@/modules/timeline/types';
import type { SavedView } from '@/modules/visualize/saved';

/**
 * Single IndexedDB database for the app.
 *
 * Rule for every later phase: a table that holds project-owned rows MUST
 * have a string `id` primary key and an indexed `projectId`, and MUST be
 * registered in the project registry (see core/projectRegistry.ts). That is
 * what makes isolation, cascade delete, duplication and backup work for it
 * without touching Phase 1 code.
 */
export class NovelDB extends Dexie {
  projects!: Table<Project, string>;
  projectStats!: Table<ProjectStats, string>;
  /** The story tree: volumes, acts, arcs, chapters and scenes. */
  chapters!: Table<StoryNode, string>;
  chapterContents!: Table<ChapterContent, string>;
  /** Crash-recovery copies of text that has not reached `chapterContents` yet. */
  chapterDrafts!: Table<ChapterDraft, string>;
  /** Version history: earlier saved states of a chapter or scene. */
  chapterRevisions!: Table<ChapterRevision, string>;
  /** Planning layer for chapters and scenes, kept apart from their text. */
  chapterPlans!: Table<ChapterPlan, string>;
  /** Alternate drafts of chapters and scenes that are not currently in the manuscript. */
  chapterBranches!: Table<ChapterBranch, string>;
  /** Codex: worldbuilding entries and the relationships between them. */
  loreEntries!: Table<LoreEntry, string>;
  loreLinks!: Table<LoreLink, string>;
  /** A project's changes to the built-in categories, and the categories it has added. */
  loreSchemas!: Table<CategorySchema, string>;
  /** Saved category-and-field templates. The one table that is not per project. */
  templates!: Table<Template, string>;
  /** Search index: derived from the tables above and rebuilt on demand. */
  searchBlocks!: Table<SearchBlock, string>;
  searchState!: Table<SearchState, string>;
  /** Progress: a log of writing sessions, and the author's goals. */
  writingSessions!: Table<WritingSession, string>;
  goals!: Table<Goal, string>;
  /** Relationships between characters, each with its history. */
  characterRelations!: Table<CharacterRelation, string>;
  /** Events in the story's own chronology. */
  timelineEvents!: Table<TimelineEvent, string>;
  plotThreads!: Table<PlotThread, string>;
  canonFacts!: Table<CanonFact, string>;
  continuityRules!: Table<ContinuityRule, string>;
  continuityResolutions!: Table<Resolution, string>;
  systems!: Table<SystemBlueprint, string>;
  systemSheets!: Table<SystemSheet, string>;
  progressSnapshots!: Table<ProgressSnapshot, string>;
  /** How projects relate as timelines of one story. Not project-owned data: it describes projects from outside. */
  timelines!: Table<TimelineRecord, string>;
  projectModules!: Table<ProjectModule, string>;
  moduleRecords!: Table<ModuleRecord, string>;
  /** Modules the author has made or imported. They belong to the author, not to one project. */
  customModules!: Table<SavedModule, string>;
  brainstorms!: Table<Brainstorm, string>;
  ideas!: Table<Idea, string>;
  // Sync bookkeeping: this device's own, never copied or backed up.
  syncState!: Table<SyncState, string>;
  syncBase!: Table<BaseEntry, string>;
  syncConflicts!: Table<SyncConflict, string>;
  characterProfiles!: Table<CharacterProfile, string>;
  characterSecrets!: Table<CharacterSecret, string>;
  characterNotes!: Table<CharacterNote, string>;
  characterHistory!: Table<CharacterHistory, string>;
  characterTemplates!: Table<CharacterTemplate, string>;
  bookMatter!: Table<BookMatter, string>;
  members!: Table<Member, string>;
  comments!: Table<Comment, string>;
  suggestions!: Table<Suggestion, string>;
  activity!: Table<Activity, string>;
  syncLog!: Table<SyncLogEntry, string>;
  /** Ways of looking at the project that the author has named: settings and record ids, never copies of records. */
  savedViews!: Table<SavedView, string>;
  /** A novel's own calendar, when it has one: one row per project. */
  storyCalendars!: Table<StoryCalendarRow, string>;
  /** Alternate histories of the timeline: each holds only its differences from the timeline it branches from. */
  alternateHistories!: Table<AlternateHistory, string>;
  /** A novel's own relationship types and the attributes it tracks: one row per project. */
  relationSettings!: Table<RelationSettings, string>;
  /** Structural markers the author places in the book: an act break, a turning point, a reveal, anything they name. */
  structureMarkers!: Table<StructureMarker, string>;
  progressCategories!: Table<ProgressCategory, string>;
  progressChanges!: Table<ProgressChange, string>;
  placeSettings!: Table<PlaceSettings, string>;
  worldMaps!: Table<WorldMap, string>;
  mapPins!: Table<MapPin, string>;
  journeys!: Table<Journey, string>;
  travelSettings!: Table<TravelSettings, string>;

  constructor(name = 'novel-builder') {
    // 'strict' makes Chromium flush each committed save to disk before reporting
    // success, so a saved chapter survives a power cut, not just a tab crash.
    super(name, { chromeTransactionDurability: 'strict' });
    this.version(1).stores({
      projects: 'id, updatedAt, status',
      projectStats: 'projectId',
    });
    // v2: single `genre` became primary + secondary genres; cover image added.
    this.version(2).upgrade((tx) =>
      tx
        .table('projects')
        .toCollection()
        .modify((project) => {
          project.primaryGenre = project.genre ?? '';
          project.secondaryGenres = [];
          project.cover = null;
          delete project.genre;
        }),
    );
    // v3 (Phase 2): manuscript.
    this.version(3).stores({
      chapters: 'id, projectId',
      chapterContents: 'id, projectId',
    });
    // v4 (Phase 3): chapters become nodes of a story tree with summary and status.
    this.version(4).upgrade((tx) =>
      tx
        .table('chapters')
        .toCollection()
        .modify((node) => {
          node.kind ??= 'chapter';
          node.parentId ??= null;
          node.summary ??= '';
          node.notes ??= '';
          node.status ??= node.wordCount > 0 ? 'drafting' : 'idea';
          node.publication ??= node.kind === 'chapter' ? 'planned' : null;
        }),
    );
    // v5 (Phase 4): crash-recovery drafts and version history.
    this.version(5).stores({
      chapterDrafts: 'id, projectId',
      chapterRevisions: 'id, projectId, nodeId',
    });
    // v6 (Phase 5): codex.
    this.version(6).stores({
      loreEntries: 'id, projectId',
      loreLinks: 'id, projectId, fromId, toId',
    });
    // v7 (Phase 6): search index.
    this.version(7).stores({
      searchBlocks: 'id, projectId, entityId',
      searchState: 'id, projectId',
    });
    // v8 (Phase 7): planning layer; one status pipeline replaces progress + publication.
    this.version(8)
      .stores({ chapterPlans: 'id, projectId' })
      .upgrade((tx) =>
        tx
          .table('chapters')
          .toCollection()
          .modify((node) => {
            node.status = upgradeStatus(node.status, node.publication);
            delete node.publication;
          }),
      );
    // v9 (Phase 8): writing sessions and goals.
    this.version(9).stores({
      writingSessions: 'id, projectId, [projectId+day]',
      goals: 'id, projectId',
    });
    // v10 (Phase 9): alternate drafts.
    this.version(10).stores({ chapterBranches: 'id, projectId, nodeId' });
    // v11 (Phase 11): character relationships.
    this.version(11).stores({ characterRelations: 'id, projectId, fromId, toId' });
    // v12 (Phase 12): story timeline.
    this.version(12).stores({ timelineEvents: 'id, projectId' });
    // v13 (Phase 14): custom categories, field sets and templates.
    this.version(13).stores({ loreSchemas: 'id, projectId', templates: 'id' });
    // v14 (Phase 16): plot threads and their developments.
    this.version(14).stores({ plotThreads: 'id, projectId' });
    // v15 (Phase 17): canon facts with their sources and history.
    this.version(15).stores({ canonFacts: 'id, projectId' });
    // v16 (Phase 18): continuity rules the author tracks, and decisions about findings.
    this.version(16).stores({ continuityRules: 'id, projectId', continuityResolutions: 'id, projectId' });
    // v17 (Phase 19): fictional system blueprints and the sheets that place codex entries on them.
    this.version(17).stores({ systems: 'id, projectId', systemSheets: 'id, projectId' });
    // v18 (Phase 20): character state snapshots along the story.
    this.version(18).stores({ progressSnapshots: 'id, projectId' });
    // v19 (Phase 21): which projects are alternate timelines of which.
    this.version(19).stores({ timelines: 'id, parentId' });
    // v20 (Phase 24): genre modules installed per project, what their tools record, and the author's own modules.
    this.version(20).stores({ projectModules: 'id, projectId', moduleRecords: 'id, projectId', customModules: 'id' });
    // v21 (Phase 25): brainstorms with the assistant, and ideas kept from them.
    this.version(21).stores({ brainstorms: 'id, projectId', ideas: 'id, projectId' });
    // v22 (Phase 27): what this device knows of the cloud, conflicts waiting for the author, and a history of syncs.
    this.version(22).stores({ syncState: 'id, projectId', syncBase: 'id, projectId', syncConflicts: 'id, projectId', syncLog: 'id, projectId' });
    // v23 (Phase 29): the team, conversations, proposed changes and the record of who did what.
    // v25: character profiles (laid over the codex's character entries), their secrets, notes, history and saved layouts.
    this.version(25).stores({ characterProfiles: 'id, projectId, entryId', characterSecrets: 'id, projectId, entryId', characterNotes: 'id, projectId, entryId', characterHistory: 'id, projectId, entryId', characterTemplates: 'id, projectId' });
    // v24 (Phase 30): the book's front and back matter, for the reader preview.
    this.version(24).stores({ bookMatter: 'id, projectId' });
    this.version(23).stores({ members: 'id, projectId', comments: 'id, projectId, threadId, [projectId+targetKey]', suggestions: 'id, projectId, [projectId+targetId]', activity: 'id, projectId' });
    // v26: a blueprint's ranks and the rows and columns of its tables get ids, and items and cells point at them by id, so renaming one keeps what is on it.
    // An upgrade that throws would keep the whole database from opening; a blueprint that cannot be read is left exactly as it was instead.
    this.version(26).upgrade((tx) =>
      tx.table('systems').toCollection().modify((row) => {
        try {
          Object.assign(row, upgradeShape(row));
        } catch {
          // Left as stored; the blueprint editor tidies it the next time it is changed.
        }
      }),
    );
    // v27: saved views of the Visualize page.
    this.version(27).stores({ savedViews: 'id, projectId' });
    // v28: a novel's own calendar. Stored dates are not touched: they are read in whichever calendar is in use.
    this.version(28).stores({ storyCalendars: 'id, projectId' });
    // v29: alternate histories of the timeline. Nothing existing changes: a history holds only its own differences.
    this.version(29).stores({ alternateHistories: 'id, projectId' });
    // v30: a novel's own relationship types and tracked attributes. Relationships themselves are unchanged; a stage may now hold attribute values.
    this.version(30).stores({ relationSettings: 'id, projectId' });
    // v31: structural markers. Nothing existing changes; labels on plans and events live in those rows.
    this.version(31).stores({ structureMarkers: 'id, projectId' });
    this.version(32).stores({ progressCategories: 'id, projectId', progressChanges: 'id, projectId, entryId' });
    this.version(33).stores({ placeSettings: 'id, projectId', worldMaps: 'id, projectId', mapPins: 'id, projectId, mapId, entryId' });
    this.version(34).stores({ journeys: 'id, projectId', travelSettings: 'id, projectId' });
  }
}
