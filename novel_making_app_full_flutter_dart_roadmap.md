# Novel-Making App --- Full Product Specification and Flutter/Dart Rebuild Roadmap

**Purpose:** This is the governing product and implementation
specification for rebuilding the novel-making app in Flutter and Dart.
Give this Markdown file to Claude Code from the project root.

**Implementation rule:** Build phase by phase. Claude Code must inspect
the current repository, plan the rebuild, and implement only one phase
at a time. Do not generate the entire app in one request.

## 1. Mission and boundaries

Build a cross-platform novel-planning and writing application that helps
authors organize manuscripts, chapters, scenes, characters, settings,
timelines, plots, fictional systems, continuity, and visual story
structures. It must support multiple genres without forcing all authors
into one genre's assumptions.

The app is a connected creative workspace, not a text editor plus
disconnected databases. Manuscripts, chapters, scenes, characters,
events, locations, factions, items, abilities, plot threads, and custom
records must connect through stable IDs and shared data services.

### Explicit exclusions

-   Do not add AI writing, AI-generated plot or character suggestions,
    AI rewriting, AI-driven continuity analysis, or model/API
    dependencies.
-   Never silently edit manuscript prose or change canon.
-   Missing information is unknown, not proof of a contradiction.
-   Do not force every story into a three-act structure, Gregorian
    calendar, fantasy setting, or RPG system.
-   Do not require an external cloud service for core functionality.
-   Do not transmit manuscripts or personal story data to external
    services without explicit approval.
-   Do not put sample/demo content in the user's real novel library.
-   Do not silently discard custom fields during import, export,
    migrations, or module disable/enable cycles.

### Core principles

1.  Author authority: the author makes story and canon decisions.
2.  Shared source of truth: each entity has one canonical record;
    visualizations reference it.
3.  Stable identity: names and display order do not determine record
    identity.
4.  Historical state: facts that change over time preserve history where
    appropriate.
5.  Fictional chronology is separate from reader presentation order.
6.  Local saving, autosave, recovery, and backups are foundational.
    Cloud sync is separate and optional.
7.  Genre neutrality: core concepts are generic; genre modules are
    optional.
8.  Data ownership and portability: users can export and back up their
    work.
9.  Visual and textual parity: every important visualization has a
    list/table/detail alternative.
10. Incremental delivery: each phase must build, test, and preserve
    working behavior before the next phase.

## 2. Instructions Claude Code must follow

Before changing code: - Inspect the repository, current Flutter/Dart
version, `pubspec.yaml`, directory structure, routes, state management,
persistence, themes, target platforms, and tests. - Identify what can be
reused and what needs replacing. Do not assume the codebase is empty. -
Produce a rebuild plan, risks, dependencies, and acceptance criteria. -
Check Git status and preserve uncommitted work. - Do not delete or
overwrite the existing app until there is a verified migration/rebuild
plan and recoverable backup.

For each phase: - Implement only that phase, then stop for review. - Use
null-safe Dart and current Flutter conventions compatible with the
repository. - Reuse sound existing routing, state-management, and
storage choices. Propose major new dependencies before adding them. -
Separate presentation widgets from domain rules and persistence. - Use
repositories/services for data access; widgets should not directly
manipulate database tables or files. - Use stable IDs for persistent
entities and connections. - Add safe, versioned, testable migrations for
data-format changes. - Include loading, empty, error, success, and
no-results states as appropriate. - Support keyboard navigation and
desktop as well as touch layouts. - Run relevant checks and report
actual results; never claim an unrun test passed. - At the end of each
phase, report changed files, behavior, data migrations, test
commands/results, known limitations, and the next phase. - If a
prerequisite is missing, implement the smallest compatible prerequisite
or stop and explain the blocker. Do not build duplicate architectures.

## 3. Suggested Flutter/Dart architecture

Choose concrete packages only after inspecting the current project and
verifying compatibility. Do not add dependencies just because they are
popular.

Suggested layer boundaries: - **Presentation:** Flutter screens,
widgets, responsive layouts, accessible interactions. - **Application:**
use cases, workflows, validation orchestration, filtering, navigation
intents. - **Domain:** entities, value objects, business rules,
connection semantics, timeline calculations, deterministic checks. -
**Data:** repositories, local persistence, serialization, migrations,
import/export, backups. - **Shared UI:** theme, forms, dialogs, panels,
visualization controls, empty/error states.

