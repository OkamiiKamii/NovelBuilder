/// WRITE THEM IN: from a character to the page. Where a scene with them can go (a chapter still blank, a new chapter at
/// the end, a new scene in the latest chapter), and the sparks to start it from, made of what the author has already
/// written about them: what they want, what is in the way, what they could lose, the people they are tied to. Plain
/// prompts in the author's own words, never prose put in their mouth; with nothing written about them yet, a few that
/// fit anyone.
library;

import 'stakes.dart';

/// A spark for a scene: what it comes from, and the note it leaves in the chapter's plan.
typedef SceneSpark = ({String from, String text});

/// Where the scene goes: into a chapter that is still blank, a new chapter at the end, or a new scene in a chapter.
enum PlaceKind { blank, newChapter, newScene }

/// A place for the scene: its kind, the chapter it is in or after (null for a new chapter in an empty book), and how it
/// is said.
typedef ScenePlace = ({PlaceKind kind, String? nodeId, String label});

/// A chapter or scene, as far as placing a scene needs: its id, kind ("chapter" or "scene"), parent, title, words, and
/// whether it has a plan with an objective.
typedef PlaceNode = ({String id, String kind, String? parentId, String title, int words, bool planned});

/// The sparks for a scene with [name], from their [stakes] and their [ties] (each the other's name and what they are to
/// them), the strongest first; with nothing written about them, the ones that fit anyone.
List<SceneSpark> sparksFor(String name, Map<Stake, String> stakes, List<({String other, String tie})> ties) {
  String quoted(String s) {
    final t = s.trim().replaceAll(RegExp(r'\s+'), ' ');
    final short = t.length > 140 ? '${t.substring(0, t.lastIndexOf(' ', 140).clamp(60, 140))}…' : t;
    return '“$short”';
  }

  return [
    if (stakes[Stake.wants] case final w? when w.trim().isNotEmpty)
      (from: 'What they want', text: '$name goes after what they want: ${quoted(w)}'),
    if (stakes[Stake.inTheWay] case final w? when w.trim().isNotEmpty)
      (from: 'What is in the way', text: 'What stands in $name’s way shows itself: ${quoted(w)}'),
    if (stakes[Stake.atStake] case final w? when w.trim().isNotEmpty)
      (from: 'What they could lose', text: '$name comes close to losing it: ${quoted(w)}'),
    for (final t in ties.take(2))
      (
        from: 'A tie',
        text: t.tie.trim().isEmpty
            ? '$name and ${t.other}, in the same room, wanting different things.'
            : '$name and ${t.other} (${t.tie.trim()}), in the same room, wanting different things.',
      ),
    // These fit anyone, and are always there to choose.
    (from: 'Anyone', text: '$name doing what they do best, and it goes wrong.'),
    (from: 'Anyone', text: '$name wants something small and urgent, right now.'),
    (from: 'Anyone', text: 'Someone sees $name for the first time.'),
  ];
}

/// Where a scene can go in the book, from its chapters and scenes in reading order ([nodes]); the best first. A blank
/// chapter with no plan comes first (the latest one), so a book that has only its empty first chapter starts there.
List<ScenePlace> placesFor(List<PlaceNode> nodes) {
  final chapters = [
    for (final n in nodes)
      if (n.kind == 'chapter') n,
  ];
  final blank = chapters.lastWhere(
    (c) => c.words == 0 && !c.planned && !nodes.any((n) => n.parentId == c.id),
    orElse: () => (id: '', kind: '', parentId: null, title: '', words: 0, planned: false),
  );
  final last = chapters.lastOrNull;
  String name(PlaceNode n) => n.title.trim().isEmpty ? 'the untitled chapter' : n.title.trim();
  return [
    if (blank.id.isNotEmpty) (kind: PlaceKind.blank, nodeId: blank.id, label: 'In ${name(blank)}, still blank'),
    (kind: PlaceKind.newChapter, nodeId: last?.id, label: 'A new chapter at the end of the book'),
    if (last != null && last.id != blank.id)
      (kind: PlaceKind.newScene, nodeId: last.id, label: 'A new scene in ${name(last)}'),
  ];
}
