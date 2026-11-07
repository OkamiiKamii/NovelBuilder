# Ages and a character's life history (Prompt 21)

**Written:** 2026-10-21.

**Code:**
- `src/modules/timeline/ages.ts`: ages, worked out as exactly as the dates allow; pure. It replaces the old `lifePath` in `chronology.ts`.
- `src/modules/characters/lifeHistory.ts`: a character's life, gathered from the records; pure, reads only
- the **Character history** view in `visualize/VisualizePage.tsx` (`/visualize/history?who=<character id>`)
- links to it from the Timeline page's life path and from the character page's History tab
- `timeline/calendar.ts`: a day now ends with its month (see below)

**Tests:**
- `timeline/ages.test.ts`, 11 tests: known, approximate and missing birth and age data, custom calendars, conflicts
- `characters/lifeHistory.test.ts`, 6 tests
- the life-history checks in the Visualize section of `e2e/smoke.mjs`

## Where an age comes from

Only from what the author has recorded. Each of these is a clue to when the character was born:

| Clue | Where it is recorded | What it says |
|---|---|---|
| Date of birth | A field on the profile named "Date of Birth", "Birth date" or "Born" | Read as a date in the novel's calendar: "1000-3-1", "1000", "Second Age 4". Born within that day, month or year |
| Their birth | An event where their age is 0 | Born within that event's date |
| Their age at an event | The age next to their name on an event | Their a-th birthday has come and their next hasn't: born between a + 1 years and a years before |

**All clues are combined** into the earliest and latest possible birth. The age at any other event is then:
- **exact** ("Age 26") when the dates allow it;
- **a range** ("Age 25–26") when they don't. For example, born some time in Year 1000: on 14 October 1026 they may or may not have had their birthday yet;
- **unknown**, with the reason, when nothing is recorded, the event has no date, or the records disagree;
- **"Before their birth"** for an event before they were born. If they take part in it, that's pointed out.

**A stated age always shows as stated.** It is never changed.

**Birthdays are counted by the calendar's day and month,** as people count them: on the day they turn 17 they are 17, whatever the hour. This follows a novel's own calendar: its months, its year length and its eras.

**Unreadable dates are said to be unreadable.** A date of birth that can't be read ("the year of the comet") isn't used, and the page says so, with examples of what can be read. Nothing is guessed.

## Disagreements

Each stated age is checked against all the other clues:
- **Two clues disagree:** neither can be preferred, so both are pointed out. Ages are then "unknown: the ages and dates given for them disagree", and the stated ones still show.
- **Three or more:** the one out of line is the only one pointed out.

The wording: "Mira is stated as age 40, but the dates make it 25–26 (counting from their birth, 'Mira is born')."

## Change to existing behaviour

**Before:** the life path counted whole years from one reference event, as if every date were exact.

**Now:** ages are exact only where the dates are, as this prompt asks. Three existing expectations changed from invented precision to the honest answer:

| Case | Before | Now |
|---|---|---|
| Mira, born "Year 1000", in "Summer of 1008" (e2e) | Age 8 | Age 7–8 |
| Mira on 14 October 1026 (e2e) | Age 26 | Age 25–26 |
| Bren, 14 in "autumn 1012", in "Year 1015" (unit test) | Age 16 | Age 16–18 |

**The contradiction message** now names the range instead of "about 26". Where the clues disagree, each one that doesn't fit is pointed out.

**A calendar fix found on the way.** The standard calendar's months are even twelfths of a year, about 30.4 days. So the "31st" is a short day, and its date used to run a full 24 hours into the next month: 31 December 1025 ended in 1026. A day now ends with its month. Custom calendars are unaffected, because their months are whole days.

## The life history

**Visualize → Character history,** with **Whose history** (or select any character in another view). Everything recorded about them, each line a reference to the record it comes from: selecting it shows that record's details, and nothing is copied.

| Part | What | Order |
|---|---|---|
| **In story time** | Events they take part in or are involved in, with their age and where the event happens. Their date of birth. Places, affiliations and other ties the author dated by an event or a date ("Member of the Guild from 'The siege'") | When things happen |
| **As the reader meets them** | Chapters they appear in: by the author's appearance records ("Appears in", "Mentioned in", "Point of view in", read as the Character appearances view reads them; added with Optional Prompt C), and where they are linked in the text or listed in the chapter plan. Relationship changes (each stage from its chapter). Progression snapshots. Milestones from their profile. Ties dated by a chapter | Reading order |
| **Throughout** | Ties with no time given; the abilities on their sheet | — |

Story time and reading order stay apart, as in Prompt 20: a chapter is never compared with a date.

**At the top:** when they were born, and what that's worked out from ("Born on Year 1, June 1, worked out from the date of birth on their profile (1-6-1)"). Below it, **Worth a look** lists disagreements and unreadable dates.

**Ways in:**
- from the Timeline page's life path ("Mira's whole life history");
- from the character page's History tab, whose own lists are unchanged.

## Limits

- **Age is counted at an event's start.** A war lasting years shows their age when it began.
- **The profile's "Age" field isn't used.** It isn't tied to any moment in the story, so ages can't be counted from it. Give their age at an event instead.
- **Affiliations come from typed connections only.** A profile field naming a faction counts only when it's a reference field. The profile's "Former"/"Secret" link statuses aren't shown here.
- **No drawn lifeline.** The history is a list. For a drawn one, use the Timeline view with the "Involving character" filter.
