import { useLocalSearchParams } from 'expo-router';

import { BoardPane } from '../../ui/plan/BoardPane';
import { PlanPage } from '../../ui/plan/PlanPage';

/** The scene board as a page of its own; `?thread=<id>` shows where that thread is recorded (boardPath). */
export default function BoardRoute() {
  const { thread } = useLocalSearchParams<{ thread?: string }>();
  return (
    <PlanPage title="Scene board" back="Back">
      <BoardPane threadId={thread ?? null} />
    </PlanPage>
  );
}
