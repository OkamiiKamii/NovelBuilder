import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/data/background.dart';
import '../../../shared/domain/characters/looks.dart';
import '../../../shared/domain/characters/named_in.dart';
import '../../../shared/domain/characters/record_look.dart';
import '../../../shared/domain/records/story_node.dart';
import '../../../shared/domain/stable_sort.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import 'parts.dart';
import 'vault.dart';

/// CHECKED AGAINST YOUR PAGES on a character's profile (`looks.dart` reads the page): their eyes and hair as the
/// chapters give them, set beside what the profile records. A slip ("grey" here, "her blue eyes" in chapter 7) is
/// shown with the line, a press from the chapter and from putting the profile right; a look the page gives and the
/// profile does not is offered to record; agreement is shown in a line. Nothing changes until the author presses.
class AgainstYourPages extends ConsumerStatefulWidget {
  const AgainstYourPages({super.key, required this.cast, required this.entryId, required this.actions});

  final CastData cast;
  final String entryId;
  final CharacterActions actions;

  @override
  ConsumerState<AgainstYourPages> createState() => _AgainstYourPagesState();
}

class _AgainstYourPagesState extends ConsumerState<AgainstYourPages> {
  List<LookSighting>? _seen;
  Object? _readFor;

  void _read() {
    final cast = widget.cast;
    final model = cast.model;
    final chapters = stableSorted(
      model.nodes.values.where((n) => n.kind == NodeKind.chapter || n.kind == NodeKind.scene),
      (a, b) => (model.order.position[a.id] ?? 0) - (model.order.position[b.id] ?? 0),
    ).map((n) => n.id).toList();
    final all = namesToFind(cast.entries, cast.profiles);
    final names = all[widget.entryId] ?? const <String>[];
    final others = [
      for (final e in cast.entries)
        if (e.id != widget.entryId && e.category == 'character') ...?all[e.id],
    ];
    final key = (chapters.join(','), names.join('|'), others.length, cast.snapshot.rows('chapterContents').length);
    if (key == _readFor) return;
    _readFor = key;
    if (chapters.isEmpty || names.isEmpty) {
      setState(() => _seen = const []);
      return;
    }
    final stored = widget.actions.service.storedChapters(cast.novelId);
    ref.read(runAsideProvider)(looksJob(stored, chapters, names, others)).then(
      (seen) {
        if (mounted && _readFor == key) setState(() => _seen = seen);
      },
      onError: (Object e, StackTrace s) =>
          FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'characters')),
    );
  }

  /// What the profile records of each feature now.
  Map<Feature, String> _recorded() {
    final entry = widget.cast.entries.where((e) => e.id == widget.entryId).firstOrNull;
    if (entry == null) return const {};
    return {
      for (final f in Feature.values)
        f: entry.fields.where((x) => f.fieldNames.contains(x.key.trim().toLowerCase())).firstOrNull?.value ?? '',
    };
  }

  @override
  Widget build(BuildContext context) {
    // Read after the page is drawn, never while it is being built.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _read();
    });
    final seen = _seen;
    if (seen == null || seen.isEmpty) return const SizedBox.shrink();
    final checks = checkLooks(seen, _recorded());
    if (checks.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final slips = checks.where((c) => c.verdict == LookVerdict.differs).length;
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: ProfileBox(
        title: 'Checked against your pages',
        caption: slips == 0
            ? 'Their eyes and hair as your chapters describe them, beside what you recorded.'
            : '${slips == 1 ? 'One look' : '$slips looks'} in your chapters ${slips == 1 ? 'does' : 'do'} not match the profile.',
        children: [for (final c in checks) _row(context, scheme, c)],
      ),
    );
  }

  Widget _row(BuildContext context, ColorScheme scheme, LookCheck c) {
    final s = c.sightings.first;
    final chapter = documentName(widget.cast, s.nodeId);
    final colour = recordAs(c.family).toLowerCase();
    final (icon, tint, line) = switch (c.verdict) {
      LookVerdict.differs => (
        Icons.error_outline,
        scheme.error,
        '${c.feature.label}: the profile says ${c.recorded}; $chapter says “${s.said}”.',
      ),
      LookVerdict.unrecorded => (
        Icons.auto_awesome_outlined,
        scheme.primary,
        '${c.feature.label}: $chapter says “${s.said}”. Not in the profile yet.',
      ),
      LookVerdict.agrees => (
        Icons.check_circle_outline,
        scheme.tertiary,
        '${c.feature.label}: ${c.recorded}, as your pages have it'
            '${c.sightings.length > 1 ? ' (${c.sightings.length} times)' : ''}.',
      ),
    };
    void record() => widget.actions.now((x) => recordLook(x, widget.entryId, c.feature, recordAs(c.family)));
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Icon(icon, size: 20, color: tint),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(line, style: vaultText(context, size: 16, color: scheme.onSurface)),
              ),
            ],
          ),
          if (c.verdict != LookVerdict.agrees)
            Padding(
              padding: const EdgeInsets.only(left: 26),
              child: Wrap(
                spacing: 4,
                children: [
                  TextButton(
                    onPressed: () => widget.actions.openChapterAt(s.nodeId, s.said, s.block),
                    child: Text('Read it in $chapter'),
                  ),
                  TextButton(
                    onPressed: record,
                    child: Text(c.verdict == LookVerdict.differs ? 'Make it $colour' : 'Record $colour'),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
