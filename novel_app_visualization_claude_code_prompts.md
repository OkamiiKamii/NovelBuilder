# Claude Code Prompt Pack: Novel-App Visualization System

## 45 sequential implementation prompts

## How to use this pack

Run these prompts **one at a time**, in order, in Claude Code from the
root of your existing novel-making app. Do not paste the whole pack into
one request. Before starting, make sure your project is committed to Git
or otherwise backed up.

Each prompt tells Claude to inspect the existing project, preserve
working behavior, implement only the assigned step, run relevant checks,
and report exactly what changed. If a prompt discovers that a
prerequisite is missing, Claude should implement the smallest compatible
prerequisite or stop and explain the dependency rather than inventing a
second architecture.

### Global rules to follow for every prompt

-   Work inside the existing project. Do not scaffold a replacement app,
    delete existing features, or perform broad rewrites without a
    demonstrated need.
-   First inspect the repository structure, framework, routing, state
    management, persistence, styling system, tests, and current
    implementation. Follow established conventions unless there is a
    concrete technical reason not to.
-   Preserve the existing 41-feature roadmap and all currently working
    functionality. The prompts extend the app; they do not replace the
    roadmap.
-   Do not add AI writing, AI-generated ideas, AI plot generation,
    AI-driven continuity analysis, or external model/API dependencies.
    Visualization, warnings, and analysis must use user-entered data,
    explicit rules, and deterministic calculations.
-   Reuse shared records and stable IDs. Do not create duplicate
    characters, events, chapters, locations, abilities, or factions just
    because different screens need to display them.
-   Separate fictional chronology from chapter reading order. Store both
    when applicable.
-   Treat suspicious data as a warning for the author to review, not an
    automatic declaration that the story is wrong. Never silently change
    manuscript text or canon.
-   Keep data local and private according to the app's current
    architecture. Do not upload manuscripts or personal data to external
    services.
-   Make interfaces responsive, keyboard-accessible, readable, and
    usable on mobile as well as desktop.
-   Every visualization needs a non-graphical alternative such as a
    list, table, or detail panel. Do not make essential information
    accessible only through a graph.
-   Use clear loading, empty, error, and no-results states. Avoid fake
    data in production. Any demo data must be clearly identified and
    removable.
-   Use the project's existing test and lint tools. Add or update tests
    for important logic. Do not claim a check passed unless you actually
    ran it.
-   After each step, report: files changed; functionality added;
    data-model or migration changes; tests and commands run with actual
    results; known limitations; and the exact next prompt to run.
-   Do not continue to later prompts automatically. Stop after
    completing the current prompt and wait for review.

------------------------------------------------------------------------

# Phase 1 --- Inspect, plan, and protect the existing app

## Prompt 1 --- Audit the current project before changing anything

You are working on my existing novel-making app. Do not edit files yet.
Inspect the repository and report: 1. The framework, language, package
manager, app entry points, routes/screens, UI component system, styling
approach, and state-management approach. 2. How novels, chapters,
scenes, characters, locations, worldbuilding records, and other entities
are currently stored. 3. Whether stable IDs, relations, local
persistence, import/export, autosave, undo/redo, and tests already
exist. 4. Which visualization-related features already exist and their
current maturity. 5. Any architecture constraints that affect
implementing timelines, graphs, relationship maps, plot boards, maps,
and progression trees. 6. A proposed implementation plan that reuses
current systems and identifies prerequisites, risks, and likely
migration needs. Do not assume a library or capability exists just
because it is common. Cite file paths and relevant symbols from the
repository. Do not make changes until I approve the audit.

## Prompt 2 --- Create a visualization implementation plan

Using the audit, create a project-specific plan for adding a
Visualization Workspace and the visualization capabilities in this
prompt pack. Do not implement them yet. Map each planned capability to
the actual files, services, routes, components, and data models in this
repository. Identify dependencies and recommend a safe order. Separate
must-have foundations from optional enhancements. Preserve the existing
roadmap and do not introduce AI features. If you discover that a
proposed capability conflicts with current architecture, explain the
conflict and suggest the smallest compatible solution. Save the plan in
an appropriate project documentation location if that fits existing
conventions, then report its path.

