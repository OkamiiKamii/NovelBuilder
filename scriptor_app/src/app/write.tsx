import { ComingSoon } from '../ui/ComingSoon';

export default function Write() {
  return (
    <ComingSoon
      icon="feather"
      title="Write"
      phase="Phase 3"
      holds={[
        'The chapters and parts of your book, and the editor with autosave and crash recovery',
        'Find and replace, version history, alternate drafts',
        'The writing desk: focus mode, margin notes, red pencil, voices, read aloud',
        'Goals, sprints and the day book',
      ]}
    />
  );
}
