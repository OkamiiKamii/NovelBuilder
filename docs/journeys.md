# Journeys, routes and location history (Prompt 40)

**Written:** 2026-10-22.

**Code:**
- `src/modules/travel/types.ts`: journeys and travel methods.
- `travel/routes.ts`: a journey read against the story (`journeyRecord`), a traveller's route (`routeOf`), possible conflicts (`travelProblems`), and taking a reference out (`withoutJourneyReference`); pure.
- `travel/service.ts`: journeys and travel methods, checked against the project.
- `travel/components/TravelForms.tsx`: **Record a journey** and **Travel methods**.
- `visualize/JourneysView.tsx`: the **Journeys** view.
- `model/connections.ts`: journeys as connections (`travel`).
- `characters/lifeHistory.ts`: journeys in a character's history.

**Tests:**
- `travel/travel.test.ts`, 14 tests:
  - **missing times;**
  - speeds never assumed; distances from a map;
  - **approximate journeys;** durations against speeds; arrivals before departures; contradicted order;
  - **overlapping location intervals:** two journeys at once, an event elsewhere during a journey or a stay, located in two places at once;
  - a chapter never compared with an event;
  - routes; connections; deletions; copies.
- "Journeys: routes and where everyone was…" in the Visualize section of `e2e/smoke.mjs`: 14 checks.

## Recording a journey

**Record a journey** (Visualize → Journeys). Only who travels is needed; everything else is as far as the author says:

| | |
|---|---|
| Who travels | characters, or a group (a faction, a company), several at once |
| From, to, by way of | places of the novel, or "not recorded" |
| Leaves, arrives | when is not known; at a chapter or scene; at an event; or on a date (a year, a month, a day), exact or approximately |
| Comes after | another journey, when only the order is known |
| How they travel | one of the novel's travel methods, or in your own words |
| Duration, distance | optional; a distance in the author's unit |
| Part of | events the journey belongs to |

## Speeds are the author's

**Travel methods…** names the novel's ways of travelling, each with a speed only if the author gives one ("30 leagues a day"). None is assumed, not even for walking.

A journey's **least time** is worked out only when the records give all of:
- a method with a speed;
- a distance in **the same unit** as the speed. The distance is the author's own, or, when every place of the journey has coordinates on one map, the straight-line distance on that map in the map's unit. Nothing is converted.

## Where everyone was

Choose **Whose journeys**. Their route is listed in three parts, the same way story time and reading order are kept apart everywhere (Prompt 8):
- **In story time,** by date:
  - journeys dated by an event or a date;
  - **stays** between dated journeys ("At Lyon, from Year 10, March 1 until Year 10, March 5");
  - events they take part in that have a place;
  - where they are recorded as located ("Located in", with when it holds).
- **As the reader meets them:** journeys at chapters or scenes.
- **When not known:** in the order the author gives ("after the journey to Lyon"), then as recorded.

With nobody chosen, every journey is listed, those with a date first.

**On a map:**
- When some journey's places have coordinates on a map (Prompt 39), routes are drawn there: a line through each journey's places with an arrow, numbered in story order, one colour a traveller.
- A journey with a place that has no coordinates on that map is listed under it as not drawn.
- The list is always there; with no map, it is all there is.

**Elsewhere:**
- Journeys are connections, so a place lists who **travels to it** and **leaves from it**, and Every connection and the knowledge graph have them.
- Each character's history has a "Journey" line for each.

## Possible conflicts

Each comes from one stated rule, and is flagged only when the records settle it. An approximate date counts as all the time it may mean, so a journey is "too fast" only if even the most generous reading of its dates is too short. Nothing is changed.

| | Rule | Example |
|---|---|---|
| Conflict | Arriving before leaving | "arrives (Year 10, May 2) before leaving (Year 10, May 10)" |
| Conflict | Too fast for its dates, at the author's speed | "50 leagues By horse at 30 leagues a day takes at least 1.7 days, but … allows at most 1 day" |
| Conflict | A duration its dates cannot hold, either way | "said to take 3 weeks, but its dates allow at most 5 days" |
| Conflict | A duration shorter than the speed allows | "said to take 2 days, but … takes at least 10 days" |
| Conflict | Said to come after a journey it leaves before | |
| Conflict | Two journeys of one traveller at once | |
| Conflict | Taking part in an event elsewhere during a journey (not at a place on the way, or inside one) | "takes part in “The feast” at Marseille while on the journey Lyon to Paris" |
| Note | Located in two places over the same time (not a place and one inside it) | |
| Note | Leaving from somewhere other than where they last arrived | "a journey may be missing" |
| Note | An event elsewhere while staying somewhere between journeys | "a journey may be missing" |

**Never flagged:**
- from a time that is not known;
- from a chapter against an event (a flashback can be on either side);
- from a speed the author has not set.

## When records go

- **A deleted chapter or event a journey is timed by:** found by the Record check (as "a journey"). **Take this reference out** keeps the journey, with that time no longer known.
- **A deleted traveller or place:** drops out of the journey, which keeps the rest.
- **A deleted journey:** one that came after it now comes after what it came after.
- **A travel method some journey uses** cannot be removed.
- **Copies, backups and forks** carry journeys and methods, pointing at the copy's own travellers, places, chapters and events. A fork keeps journeys it has reached.

## Data model

- **New tables (database version 34):** `journeys` and `travelSettings` (one row a novel). No migration is needed.
- **The shared model** gains `journeys`, and the connection kind `travel`: a traveller to the places they leave from, go to and pass through, to the chapter or event they set out and arrive at, and to the events a journey is part of.

## Limits

- **Distances on a map** are straight lines between pins. No roads, terrain or curves are worked out.
- **A journey is one stretch:** leaving and arriving. Stops along the way are places it passes through, without times of their own.
- **Stays** are drawn only between journeys dated in story time.
- **"Located in" the place they are travelling to** is not checked against the journey: it may mean a home.
