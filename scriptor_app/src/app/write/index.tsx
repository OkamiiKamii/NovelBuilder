import { ReviewWorkspace } from '../../ui/collab/ReviewWorkspace';
import { useReviewMark } from '../../ui/collab/useCollab';
import { WriteScreen } from '../../ui/write/WriteScreen';

/** Write: the chapter editor; in a review copy, the review workspace instead (the copy's book is never edited). */
export default function WriteRoute() {
  const mark = useReviewMark();
  return mark !== null ? <ReviewWorkspace mark={mark} /> : <WriteScreen />;
}