Possible structure, adapted to the existing project:

``` text
lib/
  app/
    app.dart
    router/
    theme/
    bootstrap/
  core/
    errors/
    ids/
    persistence/
    migrations/
    export/
    accessibility/
    widgets/
  features/
    projects/
    manuscript/
    chapters/
    characters/
    worldbuilding/
    relationships/
    timeline/
    plot_threads/
    knowledge_graph/
    progression/
    locations/
    canon/
    continuity/
    analytics/
    visualization_workspace/
  shared/
    domain/
    data/
    presentation/
```

This is a suggestion, not a mandate to dismantle a well-structured
repository.

Architecture requirements: - Inspect current state management, routing,
and storage before choosing replacements. - Keep persistence behind
repositories. - Use stable unique IDs; never use array indexes or names
as persistent relationship IDs. - Connections store source/target IDs
and typed metadata, not duplicated entity objects. - Reuse query/filter
logic across views. - Model date precision and fictional-calendar
semantics explicitly. Do not force approximate/unknown fictional dates
into exact Gregorian timestamps. - Preserve custom/extension fields
where possible. - Define delete behavior explicitly: prevent, cascade,
detach, or mark unresolved as appropriate. - Autosave is distinct from
remote sync. Protect multi-record operations with transactions or
recovery safeguards where supported.

## 4. Product navigation

Adapt the layout to target platforms, but provide clear access to:

1.  **Library/Projects:** create, open, archive, duplicate, import,
    export, and manage novels.
2.  **Write:** manuscript editor, chapters, scenes, writing goals,
    revisions.
3.  **Organize:** characters, relationships, locations, worldbuilding,
    factions, items, abilities, custom records.
4.  **Plan:** outline, chapter/scene board, plot threads, story
    structure, events.
5.  **Visualize:** timeline, relationship map, plot board, knowledge
    graph, location explorer/map, progression views, saved views.
6.  **Review:** canon, continuity warnings, references, structured-data
    checks.
7.  **Progress/Analytics:** writing progress and optional
    manuscript/story distribution metrics.
8.  **Settings:** appearance, editor preferences, backup, import/export,
    modules, accessibility.

Use adaptive navigation: sidebar/navigation rail on wide screens and
compact or bottom navigation on narrow screens. Do not duplicate the
same feature in multiple databases or screens.

# 5. Full phase-by-phase roadmap

## Phase 0 --- Repository audit and rebuild plan

**Goal:** understand the existing app before changing architecture.

Tasks: - Audit repository, framework, UI, data models, persistence,
routing, state management, tests, dependencies, and supported
platforms. - Identify features and behavior that must be preserved. -
Map existing implementation to this specification. - Decide whether this
is a full rebuild, incremental migration, or reuse of existing Flutter
code. - Write a phased plan, dependencies, risks, and acceptance
criteria. - Record baseline build/test/analyze results. - Establish a
backup or Git checkpoint.

Acceptance: - Present the audit before implementation. - Cite actual
file paths and architecture. - Record pre-existing failures honestly. -
Do not overwrite existing user data.

## Phase 1 --- Flutter foundation and app shell

**Goal:** establish a stable base.

Tasks: - Confirm Flutter/Dart versions and target platforms. - Set up
app bootstrap, error handling, theme, responsive layout, navigation, and
feature boundaries. - Establish linting/formatting. - Create reusable
page scaffolds, dialogs, forms, panels, empty/error/loading states, and
keyboard/focus conventions. - Add unit/widget/integration test structure
appropriate to the app. - Document dependencies.

Acceptance: - App launches on each agreed target platform. - Placeholder
navigation works. - Desktop and mobile layouts are usable. - Run
`flutter analyze` and available tests; report actual results. - No demo
data appears as real user data.

## Phase 2 --- Domain models and shared data foundation

**Goal:** establish a single source of truth.

Core records, adapted to existing models: - Project/novel - Chapter and
scene - Character - Location - Faction/organization - Item/object -
Ability/skill/power - Event - Plot thread - Custom record type and
custom record - Typed connection/relationship - Timeline/branch
metadata - Saved visualization configuration - Canon/continuity review
item

