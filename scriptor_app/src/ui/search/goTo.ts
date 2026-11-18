// Going to a place (places.ts): a page, a tab of Organize (and a part of Plan or Review), a tab of Analytics, or a
// chapter in Write at a passage. Search's "Go to" and the tutorial's "Take me there" both go this way. Saves still
// waiting are written first, as the Flutter app's search flushes before it goes.

import { usePathname, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { openNovelSettingKey } from '../../data/settingsStore';
import type { AnalyticsTab, OrganizeTab, PlanPart, Place, ReviewPart } from '../../domain/search/places';
import { currentAnalyticsTab, rememberAnalyticsTab } from '../analytics/AnalyticsScreen';
import { useLibrary } from '../LibraryContext';
import { currentOrganizeTab, rememberOrganizeTab } from '../organize/OrganizeScreen';
import { currentPlanPart, rememberPlanPart } from '../plan/PlanPane';
import { currentReviewPart, rememberReviewPart } from '../review/ReviewPane';
import { openChapterAt } from '../write/pendingFind';
import { openTutorial } from './opener';

/** What Organize and Analytics are showing, or last showed. */
export function showing(): { organize: OrganizeTab; plan: PlanPart; review: ReviewPart; analytics: AnalyticsTab } {
  return { organize: currentOrganizeTab(), plan: currentPlanPart(), review: currentReviewPart(), analytics: currentAnalyticsTab() };
}

export function useGoTo(): (place: Place) => void {
  const lib = useLibrary();
  const router = useRouter();
  const here = usePathname();
  return useCallback(
    (place: Place) => {
      lib.saves.flush();
      switch (place.kind) {
        case 'route':
          if (place.path !== here) router.navigate(place.path as never);
          return;
        case 'organize':
          if (place.tab === 'plan' && place.part !== undefined) rememberPlanPart(place.part as PlanPart);
          if (place.tab === 'review' && place.part !== undefined) rememberReviewPart(place.part as ReviewPart);
          rememberOrganizeTab(place.tab);
          if (here !== '/organize') router.navigate('/organize' as never);
          return;
        case 'analytics':
          rememberAnalyticsTab(place.tab);
          if (here !== '/analytics') router.navigate('/analytics' as never);
          return;
        case 'tutorial':
          openTutorial();
          return;
        case 'chapter': {
          const novelId = lib.settings.read(openNovelSettingKey);
          if (typeof novelId === 'string') openChapterAt(lib, router, novelId, place.nodeId, place.find ?? null);
          return;
        }
      }
    },
    [lib, router, here],
  );
}
