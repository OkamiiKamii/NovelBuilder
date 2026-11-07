import type { NovelDB } from '@/core/db';
import { createId } from '@/core/id';
import { calendarFrom, cleanCalendar, STARTING_CALENDAR, type Calendar, type CalendarSettings, type StoryCalendarRow } from './calendar';

/** The settings a novel with no calendar row has: the standard calendar, with a calendar of its own ready to fill in. */
export const DEFAULT_SETTINGS: CalendarSettings = { kind: 'standard', ...structuredClone(STARTING_CALENDAR) };

/**
 * A novel's calendar: which one its dates are read in. Saving one never
 * changes an event; each date is read in whichever calendar is in use.
 */
export function createCalendarService(db: NovelDB, onProjectChanged: (projectId: string) => Promise<unknown>) {
  return {
    forProject(projectId: string) {
      const stored = async (): Promise<StoryCalendarRow | undefined> => (await db.storyCalendars.where('projectId').equals(projectId).toArray())[0];
      return {
        /** The settings as the author last saved them, or the defaults. */
        settings: async (): Promise<CalendarSettings> => {
          const row = await stored();
          if (!row) return structuredClone(DEFAULT_SETTINGS);
          try {
            return cleanCalendar(row);
          } catch {
            // A damaged row (an edited backup) reads as the standard calendar; the next save replaces it.
            return structuredClone(DEFAULT_SETTINGS);
          }
        },

        /** The calendar dates are read in. */
        calendar: async (): Promise<Calendar> => calendarFrom(await stored()),

        /** Saves the settings, checked first: nothing is written when they have a problem. */
        async save(input: Partial<CalendarSettings>): Promise<CalendarSettings> {
          const settings = cleanCalendar(input);
          await db.transaction('rw', db.tables, async () => {
            if (!(await db.projects.get(projectId))) throw new Error('That project is not on this device.');
            const was = await stored();
            await db.storyCalendars.put({ ...settings, id: was?.id ?? createId(), projectId, updatedAt: Date.now() });
            await onProjectChanged(projectId);
          });
          return settings;
        },
      };
    },
  };
}

export type CalendarService = ReturnType<typeof createCalendarService>;