Requirements: - Stable IDs, validation, typed connections, optional
custom fields, extension data. - Explicit delete policies. - Historical
states for facts that change. - Separate fictional event time from
manuscript position. - Reusable search/filter/query services. -
Serialization and schema versioning. - Unit tests for identity,
connections, validation, and history.

Acceptance: - Records connect without duplicating entity data. -
Rename/reorder does not break links. - Historical states are retrievable
where supported. - Migrations are safe and tested.

## Phase 3 --- Local persistence, autosave, recovery, backups

**Goal:** protect author work before expanding features.

Tasks: - Implement/adapt repository interfaces and local storage. - Add
schema versioning and safe migrations. - Implement autosave, save
status, and visible error handling. - Add recovery of the last valid
saved state or draft where feasible. - Add manual backup/restore. -
Integrate import/export. - Keep cloud synchronization separate and
optional. - Test save/reload, interrupted writes where feasible,
migrations, backup/restore, and error paths.

Acceptance: - Records survive restart. - Save failures are visible; the
app never falsely reports success. - Backup restores a test project. -
Disabling a module does not delete its data. - Unknown fields are
preserved where possible.

## Phase 4 --- Project library and novel management

Tasks: - Create, open, rename, archive, duplicate, and delete projects
with clear confirmation. - Display project metadata, recent activity,
progress, and shortcuts. - Support project-level settings, templates,
modules, and saved views. - Keep project data isolated. - Add
import/export entry points and empty/recovery states.

Acceptance: - Projects are isolated. - Duplicate projects receive
appropriate new IDs and no accidental cross-project references. -
Destructive operations are clear and recoverable where feasible.

## Phase 5 --- Manuscript editor and chapter/scene organization

Tasks: - Build a practical editor linked to chapter and scene records. -
Create, rename, reorder, split, merge, and move chapters/scenes where
supported. - Support word counts, cursor/selection, editor preferences,
and shortcuts. - Add autosave feedback and recovery. - Connect
manuscript references to structured records without forcing the author
to leave writing. - Keep reading order separate from fictional
chronology. - Add writing goals and progress tracking from explicit user
settings. - Implement revision/version comparison if compatible with the
existing roadmap. - Support appropriate manuscript import/export.

Acceptance: - Editing, navigation, and saving work reliably. -
Reordering changes presentation order but not event chronology. - Prose
is never silently rewritten. - Persistence and reordering are tested.

## Phase 6 --- Character database and profiles

Tasks: - Character list, search, filters, sorting, create/edit, and
profile views. - Optional/configurable sections for identity,
appearance, personality, background, goals, motivations, fears, skills,
affiliations, relationships, secrets, possessions, timeline, abilities,
and notes. - Use templates and optional fields rather than forcing every
section on every character. - Link to actual location, faction, event,
ability, chapter, scene, and item records. - Show history and
appearances when data exists. - Distinguish user-entered values from
calculated/display-only values. - Handle archive/delete and references
explicitly.

Acceptance: - One character record is reused everywhere. - Custom fields
survive persistence and export/import. - Missing data is not presented
as known information.

## Phase 7 --- Worldbuilding and custom reference database

Tasks: - Support locations, factions, cultures, species, items,
technologies, magic/power concepts, organizations, history, and other
custom entities as appropriate. - Reusable list/detail/search/filter
experiences. - Templates, references, and parent/child hierarchies where
suitable. - Custom fields including text, number, date, checkbox,
dropdown, multi-select, references, and validation. - Genre-neutral
core; import/export and stable linking.

Acceptance: - Multiple genres can be modeled without separate
databases. - Custom types and links survive rename, persistence, and
supported exports.

## Phase 8 --- Shared relationship and cross-reference system

Tasks: - Typed connections such as owns, belongs to, created by, appears
in, occurred at, knows, caused, member of, prerequisite of, and custom
types. - Directionality without assuming reciprocity. - Optional
confirmed/provisional/disputed/invalid states. - Related-record panels
and bidirectional navigation where meaningful. - Safe handling of
deleted/missing endpoints. - Deterministic broken-link and
duplicate-candidate checks; merging requires author approval.

Acceptance: - Connections use stable IDs. - Renames do not break
links. - Broken references are visible and recoverable.

## Phase 9 --- Relationship history and social network