## Prompt 3 --- Establish a safe baseline

Check the existing project before any visualization changes. Run the
available tests, type checks, linting, and build commands that are
appropriate for this repository. Record the real results and distinguish
pre-existing failures from passing checks. Inspect Git status and avoid
overwriting uncommitted user work. Do not fix unrelated failures in this
step. If no test infrastructure exists, recommend the smallest useful
test setup and explain before adding dependencies. Do not claim the
baseline is clean unless the actual commands confirm it.

## Prompt 4 --- Define acceptance criteria and feature boundaries

Create a concise acceptance checklist for the visualization system.
Cover shared data, chronology, relationship history, plot threads, graph
navigation, custom entity types, character progression, world maps,
saved views, filtering, accessibility, responsiveness, performance,
exports, and continuity warnings. For each capability, define observable
behavior and at least one testable success condition. Clarify what is
explicitly out of scope: AI analysis, automatic rewriting, automatic
canon changes, and unrelated redesigns. Keep this as project
documentation and do not implement features yet.

------------------------------------------------------------------------

# Phase 2 --- Shared data architecture

## Prompt 5 --- Audit and standardize stable entity identifiers

Inspect how the app identifies records. Ensure that each persistent
entity has a stable, unique ID that does not change when its name,
display label, chapter position, or sort order changes. Reuse the
existing ID strategy if it is sound. Do not use array indexes, titles,
or names as persistent relationship identifiers. Add tests for rename
and reorder stability. If migration is required, design it to preserve
existing data and explain how it will be applied safely. Implement only
this identifier improvement.

## Prompt 6 --- Define shared entity and relationship contracts

Create or refine shared data contracts for the entities that
visualizations will consume. Include the applicable existing records for
novels, chapters, scenes, characters, events, locations, factions,
items, abilities, plot threads, and custom record types. Use the
project's current language and architecture. Define typed connections
between records without duplicating the source entities. Distinguish
required fields from optional fields and support backward compatibility.
Do not create every entity model blindly: adapt to what already exists
and document any model that must be added later. Add validation and unit
tests for the contracts.

## Prompt 7 --- Build a reusable typed-connection model

Implement a shared connection model if the app does not already have
one. A connection should have a stable ID, source record ID and type,
target record ID and type, connection type, optional label, optional
notes, creation/update metadata if supported, and optional temporal or
canon metadata. Support directionality: for example, Character A may
consider Character B a rival while Character B considers A a friend.
Define how inverse views work without falsely implying that every
relationship is reciprocal. Prevent dangling references where practical
and preserve unknown/custom connection types. Add tests for valid
connections, invalid endpoints, directional meaning, and deletion
behavior. Do not duplicate complete entity records inside connections.

## Prompt 8 --- Add temporal validity and historical states

Design a reusable way to represent facts that change over fictional
time. Apply it only where useful, such as relationship states, faction
membership, item ownership, location presence, ability acquisition,
character status, and canon variants. Support known dates, approximate
dates, relative dates, unknown dates, and open-ended intervals as the
current architecture permits. Preserve history instead of overwriting a
previous state when the author records a change. Do not force exact
dates when the story does not provide them. Add tests for transitions,
overlapping intervals, missing dates, and history retrieval.

## Prompt 9 --- Create a unified event model

Implement or refine a shared event record used by the timeline and other
views. Support a stable ID, title, description, fictional start/end
time, date precision or uncertainty, participants, locations, related
chapters/scenes, plot threads, significance, status, canon/branch
information, and links to related records where relevant. Keep the
event's fictional occurrence separate from the order in which it is
revealed to the reader. Support instantaneous and duration events. Reuse
existing structures and migrate carefully. Add validation and tests. Do
not add fictional content automatically.

## Prompt 10 --- Create a visualization query and filtering layer

