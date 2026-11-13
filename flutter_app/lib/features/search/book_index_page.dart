import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme/book_faces.dart';
import '../../core/format.dart';
import '../../shared/data/background.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/manuscript/outline.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/story_node.dart';
import '../../shared/domain/text/book_index.dart';
import '../characters/widgets/vault.dart';

/// THE INDEX, as the back of a printed book has one (`shared/domain/text/book_index.dart` makes it): every name in the
/// novel A to Z under its letter, a dotted leader to the chapters it is in, each chapter a press from the first place
/// the name is in it. Above, names written two ways ("Mimir" and "Mimmir"), side by side: perhaps a slip. A row of
/// letters jumps through it. It only reads.

/// Opens the index of [novelId], full screen. [onOpen] opens a chapter at a name (it closes what it must first).
Future<void> showBookIndex(
  BuildContext context, {
  required String novelId,
  required void Function(String nodeId, String term, int block) onOpen,
}) => Navigator.of(context, rootNavigator: true).push(
  MaterialPageRoute<void>(
    builder: (_) => BookIndexPage(novelId: novelId, onOpen: onOpen),
  ),
);

class BookIndexPage extends ConsumerStatefulWidget {
  const BookIndexPage({super.key, required this.novelId, required this.onOpen});
  final String novelId;
  final void Function(String nodeId, String term, int block) onOpen;

  @override
  ConsumerState<BookIndexPage> createState() => _BookIndexPageState();
}

class _BookIndexPageState extends ConsumerState<BookIndexPage> {
  BookIndex? _index;
  final _letters = <String, GlobalKey>{};

