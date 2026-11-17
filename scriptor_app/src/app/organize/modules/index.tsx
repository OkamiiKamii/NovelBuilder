import { Redirect } from 'expo-router';

import { rememberOrganizeTab } from '../../../ui/organize/OrganizeScreen';

/** The module manager is Organize's Modules tab: `/organize/modules` (modulesPath, "All modules") opens it there. */
export default function ModulesRoute() {
  rememberOrganizeTab('modules');
  return <Redirect href="/organize" />;
}