Implement reusable, deterministic query helpers for retrieving records
and connections by entity type, ID, chapter, time range, character,
location, faction, plot thread, canon status, and other supported
filters. Keep query logic out of presentation components where feasible.
Make filters composable and predictable. Handle missing dates and
unknown metadata explicitly instead of silently excluding records
without explanation. Add tests for combined filters, empty results,
large result sets, and records with incomplete data.

## Prompt 11 --- Integrate shared data with existing persistence and backups

Connect the new or refined records to the app's existing persistence,
autosave, import/export, and backup mechanisms. Autosave must not be
confused with cloud synchronization. Preserve data when a visualization
is disabled or unavailable. Make imports resilient to unknown custom
fields where possible, and avoid silently discarding data. If migrations
are needed, provide versioning and safe failure behavior. Test
save/reload, export/import round trips, and preservation of unknown
fields. Do not add a cloud service or upload user data.

------------------------------------------------------------------------

# Phase 3 --- Visualization framework and workspace

## Prompt 12 --- Build reusable visualization UI foundations

Create a small set of reusable visualization components appropriate to
the project's existing UI architecture. Consider a view header, filter
bar, zoom controls where relevant, legend, detail panel, empty state,
loading/error state, selection state, and responsive container. Keep the
design consistent with the existing app. Do not install a large
visualization library until you have verified it is needed and
compatible. Prefer a well-supported existing dependency if one is
already present. Add accessibility labels, keyboard focus behavior, and
tests for shared interaction logic.

## Prompt 13 --- Add the Visualization Workspace navigation

Add a dedicated Visualization Workspace to the existing app navigation.
It should provide access to Timeline, Relationship Map, Plot Board,
Knowledge Graph, World Map/Location Explorer, Character Progression, and
later specialized views. Respect the current project/novel context so
visualizations always show the correct novel's data. Use clear empty
states when a novel has no relevant records. Do not duplicate the
records in a separate workspace database. Preserve the existing
navigation and mobile layout.

## Prompt 14 --- Implement saved visualization views

Allow users to save a view's configuration, including its visualization
type, filters, visible layers, zoom or scale where meaningful, selected
time range, layout preferences, and view name. Saved views should refer
to stable record IDs and query settings, not snapshots of duplicated
records. Support rename, duplicate, delete, and restore-default actions
where appropriate. Handle deleted records gracefully. Persist views
through the existing storage architecture, and test save/reload, rename,
and missing-record behavior.

## Prompt 15 --- Implement cross-view selection and navigation

Create a consistent interaction contract so selecting an entity in one
visualization can open its record, highlight it in another relevant
view, or show its details in a shared panel. For example, selecting a
timeline event should reveal its participants, chapters, location, and
plot thread; selecting a character in the graph should open that
character's profile. Preserve the current novel context and support
browser/app back navigation where the project allows it. Do not force
users into a graph to access ordinary record details. Add integration
tests for navigation and stale/deleted references.

------------------------------------------------------------------------

# Phase 4 --- Timeline and chronology

## Prompt 16 --- Build the first usable timeline view

Implement the core timeline using the shared event model. Provide a
chronological list and a graphical timeline, with event cards or
markers, event detail selection, and basic filters. Make the initial
version useful even when events have approximate dates or no exact date.
Clearly distinguish undated events rather than inventing positions.
Include empty, loading, and error states. Ensure that creating or
editing an event updates the same shared record used by other screens.
Add tests for sorting, selection, and incomplete dates.

## Prompt 17 --- Add zoom levels and time scales

Expand the timeline with appropriate scales such as hours, days, weeks,
months, years, decades, centuries, and custom eras, according to the
data model. Do not assume every story uses a Gregorian calendar. If the
app supports fictional calendars, make the time axis adaptable rather
than hardcoding a single calendar. Add zoom in/out, pan/scroll, fit-all,
jump-to-date, and selected-range controls. Keep event placement
consistent when the scale changes. Test date boundaries,
negative/ancient/future years if supported, and very long timelines.

## Prompt 18 --- Add multiple timeline tracks

