import { PlanPage } from '../../ui/plan/PlanPage';
import { TimelineReviewPane, useTimelineReviewSubtitle } from '../../ui/review/TimelineReviewPane';

/** Timeline review (FEATURES.md #313): what the timeline's own records do not agree on. */
export default function TimelineReviewRoute() {
  const subtitle = useTimelineReviewSubtitle();
  return (
    <PlanPage title="Timeline review" subtitle={subtitle} back="Back">
      <TimelineReviewPane />
    </PlanPage>
  );
}