Tasks: - Relationship types: family, friendship, romance, rivalry,
enmity, mentorship, alliance, political ties, employment, ownership, and
custom. - Directionality, e.g. A sees B as a rival while B sees A as a
friend. - Optional dimensions such as trust, affection, fear, loyalty,
hostility, or respect. - Historical states over fictional time and
optional links to causal events/scenes supplied by the author. -
Interactive relationship map: zoom, pan, focus on character, filters,
edge details, and list/table alternative. - Filters by type, character,
time/chapter, faction, and current/historical state. - Controls to
reduce clutter.

Acceptance: - History is preserved. - Map is generated from shared
records. - Selecting a node/edge opens the correct record. - No
relationship motivation is inferred automatically.

## Phase 10 --- Unified event model and advanced timeline

Event model supports: - Stable ID, title, description, participants,
locations, chapters/scenes, plot threads, significance, status,
canon/branch. - Start/end, duration, date precision,
approximate/disputed/relative/unknown dates, and open-ended intervals
where appropriate. - Instantaneous and duration events. - User-defined
calendars/eras where feasible.

Timeline capabilities: - Chronological list and graphical timeline. -
Zoom scales: hours, days, weeks, months, years, decades, centuries,
eras, custom scales as supported. - Multiple tracks for characters,
factions, locations, and plot threads. - Parallel events, overlaps, and
duration bars. - Character age and life history when sufficient data
exists. - Location history and travel. - Event links to
chapters/scenes. - Separate fictional chronology and reader presentation
order. - Flashbacks, prologues, retrospective reveals, and nonlinear
narratives. - Alternate timelines/branches isolated from main canon. -
Filters, saved views, jump-to-date, fit-all, selected range, direct
event editing. - Deterministic warnings for possible overlap/travel
conflicts only when sufficient data exists.

**Critical:** fictional occurrence time and reader presentation order
are separate concepts. Never reorder chapters merely to make the
timeline chronological.

Acceptance: - Events are shared records across all views. - Incomplete
dates are represented honestly. - Nonlinear narratives work without
changing manuscript order. - Warnings explain their rule and never
change canon.

## Phase 11 --- Visualization Workspace

Tasks: - Dedicated navigation destination for Timeline, Relationship
Map, Plot/Chapter Board, Knowledge Graph, Location Explorer/Map,
Progression views, and saved views. - Shared headers, filters, legends,
selection/detail panels, zoom controls where appropriate, and consistent
states. - Filters by record type, chapter, date, character, location,
faction, plot thread, canon/branch status as relevant. - Saved views
persist names, filters, layers, scale, and layout. - Cross-view
selection/navigation. - Shared project data and list/table alternatives.

Acceptance: - Views use the same source records. - Saved views survive
restart. - Selecting a record opens its profile/detail. - Disabling a
view does not delete data.

## Phase 12 --- Plot board, plot threads, structure, and pacing

Tasks: - Chapter/scene board with cards, lanes, grouping, status, word
counts, manuscript navigation, and safe drag/reorder. - Plot threads
associated with scenes/events and visualized across chapters. - Thread
states: planned, active, paused, resolved, abandoned, custom. - Display
recorded introductions, developments, intersections, gaps, and
resolutions without inventing missing beats. - Optional author-defined
structural markers: inciting incident, turning point, reveal, climax,
resolution, etc.; no mandatory formula. - Chapter/scene length charts
and distribution. - User-defined scene labels such as action, dialogue,
exposition, romance, clue, or quiet moment. - Character appearance
matrix based on explicit appearance associations.

Acceptance: - Reordering updates canonical manuscript order safely. -
Plot threads refer to shared records. - Charts describe recorded data,
not literary quality. - Missing appearance records are not treated as
proof of absence.

## Phase 13 --- Interactive knowledge graph

Nodes may include characters, locations, factions, items, abilities,
species, events, chapters, scenes, plot threads, and eligible custom
records. Edges use shared typed connections.

Tasks: - Zoom, pan, select, detail panels, search, filters, legends,
focus on node, show one/two connection levels, collapse groups, toggle
node/edge types, highlight paths, restore full view. - Filter by time,
chapter, faction, canon, branch, and entity type. - Explain when a large
graph is partial/limited. - Provide list/table alternative. - Avoid
graph-only entity copies. - Use progressive expansion or other measured
techniques for large graphs.