Allow users to organize timelines into tracks for characters, factions,
locations, plot threads, or custom groupings. Users should be able to
show/hide tracks, reorder them, collapse them, and focus on one track.
Events shared by multiple tracks should still be one event record with
multiple associations, not copies. Make track labels and event selection
accessible. Test filtering and ensure a track's display order does not
change the underlying event chronology.

## Prompt 19 --- Support parallel, overlapping, and duration events

Make the timeline display events that occur simultaneously in different
places, events that overlap, and events that span a period, such as
journeys, investigations, training, wars, or political negotiations.
Represent start/end uncertainty where available. Avoid treating overlaps
as errors by default. Provide a clear visual distinction between an
instantaneous event, an ongoing event, and an event with uncertain
boundaries. Add tests for same-time events, overlapping intervals,
missing end dates, and open-ended durations.

## Prompt 20 --- Separate fictional chronology from reading order

Add clear controls and data relationships for the distinction between
when an event happened in the story and when the reader encounters it.
Connect events to one or more chapters/scenes without assuming the
chapter's order is the event's chronological order. Support flashbacks,
prologues, non-linear narratives, foreshadowing, and events revealed
retrospectively. Add a view that compares chronological order with
manuscript presentation order. Do not automatically reorder chapters or
manuscript content. Test a deliberately nonlinear example.

## Prompt 21 --- Add character age and life-history views

Where a character has a birth date, age reference, or known age at a
specified event, show calculated age at relevant events. Respect
fictional calendars and uncertain dates. If the data is insufficient,
display "unknown" or an approximate range rather than inventing an age.
Provide a character history view that combines events, appearances,
location history, affiliations, relationship changes, and ability
changes when records exist. Ensure these are references to the shared
records. Add tests for known, approximate, and missing birth/age data.

## Prompt 22 --- Add timeline branches and alternate histories

Represent alternate timelines, hypothetical scenarios, changed futures,
and time-travel branches without mixing them into the main canon
timeline. Let the author identify a base timeline and create a branch
with its own event differences. Reuse unchanged records where the
architecture permits; do not copy an entire novel's database for a small
branch. Show branch origin, affected events, and branch status. Make
canon status explicit and allow safe comparison between branches. Do not
merge branches or change canon automatically. Add tests for branch
isolation and comparison.

## Prompt 23 --- Add a timeline event editor and review warnings

Allow supported edits from the timeline, including event title, date,
duration, participants, location, and related chapters. Validate edits
and save through the shared record service. Provide deterministic review
warnings for potential issues such as impossible travel intervals,
contradictory event dates, or a character appearing in distant locations
at the same time, but only when the required data exists. Explain the
rule behind every warning and let the author dismiss, resolve, or mark
it intentional. Never rewrite the story or change canon automatically.

------------------------------------------------------------------------

# Phase 5 --- Character relationships and social networks

## Prompt 24 --- Build the relationship manager around shared connections

Implement the character relationship manager using the shared
typed-connection model. Support configurable relationship types such as
family, friendship, romance, rivalry, hostility, mentorship, alliance,
political relationship, employment, and custom types. Support
directional relationships and optional attributes such as trust,
affection, fear, loyalty, hostility, or respect only when the user
chooses to track them. Each relationship should link to the actual
character records. Add create/edit/delete flows, validation, and tests.

## Prompt 25 --- Add relationship history and chapter-aware changes

Allow relationship states to change over fictional time or at a
particular story event/chapter. Preserve prior states so the author can
inspect how a relationship evolved. Support unknown or approximate
effective dates. Display a relationship history and connect changes to
the events or scenes that caused them when the author provides that
information. Do not infer motivations or invent causes. Add tests
showing that changing a current relationship does not erase its previous
state.

## Prompt 26 --- Build the interactive character relationship map

Create a visual network of character nodes and relationship edges.
Provide zoom, pan, drag-to-reposition where appropriate, node selection,
edge details, and a focus-on-character action. Use distinct but
accessible styling for different relationship types and make
directionality clear. Provide filters for relationship type,
current/historical state, chapter range, faction, and character. Avoid a
cluttered "hairball" by allowing the user to hide layers and focus on a
local neighborhood. Provide a list/table alternative. Test selection and
filtering with large networks.

