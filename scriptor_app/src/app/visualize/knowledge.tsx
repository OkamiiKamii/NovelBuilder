import { useLocalSearchParams } from 'expo-router';

import { KnowledgeView } from '../../ui/review/KnowledgeView';

/** Secrets and knowledge (FEATURES.md #319): `?secret=<id>` opens that secret. */
export default function KnowledgeRoute() {
  const { secret } = useLocalSearchParams<{ secret?: string }>();
  return <KnowledgeView secretId={secret ?? null} />;
}