Acceptance: - Graph reflects shared data. - Rename/delete does not
silently break it. - Partial results are labeled. - Keyboard-accessible
alternatives exist where feasible.

## Phase 14 --- Custom data types and templates

Tasks: - Custom record-type and field-template builder. - Fields such as
text, number, date, checkbox, dropdown, multi-select, references, and
other appropriate types. - Required/optional fields, validation,
reusable templates, conditional fields if justified, schema
versioning. - Explicitly map custom fields to visualization
capabilities: timeline date, graph label/edge, map coordinates,
progression rank, ownership history, etc. - Do not infer field meaning
from its name. - Explain missing mappings and offer list/detail
fallback. - Preserve custom fields through migration/import/export where
feasible.

Acceptance: - Custom records can be searched, linked, exported, and
optionally visualized. - Invalid schemas show understandable errors. -
Schema updates do not silently erase data.

## Phase 15 --- Character progression and ability trees

Tasks: - Configurable levels, ranks, titles, attributes, abilities,
equipment, transformations, classes/jobs, milestones, restrictions,
costs, and evolution. - Do not assume every character has RPG stats. -
Record changes over fictional time and link to events/chapters/scenes
where known. - Interactive progression charts and ability trees. -
Relationships: prerequisite, upgrade, evolution, fusion, replacement,
mutually exclusive, and custom. - Display ranks, requirements,
limitations, acquisition events, holders, and branches when recorded. -
Validate cycles and invalid dependencies according to explicit rules. -
Support alternate paths and historical progression.

Acceptance: - Progression data is shared across profile, timeline,
graph, and tree. - Characters without progression data remain valid. -
User-defined rules are not replaced by hardcoded assumptions.

## Phase 16 --- Locations, maps, travel, factions, and ownership

Tasks: - Location hierarchy such as universe, galaxy, planet, continent,
region, city, building, room, or custom levels. - Location explorer
usable without a map. - Optional author-provided map
backgrounds/coordinates; no required external map provider or
geocoding. - Link locations to events, characters, factions, chapters,
and scenes. - Travel routes, departure/arrival, duration, method, and
events. - Location history and possible conflicts only when sufficient
data exists. - Faction maps: membership, alliances, rivalries,
leadership, territory, influence, historical changes. - Item ownership
history: creation, discovery, transfer, theft, inheritance, loss,
destruction. - Reuse temporal/connection models.

Acceptance: - Location views work without coordinates. - Travel
conflicts are warnings, not automatic errors. - Ownership and membership
changes preserve history.

## Phase 17 --- Canon and deterministic continuity review

Tasks: - Canon/branch indicators on timeline, graph, relationship map,
and plot board. - Compatible states such as confirmed, provisional,
disputed, non-canon, alternate branch. - Deterministic checks for
explicitly defined issues: invalid dates, contradictory structured
values, missing required links, dangling references, rule-defined
impossible overlaps. - Do not infer contradiction from missing data. -
Continuity dashboard grouped by category/severity. - Every warning links
to affected records and explains the rule/data that triggered it. -
Allow resolved, intentional, ignored, or needs-review status and
optional notes. - No AI; never automatically change prose or canon.

Acceptance: - Warnings are explainable and reproducible. - Possible
inconsistency differs from confirmed error. - Review decisions persist.

## Phase 18 --- Creative analytics and writing progress

Tasks: - Words per chapter/scene, chapter-length distribution, writing
goals, character appearances, plot-thread distribution, event density
over time, POV distribution if recorded, and user-defined scene
categories. - Relevant filters. - Explain data used by each chart. - Do
not claim to measure literary quality or emotional impact. - Accessible
table/export alternative. - Clear incomplete-data states.

Acceptance: - Metrics derive from real stored data. - No fabricated
metrics. - Filters update views correctly.

## Phase 19 --- Import/export, backup, and portability

Tasks: - Audit manuscript and structured-data import/export. - Full
project backup/restore separate from visual snapshots. - Appropriate
formats such as JSON/CSV and manuscript formats supported by compatible
packages. - Preserve IDs, references, custom fields, temporal history,
canon branches, and saved views where format allows. - Detect invalid
references/schema incompatibility during import. - Preview
conflicting/destructive import actions. - No external transmission
without approval.

Acceptance: - Representative project round-trips with links intact. -
Visual exports are not described as full backups. - Import failure does
not corrupt existing data.