## Prompt 27 --- Add knowledge, secrets, and character-awareness tracking

Create an optional structured system for tracking secrets, information,
beliefs, and character awareness. A record should distinguish a fact in
the world from what a particular character knows, believes, suspects, or
falsely believes. Record how and when the character learned it if the
author supplies that information. Visualize which characters know a
secret and how knowledge spreads across events/scenes. This must be
manual and data-driven, not AI inference. Do not automatically declare a
character's knowledge inconsistent unless an explicit rule and
supporting records establish the issue. Add tests for unknown, partial,
false, and changed knowledge states.

------------------------------------------------------------------------

# Phase 6 --- Plot boards and story structure

## Prompt 28 --- Build a visual chapter and scene board

Create a board for chapters and scenes that complements rather than
replaces the writing editor. Support columns or lanes, drag-and-drop
ordering if compatible with the current UI framework, scene cards,
chapter grouping, status labels, word counts where available, and direct
navigation to the manuscript. Reordering should update the canonical
chapter/scene order through existing services. Provide undo where the
project supports it and guard against accidental bulk changes. Ensure
the board stays synchronized with the editor and existing chapter
organizer.

## Prompt 29 --- Add plot-thread lanes and subplot tracking

Allow authors to define plot threads and associate scenes/events with
one or more threads. Show each thread across chapters as a lane or
sequence, with its introduction, development, intersections, and
resolution recorded by the author. Support statuses such as planned,
active, paused, resolved, abandoned, or custom. Make gaps visible as
informational indicators, not automatic writing judgments. Let users
filter the board by thread and navigate from a thread to the relevant
scenes. Do not invent missing plot beats.

## Prompt 30 --- Add story structure and pacing visualizations

Add optional visualizations for act structure, turning points, major
reveals, climax, resolution, and other author-defined structural
markers. Do not impose a single mandatory storytelling formula. Provide
a chapter/scene length chart, distribution by chapter, and user-defined
event/scene labels such as action, dialogue, exposition, romance,
mystery clue, or quiet moment. Derive charts from explicit labels and
existing word counts. Explain that such metrics describe recorded data;
they do not measure literary quality. Add filters and tests for empty or
incomplete manuscripts.

## Prompt 31 --- Add a character appearance matrix

Create a matrix or table showing characters against chapters/scenes,
based on explicit appearance associations. Let users filter by
character, chapter range, plot thread, location, or status. Provide
quick navigation to a selected intersection. Clearly distinguish
"confirmed appearance," "mentioned," and "unknown" only if the data
model supports those distinctions; do not treat an absent record as
proof that a character does not appear in manuscript text. Add a manual
workflow for maintaining appearance records and tests for filtering and
navigation.

------------------------------------------------------------------------

# Phase 7 --- Knowledge graph and cross-references

## Prompt 32 --- Build the interactive story knowledge graph

Create a graph visualization over the shared entity and connection
records. Support node types including characters, locations, factions,
items, abilities, species, events, chapters, scenes, plot threads, and
custom records that are eligible for graph display. Support typed edges
such as owns, belongs to, created by, appears in, occurred at, knows,
caused, and user-defined types. Add zoom, pan, selection, filters,
node/edge legends, and a detail panel. Do not create separate graph-only
records. Provide a table/list alternative and test core graph queries.

## Prompt 33 --- Prevent graph clutter and support exploration

Add graph usability features: focus on selected node, show one or two
connection levels, collapse groups, hide/show node types, hide/show
connection types, search, highlight a path between selected records when
a path exists, and restore the full view. Handle large graphs using
sensible limits, progressive expansion, or other strategies appropriate
to the current graph library. Make it clear when results are limited so
the user does not mistake a partial view for the entire story. Keep
graph rendering responsive and add performance tests or repeatable
manual test steps.

## Prompt 34 --- Improve cross-reference navigation and record integrity

