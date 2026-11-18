import { PlanPage } from '../../ui/plan/PlanPage';
import { WarningsPane } from '../../ui/review/WarningsPane';
import { useOpenNovelTitle } from '../../ui/review/useReview';

/** All warnings (FEATURES.md #306–#309): every check's findings in one list, worked through one at a time. */
export default function ReviewRoute() {
  const title = useOpenNovelTitle();
  return (
    <PlanPage title="Continuity review" subtitle={title} back="Back">
      <WarningsPane />
    </PlanPage>
  );
}
