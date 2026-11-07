# Story order and reading order (Prompt 20)

**Written:** 2026-10-21.
**Code:**
- `src/modules/timeline/narrative.ts`: both orders, where each telling falls, suggestions; pure, reads only
- `timeline/components/TwoOrdersChart.tsx`: the side-by-side drawing
- the **Story vs reading order** view in `visualize/VisualizePage.tsx` (`/visualize/order`)
- `timeline/components/EventDetails.tsx`: how each chapter tells an event
- `TimelinePage.tsx`, `LinkedEvents.tsx`: the role shown where events are listed
- `timeline/types.ts`: the new `flashforward` role

**Tests:**
- `timeline/narrative.test.ts`, 5 tests on a deliberately nonlinear book
- "Story order beside reading order" in the Visualize section of `e2e/smoke.mjs`, 15 checks

## Two orders, never derived from each other

| | Comes from | Changed by |
|---|---|---|
| **Story order** (when it happens) | The timeline: dates, relative dates, "comes after", in the novel's calendar (`resolveChronology`) | Editing an event's date |
| **Reading order** (when the reader meets it) | The manuscript: the order of chapters and scenes | Moving chapters on the Manuscript page |

**One event can be told in several places.** An event links to any number of chapters and scenes (`nodeIds`), each with how it tells it (`reveals`).

**Linking never moves anything.** Linking a chapter, or marking how it tells the event, never moves the event in time and never reorders a chapter. The tests check this:
- **Unit test:** reading and comparing writes nothing, and moving a chapter changes only reading order.
- **Browser:** the chapters' stored order and update times are unchanged after linking, marking and comparing.

## How a chapter tells an event

Set on the Timeline page. Each linked chapter or scene is listed in reading order, with a choice of how it tells the event:

| Choice | Stored role | Meaning |
|---|---|---|
| Told here | `told` (the default; not stored) | The story's main line |
| As a flashback | `flashback` | Goes back to something earlier |
| As a flash-forward | `flashforward` (**new**) | Shows something later ahead of time, e.g. a prologue set at the end |
| Foreshadowed | `foreshadowed` | Hints at something still to come |
| Only mentioned | `mentioned` | Referred to, not shown |
| Revealed afterwards | `revealed` | Learned later than it happened: a secret, a past crime |

**Where the role is shown:**
- the Timeline page's event cards: "Told in The Well (revealed afterwards)";
- a chapter's plan panel, beside each event, which also says its events are in story order, not chapter order;
- the details panel in every Visualize view: "Flash-forward in …".

**Prologues and non-linear books** need no special kind of chapter. A prologue is a chapter like any other: marked as a flash-forward if it is set later, told plainly if the story starts there.

## Where each telling falls

The **main line** is what is told plainly. At each point in the book it has reached the latest plainly told event so far. Each other telling is measured against that point:
- **goes back in time:** it happens before where the main line has got to (a flashback, a reveal);
- **goes ahead in time:** it happens after it (a flash-forward, a foreshadowing).

**Before the main line starts,** nothing read so far can be later, so nothing goes back. A telling there goes ahead only if it happens after the main line's first event.

**A plainly told event** "goes back" if it happens before something already told plainly. Jumping forward is just the story moving on.

**Events with no place in time** (undated, and not set to follow another) are listed apart and never compared.

**The summary says it in one sentence:** "Told in story order: …", or "Not told in story order: 1 telling goes back in time, and 2 go ahead."

### Suggestions, never corrections

Where how a telling is marked and where it falls don't seem to agree, **Worth a look** says so as a question:

| Situation | Suggestion |
|---|---|
| Told plainly, but before something already told plainly | "… is told in Ch 2: The Reign, after 'The curse' (Ch 1: Prologue), which happens later. Is this a flashback, or that a flash-forward?" |
| Marked as a flashback, but the main line hasn't got past it there | "… is marked as a flashback in …, but the story told plainly has not got past it yet there." |
| Marked as a flash-forward, but it isn't later than what's around it | "… is marked as a flash-forward in …, but it does not happen after what is told plainly around it." |
| Foreshadowed after it has already been told | "… is foreshadowed in …, after it is already told in …" |

Nothing is changed, and nothing blocks anything. A story can have every reason to do any of these.

## The comparison view

**Visualize → Story vs reading order**, with Side by side / List and the same filters, selection and saved views as the other views.

**Side by side:**
- **Left:** chapters and scenes that tell something, in reading order.
- **Right:** every event in story order, those with no place in time last.
- **Lines:** one for each telling, drawn differently for each role (solid, dashed, long-dashed, dotted, thin, dash-dot), all named in the legend.
- **Crossing lines** are where the book is told out of story order.
- **Selecting** a chapter or event picks out its lines and shows its details.

The names are ordinary buttons in two lists, each carrying (for screen readers) what it tells or where it is told, how, and whether that goes back or ahead.

**List:**
- **As the reader meets it:** every telling in reading order (chapter, event, how, when it happens, its place in story order, back/ahead).
- **As it happens:** every event in story order, with the chapters that tell it, or "Not told in any chapter yet".

**Filters** narrow the events. The chapters shown are those that tell one of them. Back/ahead is always worked out against the whole book, so filtering never changes it.

## The test book

`narrative.test.ts` builds "The Last Duel" on purpose out of order:
1. a prologue that flashes forward to the duel;
2. childhood;
3. training, foreshadowing the betrayal and mentioning an undated rumour;
4. a flashback to the mother's death;
5. the betrayal, with an old pact revealed afterwards;
6. the duel in full.

There is also an aftermath told nowhere.

It checks:
- both orders;
- where every telling falls;
- the summary;
- that a fully marked book gets no suggestions, and an unmarked one gets the questions above;
- that a book told in order says so;
- that moving a chapter changes only reading order.

## Limits

- **Reading order is the manuscript's order of chapters and scenes.** Order within a scene's text isn't tracked: a flashback halfway through a chapter counts as that chapter.
- **"Main line" is what the author marks as told plainly.** Nothing guesses a frame story or a second timeline running alongside.
- **The same moment.** Two events at the same moment share a place in story order, so neither goes back or ahead of the other.