Ensure that related-record panels and manuscript references can navigate
in both directions where meaningful. Support connection statuses such as
confirmed, provisional, disputed, or invalid if compatible with the
model. Detect dangling links, duplicate-looking records, and unresolved
references using deterministic rules. Suggestions to merge records must
require explicit user approval and preserve all references. Renaming or
moving a record must not break links. Add tests for deletion, renaming,
import/export, and broken-reference handling.

------------------------------------------------------------------------

# Phase 8 --- Custom data and progression systems

## Prompt 35 --- Build the custom record type and field template builder

Allow users to define custom record types such as spells, planets,
investigations, techniques, organizations, species, technologies,
relics, or any other fictional concept. Support common field types:
text, number, date, checkbox, dropdown, multi-select, references to
other records, and appropriate structured fields supported by the app.
Support templates, optional/required fields, validation, and reusable
configurations. Keep this flexible without letting arbitrary custom
fields break the app's core data model. Ensure custom records can be
linked, searched, exported, and optionally shown in the graph.

## Prompt 36 --- Make custom records visualization-aware

Let custom record types opt into supported visualizations by mapping
fields to capabilities, such as timeline date fields, graph labels,
graph connections, map coordinates, progression rank, or ownership
history. Provide explicit configuration and validation instead of
guessing based on field names. If a custom type does not contain the
fields needed for a view, explain what is missing and offer a list/table
view. Preserve custom fields across exports and schema updates. Add
tests for partially configured and fully configured custom types.

## Prompt 37 --- Build the character progression tracker

Implement structured tracking for a character's progression across the
novel. Depending on the author's schema, this may include levels, ranks,
titles, attributes, abilities, equipment, transformations, class/job
changes, milestones, restrictions, and costs. Keep the system
genre-neutral and let the author configure which categories apply.
Record when changes occur and connect them to events, chapters, or
scenes when known. Do not assume every character has levels or combat
statistics. Add tests for characters with no progression data and for
changes over time.

## Prompt 38 --- Build ability trees and evolution paths

Create an interactive tree or directed graph for abilities, skills,
techniques, transformations, jobs/classes, upgrades, and evolutions.
Support prerequisite, upgrade, evolution, fusion, replacement, and
mutually exclusive connections where the author defines them. Display
ranks, acquisition events, requirements, limitations, and holders if
available. Do not assume that every connection is a prerequisite or that
all abilities follow one progression system. Support branches,
alternative paths, and user-defined rules. Keep progression records
linked to their actual character and ability records, and test cycles
and invalid dependencies.

------------------------------------------------------------------------

# Phase 9 --- World maps, locations, factions, and objects

## Prompt 39 --- Build the location explorer and optional world map

Implement a location explorer that works even without a graphical map.
Support location hierarchies such as universe, galaxy, planet,
continent, region, city, building, room, or user-defined hierarchy. Link
locations to characters, events, factions, and chapters. If a map is
included, support author-provided coordinates or a suitable
user-controlled map background. Do not require online map providers,
geocoding, or external uploads. If no coordinates exist, keep the
location usable in a list/tree view. Add tests for nested locations and
missing coordinates.

## Prompt 40 --- Add travel routes and location history

Allow authors to record character or group movement between locations,
including departure/arrival times or relative order, travel method,
duration, and related events. Visualize routes and location history
where coordinates or a map layout are available; otherwise show a
chronological route list. Use deterministic rules to flag possible
travel-time conflicts only when the author has provided enough data. Do
not assume real-world travel speeds for fictional settings unless the
author configures them. Test missing times, approximate journeys, and
overlapping location intervals.

## Prompt 41 --- Add faction, influence, and item-ownership maps

Create optional views for faction memberships, alliances, rivalries,
leadership, territories, influence, and historical changes. Add an
item-ownership history view showing creation, discovery, transfer,
theft, inheritance, loss, and destruction when the author records those
events. Use the shared temporal and connection models. Avoid assuming
that membership or ownership is permanent. Allow custom relationship
types and a list/table fallback. Add tests for changes over time,
unknown ownership, and branch-specific ownership.

------------------------------------------------------------------------

# Phase 10 --- Canon, continuity, and analytics

## Prompt 42 --- Add canon and continuity overlays