## Phase 20 --- Cloud sync (optional; requires separate approval)

Do not implement without explicit approval. If approved, define offline
changes, simultaneous edits, conflict resolution, credential security,
sync status, local recovery, service costs, privacy, and data location.
Never silently choose one conflicting version. Local-only mode must
remain usable and no data uploads before consent.

## Phase 21 --- Collaboration and sharing (optional; requires separate approval)

Do not implement without explicit approval. If approved, define
view/comment/edit permissions, authorship, concurrent edits,
public/private states, revocation, and export. Never make a project
public by default.

## Phase 22 --- Reader preview, serialization, and publishing

Tasks: - Reader-focused preview separate from editing. - Chapter
navigation uses manuscript presentation order. -
Serialization/publishing support according to the agreed product
scope. - Export presets and formatting controls where supported. -
Preserve the source manuscript; never silently reformat stored
original. - Preview output before export.

Acceptance: - Preview matches selected presentation settings. - Export
never changes source prose. - Output errors are actionable.

## Phase 23 --- Template sharing/community (optional; requires separate approval)

Start with local template export/import. Do not build a marketplace or
public community without approval. If approved, address moderation,
privacy, licensing/attribution, versions, malicious-file protection, and
explicit sharing. Imported templates must never execute code or expose
manuscripts.

## Phase 24 --- Quality, accessibility, performance, release readiness

Tasks: - Run formatting, analysis, unit, widget, integration, and build
checks for agreed platforms. - Test autosave, restart, recovery,
migrations, backup/restore, import/export, rename/delete, custom fields,
temporal states, branches, and module toggling. - Test realistic large
projects with hundreds/thousands of records and connections. - Profile
actual bottlenecks before optimization. - Audit keyboard navigation,
screen sizes, text scaling, contrast, focus, reduced motion, and
non-color-only indicators. - Ensure each graph has a useful textual/list
alternative. - Check for accidental network transmission, AI/model/API
dependencies, and sensitive manuscript data in logs. - Produce a matrix
of complete/partial/blocked/not implemented features. - Document
platform limitations and remaining risks.

Acceptance: - Results are reported honestly. - Unresolved data-loss or
critical navigation issues are disclosed. - Performance claims are
measured. - Build instructions are documented.

------------------------------------------------------------------------

# 6. Visualization inventory

These views should be generated from shared records, not independent
databases:

1.  Story Timeline: chronology, scales, tracks, duration, parallel
    events, uncertain dates, branch comparison.
2.  Character Relationship Map: typed/directional relationships,
    historical states, filters, focus.
3.  Plot/Chapter Board: chapter and scene cards, thread lanes, status,
    safe reordering.
4.  Story Knowledge Graph: entities and connections, filters, focus,
    paths, progressive exploration.
5.  Character History: life events, age, location, affiliations,
    relationships, progression.
6.  Parallel Storylines: concurrent character/faction plots and
    overlapping events.
7.  Plot Thread Map: recorded introductions, development, intersections,
    resolutions.
8.  Faction/Political Map: membership, leadership, alliances, rivalries,
    territory, influence.
9.  Location Explorer/World Map: place hierarchy, author-provided
    coordinates/backgrounds, events.
10. Travel Route/Location History: movement, duration, routes, presence
    over time.
11. Item Ownership History: creation, discovery, transfer, theft,
    inheritance, loss, destruction.
12. Knowledge/Secrets Map: who knows, suspects, believes, or is mistaken
    about what and when.
13. Ability/Progression Tree: ranks, prerequisites, evolution,
    transformations, alternate paths.
14. Character Appearance Matrix: characters against chapters/scenes
    using explicit associations.
15. Continuity Dashboard: explainable warnings linked to source records
    and review states.
16. Canon/Alternate Timeline Comparison: confirmed, disputed, non-canon,
    branch-specific records.
17. Story Structure View: author-defined acts, turning points, reveals,
    climax, resolution.
18. Pacing/Distribution Charts: word counts, scene labels, thread
    distribution, event density.
19. Saved Visualization Views: persistent filters, layers, scale,
    layout, selected records.
20. Custom Dashboard: optional widgets for recent records, progress,
    planned events, active plot threads, warnings.

