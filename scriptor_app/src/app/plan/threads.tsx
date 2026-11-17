import { Redirect } from 'expo-router';

import { rememberOrganizeTab } from '../../ui/organize/OrganizeScreen';
import { rememberPlanPart } from '../../ui/plan/PlanPane';

/** `/plan/threads` (threadsPath) opens Organize's Plan tab on the plot threads. */
export default function PlanRoute() {
  rememberOrganizeTab('plan');
  rememberPlanPart('threads');
  return <Redirect href="/organize" />;
}
