import '../json.dart';

/// The fields of the book's matter an author edits.
const matterFields = [
  'dedication',
  'epigraph',
  'epigraphSource',
  'copyright',
  'acknowledgements',
  'aboutAuthor',
  'sceneBreak',
];

/// The matter row after [changes], as the original app's `updateMatter` writes it: the stored row (every field kept,
/// known or not) or a new one, with only the named text fields changed and the scene-break mark at most 12 characters.
JsonMap matterWithChanges(
  JsonMap? stored, {
  required String projectId,
  required Map<String, String> changes,
  required num now,
  required String Function() newId,
}) {
  final was = <String, Object?>{
    'id': newId(),
    'dedication': '',
    'epigraph': '',
    'epigraphSource': '',
    'copyright': '',
    'acknowledgements': '',
    'aboutAuthor': '',
    'sceneBreak': '* * *',
    ...?stored,
  };
  final next = <String, Object?>{...was, 'projectId': projectId, 'updatedAt': now};
  for (final field in matterFields) {
    final value = changes[field];
    if (value != null) next[field] = field == 'sceneBreak' && value.length > 12 ? value.substring(0, 12) : value;
  }
  return next;
}