All views require appropriate filters, selection/navigation, empty
states, and a list/table alternative. Do not display every record at
once by default.

------------------------------------------------------------------------

# 7. Module system and genre-specific modules

The app should allow multiple modules in one novel. Modules extend
shared records and views; they must not create duplicate databases.
Disabling a module hides its UI/specialized behavior but preserves its
data.

Module Manager requirements: - List modules and their
descriptions/dependencies. - Enable/disable per project where
appropriate. - Explain dependencies before disabling required
services. - Preserve data across disable/enable cycles. - Integrate with
shared search, references, timeline, graph, canon, backup, and export
where supported. - Support concurrent modules and schema
versioning/migrations. - Keep core functionality available when optional
modules are disabled.

Optional modules:

### Fantasy Worldbuilding

Magic systems, magical traditions, species, cultures, kingdoms,
artifacts, eras, and rules/limitations.

### Progression Fantasy and LitRPG

Levels, ranks, classes/jobs, stats, abilities, skill trees,
transformations, prerequisites, costs, evolution, progression history.
No single mandatory RPG ruleset.

### Science Fiction and Space Exploration

Planets, star systems, ships, technologies, species, routes, factions,
technological history, and optional time-dilation metadata. Do not
impose real physics on fictional systems unless configured.

### Mystery, Detective, and Investigation

Cases, evidence, suspects, leads, alibis, timelines, author-recorded
deductions, evidence custody/history. Do not automatically solve the
mystery or infer guilt.

### Romance and Relationship Development

Relationship arcs, milestones, conflicts, turning points, optional
author-tracked emotional states, relationship timeline.

### Horror and Suspense

Threats, clues, danger escalation, reveal timing, vulnerabilities,
author-defined tension labels. Do not claim to measure fear objectively.

### Superhero and Superpower

Powers, limitations, origins, identities, affiliations, evolution,
conflicts, consequences.

### Historical Fiction

Historical eras, real/fictional person distinction, dated events,
source/reference notes, historical divergence markers. No mandatory
external fact-checking service.

### Contemporary Fiction and Social Dynamics

Relationships, institutions, locations, occupations, social circles,
life events, contemporary chronology without fantasy assumptions.

### Political Intrigue, Factions, and Power Structures

Factions, offices, succession, influence, alliances, rivalries,
treaties, leadership history, territory, control changes.

These are optional feature bundles/configurations, not separate apps.

------------------------------------------------------------------------

# 8. Cross-feature rules

1.  One canonical record per entity.
2.  Stable IDs survive rename and reorder.
3.  Preserve historical states where relevant.
4.  Chronology and reading order remain separate.
5.  Require author approval for merges, canon changes, prose edits, or
    primary timeline changes.
6.  Every deterministic warning explains its rule.
7.  Missing data means unknown, not false or contradictory.
8.  Preserve links, custom fields, and history through supported
    exports.
9.  Disabling modules does not delete data.
10. Every visualization has an accessible alternative.
11. Keep large views usable with filters, focus, and progressive
    expansion.
12. Core writing and visualization do not depend on AI APIs or external
    cloud.
13. Do not leak manuscript content through logs or third-party
    analytics.
14. Keep test/sample content separate from real projects.
15. Do not claim tests passed unless run.

## 9. Definition of done

A feature is not complete merely because its screen renders. Where
applicable, it must have: - Domain model and validation. - Persistence
and restart verification. - Stable IDs and working cross-references. -
Loading, empty, error, and success states. - Responsive behavior and
accessibility review. - Search/filter integration. -
Import/export/backup behavior addressed. - Tests for critical
behavior. - No regressions to existing features. - No silent
manuscript/canon changes. - Documented limitations.

## 10. First instruction to Claude Code

**Start with Phase 0 only.** Read this specification and inspect the
existing repository. Determine whether the project is currently
Flutter/Dart or another stack. Do not delete, replace, or regenerate the
app immediately. Report: - Current architecture and actual file paths. -
Existing features that can be preserved. - Data/UI that need
migration. - Target platforms supported. - Major risks and unresolved
decisions. - Actual baseline build, analyze, and test results. - A
phased plan to reach this specification in Flutter/Dart.

If the current app is not Flutter/Dart, propose a safe parallel rebuild
or migration plan that protects the existing implementation and user
data. Stop and wait for approval before implementing Phase 1.
