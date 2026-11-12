import 'dart:convert';

import '../../shared/domain/consequences/consequences.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/progression/snapshots.dart' show ProgressSnapshot;
import '../../shared/domain/records/story_node.dart';
import '../../shared/domain/records/system.dart';

/// What "What depends on this" reads of a novel.
const consequenceCollections = {
  'chapters',
  'chapterContents',
  'chapterPlans',
  'loreEntries',
  'characterRelations',
  'plotThreads',
  'timelineEvents',
  'canonFacts',
  'continuityRules',
  'progressSnapshots',
  'systems',
};

/// The novel as the analysis reads it, from its records (each collection's, in their stored order).
World worldFromRows(List<JsonMap> Function(String collection) rows) => World(
  nodes: [for (final r in rows('chapters')) StoryNode(r)],
  docs: {for (final r in rows('chapterContents')) str(r['id']): r['doc']},
  plans: rows('chapterPlans'),
  entries: rows('loreEntries'),
  relations: rows('characterRelations'),
  threads: rows('plotThreads'),
  events: rows('timelineEvents'),
  facts: rows('canonFacts'),
  rules: rows('continuityRules'),
  snapshots: [for (final r in rows('progressSnapshots')) ProgressSnapshot(r)],
  systems: [for (final r in rows('systems')) SystemBlueprint(r)],
);

/// The analysis as a job for an isolate (`background.dart`): from the records as stored ([stored]: JSON text by
/// collection, as `NovelStore.rawJsonIn` reads them), decoded there as `NovelStore.loadPart` decodes them, so it is the
/// same novel the page would read. Made at the top level and holding only plain data, so it can be sent: a closure made
/// in the page would hold the page, and the database with it.
Report Function() consequencesJob({
  required Map<String, List<String>> stored,
  required Subject subject,
  required List<String> include,
  required List<String> exclude,
}) => () {
  final decoded = {
    for (final MapEntry(:key, :value) in stored.entries) key: [for (final j in value) jsonDecode(j) as JsonMap],
  };
  return analyze(worldFromRows((c) => decoded[c] ?? const []), subject, include: include, exclude: exclude);
};
