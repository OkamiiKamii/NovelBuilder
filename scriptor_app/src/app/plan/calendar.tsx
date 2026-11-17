import { CalendarPane } from '../../ui/plan/CalendarPane';
import { PlanPage } from '../../ui/plan/PlanPage';

/** The story calendar as a page of its own (`/plan/calendar`). */
export default function CalendarRoute() {
  return (
    <PlanPage title="Story calendar" back="Back">
      <CalendarPane heading={false} />
    </PlanPage>
  );
}
