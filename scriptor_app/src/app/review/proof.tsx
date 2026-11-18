import { PlanPage } from '../../ui/plan/PlanPage';
import { ProofPane } from '../../ui/review/ProofPane';

/** Proofreading (FEATURES.md #318): every slip a proofreader would mark, each read where it is. */
export default function ProofRoute() {
  return (
    <PlanPage title="Before a reader sees it" back="Back">
      <ProofPane heading={false} />
    </PlanPage>
  );
}
