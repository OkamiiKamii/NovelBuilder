import { useLocalSearchParams } from 'expo-router';

import { HistoriesPane } from '../../ui/plan/HistoriesPane';
import { PlanPage } from '../../ui/plan/PlanPage';

/** The alternate histories as a page of their own; `?history=<id>` opens that one (historiesPath). */
export default function HistoriesRoute() {
  const { history } = useLocalSearchParams<{ history?: string }>();
  return (
    <PlanPage title="Alternate histories" back="Back">
      <HistoriesPane historyId={history ?? null} heading={false} />
    </PlanPage>
  );
}
