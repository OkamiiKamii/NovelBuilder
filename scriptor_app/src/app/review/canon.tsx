import { useLocalSearchParams } from 'expo-router';

import { PlanPage } from '../../ui/plan/PlanPage';
import { CanonPane } from '../../ui/review/CanonPane';

/** Canon (FEATURES.md #314–#315): `?fact=<id>` opens that statement. */
export default function CanonRoute() {
  const { fact } = useLocalSearchParams<{ fact?: string }>();
  return (
    <PlanPage title="Canon" back="Back">
      <CanonPane factId={fact ?? null} />
    </PlanPage>
  );
}
