import { useLocalSearchParams } from 'expo-router';

import { continuityTabOf } from '../../domain/continuity/screens/continuityPage';
import { PlanPage } from '../../ui/plan/PlanPage';
import { ContinuityPane } from '../../ui/review/ContinuityPane';

/** The continuity check (FEATURES.md #316–#317): `?tab=reviewed` or `?tab=tracked` opens that tab. */
export default function ContinuityRoute() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  return (
    <PlanPage title="Continuity" back="Back">
      <ContinuityPane tab={continuityTabOf(tab)} heading={false} />
    </PlanPage>
  );
}
