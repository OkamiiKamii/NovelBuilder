import { useLocalSearchParams } from 'expo-router';

import { KindsScreen } from '../../ui/organize/KindsScreen';

/** Categories & fields; `?kind=<key>` opens on that category. */
export default function KindsRoute() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  return <KindsScreen initial={kind ?? null} />;
}