Connect canon status and continuity review data to visualizations.
Support the project's existing canon states or add clearly defined
states such as confirmed, provisional, disputed, non-canon, and
alternate branch only if compatible with existing conventions. Show
relevant markers on timeline events, graph nodes, relationship edges,
and plot cards. Create deterministic checks for explicit contradictions
in structured records, missing required links, invalid dates, and other
well-defined rules. Each warning must explain the data and rule behind
it. Do not use AI, silently change canon, or modify manuscript prose.

## Prompt 43 --- Add a continuity review dashboard

Create a dashboard that collects warnings from supported deterministic
checks. Organize by severity and category, with links to the affected
records and visualization context. Let authors mark warnings as
resolved, intentional, ignored, or needing review, with optional notes.
Preserve the difference between a confirmed data error and a possible
inconsistency. Avoid producing warnings from unsupported assumptions or
absent information. Test warning creation, status changes, persistence,
and navigation to the source record.

## Prompt 44 --- Add creative analytics and distribution charts

Create optional charts from explicit manuscript and structured metadata:
words per chapter/scene, chapter length distribution, character
appearances, plot-thread presence, event density over time, POV
distribution if recorded, and author-defined scene categories. Do not
infer literary quality, emotional impact, or genre correctness. Explain
what data each chart uses and show an empty state when the data is
incomplete. Provide filters by date range, chapter range, plot thread,
or other relevant dimensions. Make charts accessible and provide an
underlying table or downloadable data where feasible.

------------------------------------------------------------------------

# Phase 11 --- Polish, performance, export, and verification

## Prompt 45 --- Finish responsive behavior, accessibility, and keyboard controls

Audit every visualization on desktop, tablet, and mobile sizes. Ensure
that controls remain usable, panels do not obscure essential content,
graph canvases can be navigated without a mouse where feasible, and
information is not conveyed by color alone. Add labels, focus states,
sensible tab order, escape behavior for dialogs, and keyboard-accessible
alternatives for drag-and-drop operations. Respect reduced-motion
preferences if animations exist. Fix accessibility and responsive issues
without changing unrelated screens. Run the project's available
accessibility checks and record manual checks honestly.

## Prompt 46 --- Add visualization export and printing

Allow users to export appropriate views to formats supported by the
project, such as image, print-friendly layout, CSV/table data, or
structured JSON. Preserve underlying data fidelity when exporting
records; visual snapshots are not substitutes for a full data backup.
Include titles, legends, selected filters, and a timestamp or view
description when useful. Do not export hidden private data unexpectedly.
Ensure exports work offline if the app is designed for offline use. Test
long names, large views, empty views, and non-English characters.

## Prompt 47 --- Optimize large-story performance

Profile the app with realistic large datasets, including hundreds or
thousands of events, characters, connections, scenes, and custom records
where appropriate. Identify actual bottlenecks before optimizing. Use
memoization, indexed queries, virtualization, graph limits, progressive
expansion, or batching only where they fit the current architecture.
Avoid losing selected state or displaying stale results. Keep filtering
and navigation responsive. Add repeatable performance tests or
documented manual benchmarks and compare results before and after
changes.

## Prompt 48 --- Verify persistence, migrations, and data ownership

Perform an end-to-end audit of save/reload, autosave, app restart,
export/import, backup/restore, renaming, deleting, and disabling any
optional visualization module. Verify that turning off a view never
deletes its data. Verify that custom fields and unknown extension data
survive supported round trips. If migrations are needed, test upgrades
from a representative previous data format and ensure failures do not
corrupt the original data. Do not add cloud syncing or third-party
transmission. Document backup and recovery behavior accurately.

## Prompt 49 --- Run cross-feature integration tests

