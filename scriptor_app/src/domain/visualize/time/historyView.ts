// Visualize › Character history: everything recorded about one character, put together. The pure parts of
// flutter_app/lib/features/timeline/life_history_page.dart: whose it is, the three readings (in story time, as the
// reader meets them, throughout), what each line says, its icon, and where a press goes. Each line is a reference to
// the record it comes from; nothing is copied. Story time and reading order stay apart.

import type { JsonMap } from '../../json';
import { CharacterHistoryLine } from '../../characters/characterRecords';
import { ageLabel } from '../../timeline/ages';
import { type HistoryItem, type HistoryItemKind, type LifeHistory, historyItemKindLabel, lifeHistory } from '../../timeline/lifeHistory';
import type { StoryModel } from '../../model/storyModel';

/** Each kind's icon (Material Community names; the Flutter app's Material icons in a comment). */
export const historyIcons: Readonly<Record<HistoryItemKind, string>> = {
  birth: 'cake-variant-outline', // cake_outlined
  event: 'calendar-outline', // event_outlined
  place: 'map-marker-outline', // place_outlined
  affiliation: 'account-group-outline', // groups_outlined
  ability: 'auto-fix', // auto_awesome_outlined
  appearance: 'book-open-variant', // menu_book_outlined
  relationship: 'account-multiple-outline', // people_outline
  milestone: 'flag-outline', // flag_outlined
  progress: 'trending-up', // trending_up
  journey: 'routes', // route_outlined
};

export const historyKindLabel = (k: HistoryItemKind): string => historyItemKindLabel[k];

/** A line's second row: when, their age then, and the detail. */
export function historySubtitle(i: HistoryItem): string {
  return [i.when, ...(i.age !== null && ageLabel(i.age) !== '' ? [ageLabel(i.age)] : []), ...(i.detail !== '' ? [i.detail] : [])].join(' · ');
}

/** Whether a line can be pressed: it refers to a record, or to the character's History tab. */
export const historyPressable = (i: HistoryItem): boolean => i.ref !== null || i.to?.page === 'history';

/** The life of `who` (null when no such character is chosen). */
export function lifeOf(
  model: StoryModel,
  characterIds: readonly string[],
  who: string | null,
  rows: { snapshots: readonly JsonMap[]; milestones: readonly JsonMap[] },
): LifeHistory | null {
  const chosen = who !== null && characterIds.includes(who) ? who : null;
  if (chosen === null) return null;
  return lifeHistory(model, chosen, {
    snapshots: rows.snapshots,
    milestones: rows.milestones.map((r) => new CharacterHistoryLine(r)),
  });
}

/** The three readings, each with its caption and what it says when empty. */
export function historySections(life: LifeHistory): { title: string; caption: string; items: readonly HistoryItem[]; empty: string }[] {
  return [
    {
      title: 'In story time',
      caption: 'Events they take part in, with their age and where they were; ties dated by an event or a date.',
      items: life.story,
      empty: 'Nothing dated in story time yet.',
    },
    {
      title: 'As the reader meets them',
      caption: 'Chapters they appear in, relationship changes and milestones, in reading order.',
      items: life.reading,
      empty: 'Not met in any chapter yet.',
    },
    { title: 'Throughout', caption: 'Ties with no time given, and what they hold.', items: life.throughout, empty: 'Nothing else.' },
  ];
}

export const historyWords = {
  title: 'Character history',
  whose: 'Whose history',
  choose: 'Choose a character',
  emptyTitle: 'No characters yet',
  emptyMessage: 'Add characters under Organize, and their history gathers here from everything you record.',
  chooseFirst: 'Choose a character to see their whole history.',
  worth: 'Worth a look',
  worthCaption: 'Nothing is changed: each stated age still shows as stated.',
} as const;

/** The page's address for `who` (as the Flutter app's). */
export const historyPath = (who: string | null): string => (who === null ? '/visualize/history' : `/visualize/history?who=${who}`);
