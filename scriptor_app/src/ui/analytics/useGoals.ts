// Goals from a screen: every change one transaction through the GoalService (deadlines, tasks, word targets), a
// refusal said as it is. A port of ProgressActions.goals in flutter_app/lib/features/progress/progress_providers.dart.

import { useCallback, useMemo } from 'react';

import { type GoalChanges, GoalService } from '../../domain/analytics/goalChanges';
import { useLibrary } from '../LibraryContext';
import { useToast } from '../toast';

/** Makes a change to the open novel's goals; says why when it cannot be made. True when it was made. */
export function useGoals(novelId: string | null): (apply: (c: GoalChanges) => void) => boolean {
  const lib = useLibrary();
  const toast = useToast();
  const service = useMemo(() => new GoalService(lib.novels), [lib]);
  return useCallback(
    (apply: (c: GoalChanges) => void) => {
      if (novelId === null) return false;
      try {
        service.change(novelId, apply);
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), { error: true });
        return false;
      }
    },
    [service, novelId, toast],
  );
}
