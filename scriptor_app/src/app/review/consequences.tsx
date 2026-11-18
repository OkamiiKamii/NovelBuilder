import { useLocalSearchParams } from 'expo-router';

import { PlanPage } from '../../ui/plan/PlanPage';
import { ConsequencesPane } from '../../ui/review/ConsequencesPane';

/** What depends on this (FEATURES.md #320): `?node=`, `?event=` or `?thread=&beat=` is the point (consequencesPath). */
export default function ConsequencesRoute() {
  const { node, event, thread, beat } = useLocalSearchParams<{ node?: string; event?: string; thread?: string; beat?: string }>();
  return (
    <PlanPage title="What depends on this" back="Back">
      <ConsequencesPane
        key={`${node ?? ''}|${event ?? ''}|${thread ?? ''}|${beat ?? ''}`}
        start={{ nodeId: node ?? null, eventId: event ?? null, threadId: thread ?? null, beatId: beat ?? null }}
      />
    </PlanPage>
  );
}
