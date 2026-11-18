import { PlanPage } from '../../ui/plan/PlanPage';
import { RecordCheckPane } from '../../ui/review/RecordCheckPane';

/** Record check (FEATURES.md #310–#311): how the records point at one another, and the fixes offered. */
export default function RecordCheckRoute() {
  return (
    <PlanPage title="Record check" back="Back">
      <RecordCheckPane />
    </PlanPage>
  );
}
