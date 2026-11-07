import '../json.dart';
import '../json_record.dart';

/// What the author decided about a continuity or canon finding (the original app's `continuityResolutions`).
enum ReviewDecision {
  review('Needs review'),
  resolved('Resolved'),
  intentional('Intentional'),
  dismissed('Ignored');

  const ReviewDecision(this.label);
  final String label;

  /// A decision takes its finding off the open lists, except "needs review", which keeps it there, flagged.
  bool get closes => this != review;
}

/// A review item: the author's decision about a finding, kept under the finding's own key so it holds on every run.
/// Removing it brings the finding back. Nothing here changes prose or canon.
class ReviewItem extends JsonRecord {
  ReviewItem(super.raw);

  /// The key of the finding it answers.
  String get key => str(raw['key']);
  ReviewDecision get decision =>
      ReviewDecision.values.where((d) => d.name == raw['kind']).firstOrNull ?? ReviewDecision.review;

  /// Why, in the author's words ("Flashback sequence", "Disguise").
  String get note => str(raw['note']);

  /// What the finding said when it was decided, so the decision can be read if the text moves on.
  String get message => str(raw['message']);
  String? get nodeId => idOrNull(raw['nodeId']);
}
