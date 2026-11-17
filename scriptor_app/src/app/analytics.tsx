import { ComingSoon } from '../ui/ComingSoon';

export default function Analytics() {
  return (
    <ComingSoon
      icon="chart-bar"
      title="Analytics"
      phase="later phases"
      holds={[
        'Writing progress: words today and this week, streaks, deadlines',
        'Analytics and charts of your book',
        'Review: continuity, canon, timeline and proofreading checks',
        'The keepsakes made from your book',
      ]}
    />
  );
}
