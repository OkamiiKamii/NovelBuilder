import { PlanPage } from '../../ui/plan/PlanPage';
import { TeamPane } from '../../ui/collab/TeamPane';

/** Team and feedback (Review › Team and feedback in the Flutter app): review by file, the owner's side. */
export default function TeamRoute() {
  return (
    <PlanPage title="Team and feedback" back="/organize">
      <TeamPane />
    </PlanPage>
  );
}
