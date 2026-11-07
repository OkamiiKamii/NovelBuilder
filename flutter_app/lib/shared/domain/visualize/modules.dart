import 'views.dart';

/// VISUALIZATION MODULES. Each view is a module a novel can turn off and on. Turning one off hides it: its place in
/// the view picker, its page, and the links other pages make to it. It deletes nothing and changes no record: the
/// records a view shows belong to the core pages, which never depend on a view being on. What is turned off is a
/// setting of the novel (`viewsOff` on the project), so it travels with the novel.
///
/// Between views there is one dependency: Journeys draws its routes on the maps made in Places, so Places stays on
/// while Journeys is on.
class ViewModule {
  const ViewModule(this.key, this.reads, {this.editsHere, this.needs = const [], this.linkedFrom = const []});

  final String key;

  /// The core pages whose records it shows.
  final List<String> reads;

  /// Records added or changed only in this view. They are kept, and still checked, while it is off.
  final String? editsHere;

  /// Other views it needs on, and why.
  final List<({String key, String why})> needs;

  /// Pages that link to it. While it is off, those links are not offered.
  final List<String> linkedFrom;
}

const viewModules = [
  ViewModule(
    'timeline',
    ['Timeline', 'Characters', 'Codex', 'Plot threads', 'Manuscript'],
    linkedFrom: ['Continuity review'],
  ),
  ViewModule('order', ['Timeline', 'Manuscript'], linkedFrom: ['Timeline (an event’s chapters)']),
  ViewModule('relationships', ['Relationships', 'Characters', 'Codex'], linkedFrom: ['Continuity review']),
  ViewModule(
    'plot',
    ['Plot threads', 'Manuscript', 'Timeline'],
    linkedFrom: ['Plot threads', 'Scene board', 'Continuity review'],
  ),
  ViewModule(
    'structure',
    ['Manuscript', 'Organizer', 'Timeline'],
    editsHere: 'structural markers',
    linkedFrom: ['Record check'],
  ),
  ViewModule(
    'graph',
    ['Manuscript', 'Characters', 'Codex', 'Timeline', 'Plot threads', 'Relationships', 'Characters › Systems'],
    linkedFrom: ['Continuity review'],
  ),
  ViewModule('places', [
    'Codex',
    'Timeline',
    'Characters',
  ], editsHere: 'place levels, world maps and the places pinned on them'),
  ViewModule('progression', ['Character progression', 'Characters › Systems', 'Characters']),
  ViewModule(
    'history',
    ['Characters', 'Timeline', 'Relationships', 'Codex', 'Manuscript', 'Character progression'],
    linkedFrom: ['Characters (a profile’s life history)', 'Timeline (a character’s life)'],
  ),
  ViewModule('appearances', ['Manuscript', 'Characters', 'Timeline']),
  ViewModule(
    'knowledge',
    ['Characters (their Secrets tab)', 'Timeline', 'Manuscript'],
    linkedFrom: ['Characters (a secret)', 'Continuity review'],
  ),
  ViewModule('kinds', ['Codex', 'Timeline']),
  ViewModule(
    'abilities',
    ['Characters › Systems', 'Codex', 'Character progression'],
    linkedFrom: ['Continuity review'],
  ),
  ViewModule(
    'journeys',
    ['Codex', 'Characters', 'Timeline'],
    editsHere: 'journeys and the speeds of ways to travel',
    needs: [(key: 'places', why: 'its routes are drawn on the maps made in Places, at the places pinned there')],
    linkedFrom: ['Record check', 'Continuity review'],
  ),
  ViewModule('factions', ['Codex', 'Timeline', 'Characters']),
  ViewModule('ownership', ['Codex', 'Timeline', 'Characters']),
  ViewModule('charts', ['Manuscript', 'Characters', 'Plot threads', 'Timeline']),
];

ViewModule? moduleOf(String key) => viewModules.where((m) => m.key == key).firstOrNull;

/// Whether a view is on in a novel: every view is, unless the novel turned it off.
bool isViewOn(List<String> viewsOff, String key) => !viewsOff.contains(key);

/// The views that are on, in the order the workspace offers them.
List<VisualView> viewsOn(List<String> viewsOff) => [
  for (final v in visualViews)
    if (isViewOn(viewsOff, v.key)) v,
];

/// The views that need this one.
List<ViewModule> neededBy(String key) => [
  for (final m in viewModules)
    if (m.needs.any((n) => n.key == key)) m,
];

/// Turns views off. A view another view needs cannot go off while that view stays on: nothing changes, and it says
/// which and why. Turned off together (the dependent with it), they both go.
({List<String> off, List<({String key, List<({String key, String why})> by})> blocked}) turnOff(
  List<String> viewsOff,
  List<String> keys,
) {
  final next = {...viewsOff, ...keys};
  final blocked = [
    for (final key in keys)
      (
        key: key,
        by: [
          for (final m in neededBy(key))
            if (!next.contains(m.key)) (key: m.key, why: m.needs.firstWhere((n) => n.key == key).why),
        ],
      ),
  ].where((b) => b.by.isNotEmpty).toList();
  return blocked.isNotEmpty ? (off: [...viewsOff], blocked: blocked) : (off: next.toList()..sort(), blocked: blocked);
}

/// Turns a view on, and the views it needs, so it never opens without them.
({List<String> off, List<String> alsoOn}) turnOn(List<String> viewsOff, String key) {
  final on = <String>{};
  void visit(String k) {
    if (!on.add(k)) return;
    for (final need in moduleOf(k)?.needs ?? const <({String key, String why})>[]) {
      visit(need.key);
    }
  }

  visit(key);
  return (
    off: [
      for (final k in viewsOff)
        if (!on.contains(k)) k,
    ],
    alsoOn: [
      for (final k in on)
        if (k != key && viewsOff.contains(k)) k,
    ],
  );
}
