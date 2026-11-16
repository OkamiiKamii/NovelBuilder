import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/data/background.dart';
import '../../../shared/domain/characters/named_in.dart';
import '../../../shared/domain/stable_sort.dart';
import '../character_actions.dart';
import '../characters_providers.dart';
import 'kept_reader.dart';
import 'parts.dart';
import 'vault.dart';

/// IN THEIR PAGES: what the book says where someone (or somewhere, or something) is in it. For every chapter or scene
/// they are named or linked in, in reading order, the sentence their name first appears in, set as a quotation in the
/// book's italic with the name picked out, under the chapter's name. A press opens that chapter with the name found
/// and selected, so the passage is one press from being read or worked on.
///
/// Read from the saved text away from the screen (`sightingsJob`), when the page opens and when the cast changes.
/// It only reads: nothing is linked or written.
class InTheirPages extends ConsumerStatefulWidget {
  const InTheirPages({
    super.key,
    required this.cast,
    required this.entryId,
    required this.actions,
    this.title = 'In their pages',
  });

  final CastData cast;
  final String entryId;
  final CharacterActions actions;
  final String title;

  @override
  ConsumerState<InTheirPages> createState() => _InTheirPagesState();
}

/// How many passages are shown before "Show all".
const passagesShown = 6;

class _InTheirPagesState extends ConsumerState<InTheirPages> with KeptReader<InTheirPages, List<Sighting>> {
  bool _all = false;

  /// Where the entry is in the book, in reading order: linked there, or named.
  List<String> _where() {
    final model = widget.cast.model;
    final linked = [
      for (final n in model.nodes.values)
        if (n.mentions.contains(widget.entryId)) n.id,
    ];
    final ids = {...linked, ...?widget.cast.named[widget.entryId]}.where(model.order.position.containsKey);
    return stableSorted(ids, (a, b) => model.order.position[a]! - model.order.position[b]!);
  }

  /// Where they are and the names they go by: worked out once a cast.
  ({CastData cast, List<String> where, List<String> names})? _from;

  ({CastData cast, List<String> where, List<String> names}) _inputs() {
    if (_from case final from? when identical(from.cast, widget.cast)) return from;
    return _from = (
      cast: widget.cast,
      where: _where(),
      names: widget.cast.findNames[widget.entryId] ?? const <String>[],
    );
  }

  @override
  String get readingNovelId => widget.cast.novelId;

  @override
  List<Sighting> get nothingRead => const [];

  @override
  Object? readingInputs() {
    final from = _inputs();
    if (from.where.isEmpty || from.names.isEmpty) return null;
    return ('sightings', widget.cast.novelId, from.where.join(','), from.names.join('|'));
  }

  @override
  Future<List<Sighting>> runReading(RunAside run) {
    final from = _inputs();
    return run(sightingsJob(widget.actions.service.storedChapters(widget.cast.novelId), from.where, from.names));
  }

  @override
  Widget build(BuildContext context) {
    // A reading kept at once; else read after the page is drawn, never while it is being built.
    keepReading();
    final found = reading;
    if (found == null || found.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final shown = _all ? found : found.take(passagesShown).toList();
    // Its own space above, so where it shows nothing it leaves no gap.
    return Padding(padding: const EdgeInsets.only(top: 12), child: _box(context, found, shown, scheme));
  }

  Widget _box(BuildContext context, List<Sighting> found, List<Sighting> shown, ColorScheme scheme) {
    return ProfileBox(
      title: widget.title,
      caption: 'Where the name first comes in each chapter. Press one to read it there.',
      children: [
        for (final s in shown)
          InkWell(
            borderRadius: BorderRadius.circular(6),
            onTap: () => widget.actions.openChapterAt(s.nodeId, s.name, s.block),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // A quotation's rule down its edge, as long as the quotation, in the cast's ink.
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.only(left: 12),
                      decoration: BoxDecoration(
                        border: Border(left: BorderSide(color: scheme.primary, width: 2)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            documentName(widget.cast, s.nodeId),
                            style: vaultHeading(context, size: 12, weight: 700, color: scheme.primary),
                          ),
                          const SizedBox(height: 2),
                          Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(text: '“${s.before}'),
                                TextSpan(
                                  text: s.name,
                                  style: TextStyle(fontWeight: FontWeight.w700, color: scheme.onSurface),
                                ),
                                TextSpan(text: '${s.after}”'),
                              ],
                            ),
                            maxLines: 5,
                            overflow: TextOverflow.ellipsis,
                            style: vaultText(
                              context,
                              size: 16,
                              style: FontStyle.italic,
                              color: scheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Icon(Icons.chevron_right, size: 18, color: scheme.primary),
                ],
              ),
            ),
          ),
        if (found.length > passagesShown)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () => setState(() => _all = !_all),
              child: Text(_all ? 'Show fewer' : 'Show all ${found.length}'),
            ),
          ),
      ],
    );
  }
}
