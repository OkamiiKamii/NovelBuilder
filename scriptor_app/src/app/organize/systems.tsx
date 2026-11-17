import { useLocalSearchParams } from 'expo-router';

import { SystemScreen } from '../../ui/systems/SystemScreen';

/** A system's page (systemsPath): `?system=<id>` the system shown, `&tab=<tab>` a blueprint tab, `&sheet=<id>` a sheet. */
export default function SystemsRoute() {
  const { system, tab, sheet } = useLocalSearchParams<{ system?: string; tab?: string; sheet?: string }>();
  return <SystemScreen systemId={system ?? null} tab={tab ?? null} sheetId={sheet ?? null} />;
}
