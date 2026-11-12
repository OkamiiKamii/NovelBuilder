import '../json.dart';
import '../records/category.dart';
import '../snapshot/novel_snapshot.dart';
import 'module_changes.dart';
import 'module_defs.dart';

/// A kind of record that gains fields, the fields, and the novel's own entries of that kind that gain them.
typedef TryOnGain = ({Category kind, List<String> fields, List<String> entries});

/// TRY IT ON: what turning a module on would change in one novel, worked out by turning it on in a copy that is never
/// saved (`ModuleChanges.enable`, the same change the press makes). The kinds of record the novel has now, the kinds
/// it would gain, the fields its own kinds would gain and whose entries they are ("James gains Power Rank"), the tools
/// it would open, and whether it offers an example system. Nothing is stored by working it out.
class ModuleTryOn {
  ModuleTryOn({
    required this.before,
    required this.added,
    required this.gains,
    required this.tools,
    required this.offersSystem,
  });

  /// The kinds of record the novel has now (those in use; one tucked away is left out).
  final List<Category> before;

  /// The kinds it would bring that the novel does not have.
  final List<Category> added;
  final List<TryOnGain> gains;

  /// Its tools: their kind (`registry`, `board`…) and their titles.
  final List<({String type, String title})> tools;
  final bool offersSystem;

  bool get changesNothing => added.isEmpty && gains.isEmpty && tools.isEmpty;
}

ModuleTryOn tryOnModule(NovelSnapshot snapshot, ModuleDefinition module) {
  var n = 0;
  String id() => 'try-on-${n++}';
  final now = ModuleChanges(snapshot, now: 0, createId: id);
  final before = [
    for (final c in now.categories())
      if (!c.archived) c,
  ];
  final dry = ModuleChanges(snapshot, now: 0, createId: id)..enable(module);
  final had = {for (final c in before) c.key: c};
  final added = <Category>[];
  final gains = <TryOnGain>[];
  final entries = snapshot.rows('loreEntries');
  for (final c in dry.categories()) {
    if (c.archived) continue;
    final was = had[c.key];
    if (was == null) {
      added.add(c);
      continue;
    }
    final known = {for (final f in was.fields) f.id};
    final fields = [
      for (final f in c.fields)
        if (!known.contains(f.id) && !f.archived) f.name,
    ];
    if (fields.isEmpty) continue;
    gains.add((
      kind: c,
      fields: fields,
      entries: [
        for (final e in entries)
          if (str(e['category']) == c.key && str(e['name']).trim().isNotEmpty) str(e['name']).trim(),
      ],
    ));
  }
  return ModuleTryOn(
    before: before,
    added: added,
    gains: gains,
    tools: [for (final t in module.tools) (type: str(t['type']), title: str(t['title']))],
    offersSystem: module.system != null,
  );
}
