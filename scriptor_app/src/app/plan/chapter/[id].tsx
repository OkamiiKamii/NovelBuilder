import { useLocalSearchParams } from 'expo-router';

import { ChapterPlanScreen } from '../../../ui/plan/ChapterPlanScreen';

/** A chapter's or scene's plan (chapterPlanPath). */
export default function ChapterPlanRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChapterPlanScreen nodeId={id} />;
}