  @override
  void initState() {
    super.initState();
    final store = ref.read(novelStoreProvider);
    final nodes = [for (final r in store.rowsIn(widget.novelId, 'chapters')) StoryNode(r)];
    final order = [
      for (final n in readingOrder(nodes))
        if (isDocument(n.kind)) n.id,
    ];
    ref.read(runAsideProvider)(bookIndexJob(store.rawJsonIn(widget.novelId, 'chapterContents'), order)).then(
      (index) {
        if (mounted) setState(() => _index = index);
      },
      onError: (Object e, StackTrace s) =>
          FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'search')),
    );
  }

  static String _letterOf(String term) {
    final t = term.replaceFirst(RegExp(r'^The\s+'), '');
    return t.isEmpty ? '#' : t[0].toUpperCase();
  }

  void _open(IndexEntry e, IndexPlace p) {
    Navigator.of(context).pop();
    widget.onOpen(p.nodeId, e.term, p.block);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final index = _index;
    final title = ref.read(novelStoreProvider).novel(widget.novelId)?.title ?? '';
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Index', style: vaultHeading(context, size: 20, weight: 700)),
            if (title.isNotEmpty)
              Text(
                title,
                style: vaultText(context, size: 14, style: FontStyle.italic, color: scheme.onSurfaceVariant),
              ),
          ],
        ),
      ),
      body: index == null
          ? const Center(child: CircularProgressIndicator())
          : index.entries.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Text(
                  'No names yet. As your chapters name people and places, they gather here, A to Z.',
                  textAlign: TextAlign.center,
                  style: vaultText(context, size: 16, color: scheme.onSurfaceVariant),
                ),
              ),
            )
          : _body(context, index, scheme),
    );
  }

  Widget _body(BuildContext context, BookIndex index, ColorScheme scheme) {
    final groups = <String, List<IndexEntry>>{};
    for (final e in index.entries) {
      groups.putIfAbsent(_letterOf(e.term), () => []).add(e);
    }
    for (final l in groups.keys) {
      _letters.putIfAbsent(l, GlobalKey.new);
    }
    return Column(
      children: [
        // The letters, to jump through it.
        SizedBox(
          height: 48,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            children: [
              for (final l in groups.keys)
                TextButton(
                  style: TextButton.styleFrom(minimumSize: const Size(40, 48)),
                  onPressed: () {
                    final target = _letters[l]?.currentContext;
                    if (target != null) Scrollable.ensureVisible(target, duration: const Duration(milliseconds: 300));
                  },
                  child: Text(l, style: vaultHeading(context, size: 15, color: scheme.primary, weight: 700)),
                ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (index.lookAlikes.isNotEmpty) _LookAlikes(pairs: index.lookAlikes, onOpen: _open),
                Text(
                  '${plural(index.entries.length, 'name')} in your pages. Press a chapter to read the name there.',
                  style: vaultText(context, size: 14, color: scheme.onSurfaceVariant),
                ),
                for (final MapEntry(key: letter, value: entries) in groups.entries) ...[
                  Padding(
                    key: _letters[letter],
                    padding: const EdgeInsets.only(top: 18, bottom: 4),
                    child: Text(letter, style: vaultHeading(context, size: 22, color: scheme.primary, weight: 700)),
                  ),
                  for (final e in entries) _Line(entry: e, onOpen: (p) => _open(e, p)),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// One line of the index: the name, a leader of dots, the chapters (each a press).
class _Line extends StatelessWidget {
  const _Line({required this.entry, required this.onOpen});
  final IndexEntry entry;
  final void Function(IndexPlace) onOpen;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final face = BookFaces.of(context).text;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text(
            entry.term,
            style: TextStyle(fontFamily: face, fontSize: 17, color: scheme.onSurface),
          ),
          Text(
            '  ·  ${plural(entry.count, 'time')}  ',
            style: TextStyle(fontFamily: face, fontSize: 13, color: scheme.onSurfaceVariant),
          ),
          for (final (i, p) in entry.places.indexed)
            Semantics(
              button: true,
              label: '${entry.term} in chapter ${p.number}',
              excludeSemantics: true,
              child: InkWell(
                borderRadius: BorderRadius.circular(6),
                onTap: () => onOpen(p),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minWidth: 32, minHeight: 40),
                  // As wide as the number (and its room to press), not the whole line.
                  child: Align(
                    widthFactor: 1,
                    heightFactor: 1,
                    child: Text(
                      '${p.number}${i < entry.places.length - 1 ? ',' : ''}',
                      style: TextStyle(
                        fontFamily: face,
                        fontSize: 16,
                        color: scheme.primary,
                        decoration: TextDecoration.underline,
                        decorationColor: scheme.primary.withValues(alpha: 0.4),
                        fontFeatures: const [FontFeature.oldstyleFigures()],
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Names written two ways, side by side, each a press from where the rarer one is.
class _LookAlikes extends StatelessWidget {
  const _LookAlikes({required this.pairs, required this.onOpen});
  final List<LookAlike> pairs;
  final void Function(IndexEntry, IndexPlace) onOpen;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.errorContainer.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.error.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'SPELLED TWO WAYS?',
            style: vaultHeading(context, size: 11, color: scheme.error, weight: 700).copyWith(letterSpacing: 2),
          ),
          const SizedBox(height: 4),
          Text(
            'These names are a letter apart. If they are one name, one of them is a slip.',
            style: vaultText(context, size: 14, color: scheme.onSurface),
          ),
          for (final pair in pairs) ...[
            const SizedBox(height: 8),
            Builder(
              builder: (context) {
                // The rarer spelling is the likelier slip: its first place first.
                final (rare, common) = pair.a.count <= pair.b.count ? (pair.a, pair.b) : (pair.b, pair.a);
                return Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${rare.term} (${rare.count}) · ${common.term} (${common.count})',
                        style: vaultText(context, size: 16, color: scheme.onSurface),
                      ),
                    ),
                    TextButton(onPressed: () => onOpen(rare, rare.places.first), child: Text('See “${rare.term}”')),
                  ],
                );
              },
            ),
          ],
        ],
      ),
    );
  }
}
