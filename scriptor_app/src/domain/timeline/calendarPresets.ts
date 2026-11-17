// Ready-made calendars to begin from. A port of flutter_app/lib/shared/domain/timeline/calendar_presets.dart.

import type { JsonMap } from '../json';
import { calendarProblems } from '../records/calendar';
import { intOrNull, maps } from '../records/jsonRecord';

/** A ready-made calendar to begin from: its name, a line on what it is like, and its settings (as a custom calendar's
 * are stored). Every name and number can be changed after. */
export type CalendarPreset = { name: string; about: string; settings: JsonMap };

function calendar(
  name: string,
  months: readonly (readonly [string, number])[],
  options: {
    daysPerWeek?: number;
    hoursPerDay?: number;
    eras?: readonly (readonly [string, number])[];
    seasons: Record<string, number>;
  },
): JsonMap {
  return {
    kind: 'custom',
    name,
    months: months.map(([n, d]) => ({ name: n, days: d })),
    hoursPerDay: options.hoursPerDay ?? 24,
    daysPerWeek: options.daysPerWeek ?? 7,
    eras: (options.eras ?? []).map(([n, y]) => ({ name: n, startYear: y })),
    seasons: options.seasons,
  };
}

export const calendarPresets: readonly CalendarPreset[] = [
  {
    name: 'Thirteen moons',
    about: 'Thirteen months of 28 days, one to each moon; weeks of seven.',
    settings: calendar(
      'The Moon Reckoning',
      [
        'Frostmoon',
        'Wolfmoon',
        'Thawmoon',
        'Seedmoon',
        'Bloommoon',
        'Longmoon',
        'Highmoon',
        'Hayemoon',
        'Harvestmoon',
        'Huntermoon',
        'Fallmoon',
        'Darkmoon',
        'Deepmoon',
      ].map((n) => [n, 28] as const),
      {
        eras: [
          ['Before the Moons', -1000],
          ['of the Moons', 1],
        ],
        seasons: { spring: 3, summer: 6, autumn: 9, winter: 12 },
      },
    ),
  },
  {
    name: 'The long year',
    about: 'Ten months of 36 days and a five-day festival; weeks of six.',
    settings: calendar(
      'The Long Count',
      [
        ...['Ashen', 'Rain', 'Sowing', 'Green', 'Sun', 'Gold', 'Reaping', 'Smoke', 'Iron', 'Silence'].map((n) => [n, 36] as const),
        ['The Festival', 5] as const,
      ],
      { daysPerWeek: 6, eras: [['Age of Kings', 1]], seasons: { spring: 2, summer: 5, autumn: 7, winter: 9 } },
    ),
  },
  {
    name: 'The four turns',
    about: 'Four long months, one to a season, of 91 days, and a day of turning; weeks of seven.',
    settings: calendar(
      'The Turning',
      [
        ['Bloom', 91],
        ['Blaze', 91],
        ['Fall', 91],
        ['Frost', 91],
        ['Turnday', 1],
      ],
      { eras: [['First Turning', 1]], seasons: { spring: 1, summer: 2, autumn: 3, winter: 4 } },
    ),
  },
  {
    name: 'A ship’s cycles',
    about: 'Twenty cycles of 20 days, 20-hour days, ten-day watches: for a world with no sun to count by.',
    settings: calendar(
      'Ship Standard',
      Array.from({ length: 20 }, (_, i) => [`Cycle ${i + 1}`, 20] as const),
      {
        daysPerWeek: 10,
        hoursPerDay: 20,
        eras: [['After Launch', 1]],
        seasons: { spring: 1, summer: 6, autumn: 11, winter: 16 },
      },
    ),
  },
];

/** How long a preset's year is, said plainly: "364 days in 13 months". */
export function yearOf(settings: JsonMap): string {
  const months = maps(settings['months']);
  const days = months.reduce((a, m) => a + (intOrNull(m['days']) ?? 0), 0);
  return `${days} days in ${months.length} months`;
}

/** Every preset is a calendar the app accepts as it is. */
export function presetIsValid(p: CalendarPreset): boolean {
  return calendarProblems(p.settings).length === 0;
}