Test the system as a connected whole: 1. Create a character, event,
location, ability, plot thread, chapter, and scene. 2. Connect them
through the supported shared relationships. 3. Add the event to the
fictional chronology and link it to a chapter that appears later in
reading order. 4. Change a character relationship and confirm historical
states remain available. 5. Show the same records in the timeline,
relationship map, plot board, and knowledge graph. 6. Rename a record
and verify that links remain intact. 7. Create an alternate timeline
branch and verify that it does not silently change the main canon. 8.
Export and re-import data and verify references. 9. Disable and
re-enable a visualization module and confirm data remains intact. 10.
Test incomplete and contradictory data and verify that warnings explain
themselves without changing records. Fix issues caused by the
implementation. Do not hide failures or claim tests passed if they did
not.

## Prompt 50 --- Final architecture and product review

Review the completed visualization system against the acceptance
checklist from Prompt 4. Identify which items are complete, partial,
blocked, or not implemented, with evidence from files and tests. Check
for duplicate data models, hardcoded genre assumptions, graph-only
information, inaccessible controls, unsupported claims, AI dependencies,
unexpected network transmission, broken links, and regressions in
existing app features. Produce a concise technical report with: -
Features completed and their entry points. - Data models and migrations
introduced. - Tests and actual results. - Known limitations and
unresolved issues. - Performance/accessibility observations. -
Recommended next steps ranked by impact and risk. Do not begin a new
large implementation phase after this review. Stop and wait for my
approval.

------------------------------------------------------------------------

## Optional follow-up prompts (use only after the 50-step sequence)

### Optional Prompt A --- Improve the visual design without changing architecture

Review the existing visualization screens for consistency and usability.
Propose a small design system for spacing, typography, colors, node/edge
styling, legends, focus states, panels, and responsive layouts. Keep the
existing app identity. Do not redesign unrelated screens or alter data
structures. First show a concise plan and list the files that would
change; wait for approval before implementing.

### Optional Prompt B --- Add a user-configurable dashboard

Create a dashboard where the author can place, resize, reorder, and
remove widgets such as upcoming story events, plot-thread status, recent
records, chapter word counts, character appearances, continuity
warnings, and saved visualizations. Each widget must use existing shared
data and offer configuration. Persist layout preferences without copying
the source records. Do not show fabricated metrics or default demo
content as real user data.

### Optional Prompt C --- Create a realistic test novel for QA only

Create a clearly separated, removable test fixture or development-only
sample novel containing a few characters, relationships, parallel
events, a flashback, multiple chapters, a location hierarchy, an ability
progression tree, a plot thread, and an alternate timeline. Use it only
for development/testing, never silently insert it into the user's real
novel library. Ensure it can be deleted cleanly and is not included in
production defaults. Add tests that verify the visualizations agree on
the same shared records.

### Optional Prompt D --- Add module settings and dependency safeguards

Review the app's module manager. Make each visualization module
enableable/disableable where appropriate, document dependencies, and
ensure disabling a module hides its interface without deleting records.
Prevent disabling a required shared service while dependent modules are
active, or provide a clear explanation and safe workflow. Test
enable/disable cycles and preserve user data.

### Optional Prompt E --- Review a specific visualization with screenshots

I will provide screenshots of a visualization. First describe concrete
usability issues you can actually observe. Then propose a minimal design
change plan. Do not invent unseen behavior or alter unrelated screens.
After approval, implement the change using existing shared components
and data contracts, and verify it at desktop and mobile sizes.

------------------------------------------------------------------------

## Recommended checkpoints

-   After Prompt 4: commit the audit and acceptance criteria.
-   After Prompt 11: commit the shared data foundation and migrations.
-   After Prompt 15: commit the visualization framework and navigation.
-   After Prompt 23: commit the timeline.
-   After Prompt 27: commit relationship and knowledge tracking.
-   After Prompt 31: commit plot-board and structure views.
-   After Prompt 34: commit the knowledge graph and cross-reference
    improvements.
-   After Prompt 38: commit custom schemas and progression views.
-   After Prompt 41: commit location, faction, and ownership views.
-   After Prompt 44: commit canon/continuity and analytics.
-   After Prompt 50: tag a stable release candidate.

**Do not skip directly to a later prompt if its prerequisites are not
complete.** If Claude Code cannot finish a prompt within one session,
ask it to finish only that prompt, summarize what remains, and avoid
starting the next step until the current acceptance criteria pass.
