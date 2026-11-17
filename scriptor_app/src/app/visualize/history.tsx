import { useLocalSearchParams } from 'expo-router';

import { HistoryView } from '../../ui/visualize/HistoryView';

/** Visualize › Character history: `?who=<id>` names whose (historyPath). */
export default function HistoryRoute() {
  const { who } = useLocalSearchParams<{ who?: string }>();
  return <HistoryView who={who ?? null} />;
}
