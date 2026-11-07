import { createAnalyticsService } from '@/modules/analytics/service';
import { createAssistantService, registerAssistant } from '@/modules/assistant/service';
import { createBranchingService } from '@/modules/branching/service';
import { createCanonService, registerCanon } from '@/modules/canon/service';
import { createCharacterService, registerCharacters } from '@/modules/characters/service';
import { createCodexService, createTemplateService, registerCodex } from '@/modules/codex/service';
import { installCollab } from '@/modules/collab/guard';
import { meIn } from '@/modules/collab/identity';
import { createCollabService, registerCollab } from '@/modules/collab/service';
import { createConnectionService } from '@/modules/connections/service';
import { createConsequenceService } from '@/modules/consequences/service';
import { createContinuityService, registerContinuity } from '@/modules/continuity/service';
import { createExchangeService } from '@/modules/exchange/service';
import { createExtensionService, registerExtensions } from '@/modules/extensions/service';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { createPlotService, registerPlot } from '@/modules/plot/service';
import { createProgressService, registerProgress } from '@/modules/progress/service';
import { createProgressionService, registerProgression } from '@/modules/progression/service';
import { createTrackerService, registerTracker } from '@/modules/progression/trackService';
import { createPlaceService, registerPlaces } from '@/modules/places/service';
import { createTravelService, registerTravel } from '@/modules/travel/service';
import { createProjectService } from '@/modules/projects/service';
import { createReaderService, registerReader } from '@/modules/reader/service';
import { createRelationshipService, registerRelationships } from '@/modules/relationships/service';
import { createSearchService, registerSearch } from '@/modules/search/service';
import { browserSettings } from '@/modules/sync/account';
import { createSyncService, registerSync } from '@/modules/sync/service';
import { createSystemsService, registerSystems } from '@/modules/systems/service';
import { createCalendarService } from '@/modules/timeline/calendarService';
import { createHistoryService, registerHistories } from '@/modules/timeline/historyService';
import { createStructureService, registerStructure } from '@/modules/structure/service';
import { createIntegrityService } from '@/modules/integrity/service';
import { createTimelineService, registerTimeline } from '@/modules/timeline/service';
import { createSavedViewService, registerSavedViews } from '@/modules/visualize/saved';
import { NovelDB } from './db';
import { createProjectRegistry } from './projectRegistry';

// App-wide singletons. Later phases call `registry.registerCollection(...)`
// and `registry.registerStats(...)` from their own module entry points.
export const db = new NovelDB();
export const registry = createProjectRegistry();
export const projects = createProjectService(db, registry);

// Under every write: who may make it, and a note of who did. Installed before the database is first opened.
export const collabGuard = installCollab(db, { shared: () => ['projects', 'timelines', ...registry.collections.filter((c) => !c.transient).map((c) => c.table)], who: meIn });
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => void collabGuard.flush());
// Removing a project from this device is not a change to the project: anyone may put away their own copy.
const removeProject = projects.remove;
projects.remove = (id) => collabGuard.exempt(id, () => removeProject(id));
// A copy, a new timeline or an imported file arrives whole: it is not recorded as anyone's edits.
const { duplicate, fork, importSnapshot } = projects;
projects.duplicate = (id) => collabGuard.quietly(() => duplicate(id));
projects.fork = (id, reached, overrides) => collabGuard.quietly(() => fork(id, reached, overrides));
projects.importSnapshot = (data) => collabGuard.quietly(() => importSnapshot(data));

registerProgress(registry);
export const progress = createProgressService(db);

registerManuscript(registry);
export const manuscript = createManuscriptService(db, projects.contentChanged, progress.recordWriting);

registerCodex(registry);
export const codex = createCodexService(db, projects.contentChanged);
export const templates = createTemplateService(db);

registerRelationships(registry);
export const relationships = createRelationshipService(db, projects.contentChanged);

// Typed connections live in the codex's link table, which `registerCodex` already puts in the registry.
export const connections = createConnectionService(db, projects.contentChanged);

registerSavedViews(registry);
export const savedViews = createSavedViewService(db, projects.contentChanged);

registerTimeline(registry);
export const timeline = createTimelineService(db, projects.contentChanged);
export const calendars = createCalendarService(db, projects.contentChanged);
registerHistories(registry);
export const histories = createHistoryService(db, projects.contentChanged);

registerPlot(registry);
export const plot = createPlotService(db, projects.contentChanged);

registerStructure(registry);
export const structure = createStructureService(db, projects.contentChanged);

// Record integrity reads every collection the registry knows, so it is made after all of them are registered (see the end of this file).

registerCanon(registry);
export const canon = createCanonService(db, projects.contentChanged);

registerContinuity(registry);
export const continuity = createContinuityService(db, projects.contentChanged);

registerSystems(registry);
export const systems = createSystemsService(db, projects.contentChanged);

registerProgression(registry);
export const progression = createProgressionService(db, projects.contentChanged);
registerTracker(registry);
export const tracker = createTrackerService(db, projects.contentChanged);
registerPlaces(registry);
export const places = createPlaceService(db, projects.contentChanged);
registerTravel(registry);
export const travel = createTravelService(db, projects.contentChanged);

registerExtensions(registry);
export const extensions = createExtensionService(db, codex, systems, projects.contentChanged);

registerAssistant(registry);
export const assistant = createAssistantService(db, codex, plot, projects.contentChanged);

registerSearch(registry);
export const search = createSearchService(db);

export const exchange = createExchangeService(db, manuscript);

export const branching = createBranchingService(db, projects, manuscript);

export const consequences = createConsequenceService(db);

export const analytics = createAnalyticsService(db);

registerCharacters(registry);
export const characters = createCharacterService(db, codex, projects.contentChanged);

registerReader(registry);
export const reader = createReaderService(db, projects.contentChanged);

registerCollab(registry);
export const collab = createCollabService(db, { guard: collabGuard, who: meIn, manuscript, codex, plot, progress, assistant, onChanged: projects.contentChanged });

registerSync(registry);
export const sync = createSyncService(db, registry, projects, manuscript, browserSettings, collabGuard.exempt);

/** Checks and repairs of how records point at one another; merging re-points through every registered collection. */
export const integrity = createIntegrityService(db, registry, projects.contentChanged);
