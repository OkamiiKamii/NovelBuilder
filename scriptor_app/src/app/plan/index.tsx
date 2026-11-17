import { Redirect } from 'expo-router';

import { rememberOrganizeTab } from '../../ui/organize/OrganizeScreen';
import { rememberPlanPart } from '../../ui/plan/PlanPane';

/** Plan is Organize's Plan tab: `/plan` (the Flutter app's timeline page) opens it on the timeline. */
export default function PlanRoute() {
  rememberOrganizeTab('plan');
  rememberPlanPart('timeline');
  return <Redirect href="/organize" />;
}
