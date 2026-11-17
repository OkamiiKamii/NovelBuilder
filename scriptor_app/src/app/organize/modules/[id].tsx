import { useLocalSearchParams } from 'expo-router';

import { ModuleScreen } from '../../../ui/organize/ModuleScreen';

/** One module's workspace: `?tool=<id>` opens a tool, `&record=<id>` a registry's record (modulePath); `?configure=1`
 * opens Configure (the manager's Configure button). */
export default function ModuleRoute() {
  const { id, tool, record, configure } = useLocalSearchParams<{ id: string; tool?: string; record?: string; configure?: string }>();
  return <ModuleScreen moduleId={id} toolId={tool ?? null} recordId={record ?? null} configure={configure === '1'} />;
}
