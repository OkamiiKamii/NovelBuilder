# A novel's own calendar

**Written:** 2026-10-21. Built at the owner's request after Prompt 18, alongside Prompt 19.

**Code:**
- `src/modules/timeline/calendar.ts`: the calendar, its checks, and dates in it; pure
- `timeline/calendarService.ts`: reading and saving a novel's calendar
- `timeline/components/CalendarForm.tsx`: the "Story calendar" section of Project settings
- changed to read dates in the novel's calendar:
  - `chronology.ts`
  - `scale.ts`
  - `service.ts` (`normalizeDate`)
  - `model/validity.ts`, `model/events.ts`, `model/model.ts`
  - `EventDetails.tsx`, `TimelinePage.tsx`, `TimelineChart.tsx`
  - `assistant/context.ts`

**Tests:**
- `timeline/calendar.test.ts`, 10 tests
- "A calendar of the novel's own" in the Visualize section of `e2e/smoke.mjs`

## Two calendars to choose from

**Standard calendar.** Every novel starts on it, and nothing about it changed:
- twelve months, January to December;
- 24-hour days;
- years written "Year 10".

A test checks that every kind of date (day, month, year, season, hour) lands exactly where the old formulas put it.

**A calendar of the novel's own.** Chosen in **Project settings → Story calendar**. It has:

| Setting | Notes |
|---|---|
| Name | "The Reckoning" |
| Months | Each with its own name and number of days (1 to 1,000). Add, remove, reorder. Starts from the real-world months and lengths |
| Hours in a day | 1 to 1,000 |
| Days in a week | 1 to 100; used by the timeline's week scale and by durations in weeks |
| Eras | Optional. A name and a first year: "Second Age" from year 1000 makes year 1003 "Second Age 4". Years before the first era stay "Year N" |
| Seasons | The month each season begins in. A season lasts until the next begins, so winter can run into the next year |

**Before saving, the editor shows:**
- **A description and a sample date:** "The Reckoning: 12 months, 364 days a year, 1 era. Dates read like 'Second Age 4, Thaw 1'."
- **Any problem, in words.** For example, a month with no name, a day count that isn't a whole number, or two eras starting in the same year. Save stays disabled until it's fixed.
- **Events whose dates the new calendar doesn't have**, each with why ("Month 11 is not in The Reckoning, which has 10 months.").

**Changes are a draft** until **Save calendar**; **Discard changes** drops them.

## Dates are never rewritten

**Stored dates stay as they are.** A date is stored as a year, month, day and time, the same as before, and is read in whichever calendar is in use. Saving a calendar changes no event.

**A date that doesn't fit the calendar in use is listed apart, with the reason.** For example, month 12 when there are ten months, or day 45 in a 30-day month. It shows:
- on the Timeline page, as a "thing to check";
- in "Not placed in time" on the drawn timeline.

It comes back as soon as the date or the calendar changes.

**Switching back to the standard calendar keeps the novel's own settings,** ready to switch to again.

**When a date is saved,** it's checked against the calendar in use (`normalizeDate`):
- a month the calendar has;
- a day that month has;
- an hour its days have.

Detail that makes no sense is dropped, as it always was with the standard calendar. The standard calendar's rules are unchanged: twelve months, days up to 31, 24 hours.

## Where the calendar is used

| Place | What follows the calendar |
|---|---|
| Ordering events (`resolveChronology`) | Month starts, day and hour lengths, relative dates ("3 weeks after"), year headings |
| Dates as words (`formatDate`) | Month names, eras ("Second Age 4, Thaw 3"), "Summer of First Age 13". Times read "17:00" in a day that isn't 24 hours long |
| Ages (`lifePath`) | Counted in the novel's years |
| Validity and queries (`spanOfDate`, `inRange`) | Through the time context the model carries |
| Drawn timeline | Ticks on each month's real start; week scale; "Jump to date" also reads "Second Age 4" and "Bloom Second Age 4" |
| Event editor | The calendar's months, the day range as a hint, hour and minute fields for days that aren't 24 hours long, and the era beside the year |
| Timeline page | Year headings in eras; "Dates use The Reckoning: … Change the calendar" |

**Durations in months** use the average month (the year divided by the number of months), as before.

## Stored, copied, synced

**Schema v28 adds the table `storyCalendars`:** one row per novel, with `id` and `projectId`. No other table changes and no upgrade runs. A novel with no row uses the standard calendar.

**It's registered with the timeline,** so it's backed up, duplicated, forked, imported and deleted with its novel, as tested.

**For sync and permissions,** it's part of the story's lore: whoever may read or change events may read or change the calendar. Sync labels it "The story calendar".

**A damaged row** (for example, an edited backup) reads as the standard calendar, and the next save replaces it.

## Limits

- **Every year has the same months.** There are no leap years or leap days, and no intercalary days outside the months.
- **Weekday names aren't kept.** The week length is used only for the week scale and for durations in weeks.
- **Eras count forwards from their first year.** There are no "Before …" eras counting down; years before the first era are plain "Year N".
- **Dates are typed as plain years.** The editor shows the era beside the year, and the timeline's "Jump to date" reads era names.
