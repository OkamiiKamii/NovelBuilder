import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/destinations.dart';
import '../../../core/widgets/toast.dart';
import '../../../shared/data/background.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/characters/dramatis.dart';
import '../../../shared/domain/characters/entrances.dart';
import '../../../shared/domain/characters/named_in.dart';
import '../../../shared/domain/json.dart';
import '../../../shared/domain/manuscript/outline.dart';
import '../../../shared/domain/model/story_order.dart';
import '../../../shared/domain/reader/book.dart';
import '../../../shared/domain/records/story_node.dart';
import '../../reader/reader_providers.dart';
import '../characters_providers.dart';
import 'vault.dart';

/// Opens the cast list for the book, made from [cast].
Future<void> showDramatis(BuildContext context, CastData cast) => Navigator.of(
  context,
).push(MaterialPageRoute<void>(fullscreenDialog: true, builder: (_) => DramatisPage(cast: cast)));

/// THE DRAMATIS PERSONAE for the book (`dramatis.dart` makes it): the cast list that epic and ensemble novels print
/// before the story, made from the cast and shown as it will be printed, on a page. Grouped by faction, by the part
/// each plays, or as one list; in the order the reader meets them (`entrances.dart`) or by name; only those on the
/// page, or the whole cast. **Put it in the book** keeps it with the book's matter, so the reader, the PDF and the
/// ebook print it before chapter one (and Book details edits it); **Copy** takes the text. Nothing is put in the book
/// until it is pressed, and a list already there is not replaced without asking.
class DramatisPage extends ConsumerStatefulWidget {
  const DramatisPage({super.key, required this.cast});

  final CastData cast;

  @override
  ConsumerState<DramatisPage> createState() => _DramatisPageState();
}

class _DramatisPageState extends ConsumerState<DramatisPage> {
  /// Each one's place in the order of appearance, once read.
  Map<String, int>? _appearance;
  CastGrouping? _by;
  CastOrder _order = CastOrder.appearance;
  bool? _onlyOnPage;

  @override
  void initState() {
    super.initState();
    final store = ref.read(novelStoreProvider);
    final novelId = widget.cast.novelId;
    final nodes = [
      for (final n in readingOrder([for (final r in store.rowsIn(novelId, 'chapters')) StoryNode(r)]))
        if (isDocument(n.kind)) n,
    ];
    final names = namesToFind(widget.cast.entries, widget.cast.profiles);
    final people = [
      for (final l in widget.cast.list)
        if (!l.profile.archived && (names[l.entry.id] ?? const []).isNotEmpty)
          (id: l.entry.id, names: names[l.entry.id]!),
    ];
    ref
        .read(runAsideProvider)(
          entrancesJob(store.rawJsonIn(novelId, 'chapterContents'), [for (final n in nodes) n.id], people),
        )
        .then(
          (read) {
            if (!mounted) return;
            setState(() {
              _appearance = {for (final (i, e) in read.order.where((e) => e.onStage).indexed) e.id: i};
            });
          },
          onError: (Object e, StackTrace s) =>
              FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'characters')),
        );
  }

  List<DramatisPerson> get _people => [
    for (final l in widget.cast.list)
      if (!l.profile.archived)
        (
          id: l.entry.id,
          name: l.entry.name,
          about: aboutOf(
            epithet: l.profile.epithet,
            summary: l.entry.summary,
            occupation: fieldNamed(l.entry, 'Occupation'),
          ),
          factions: l.factions,
          roles: l.profile.roles,
        ),
  ];

  BookMatter get _matter {
    final rows = [...ref.read(novelStoreProvider).rowsIn(widget.cast.novelId, 'bookMatter')]
      ..sort((a, b) => str(a['id']).compareTo(str(b['id'])));
    return rows.isEmpty ? BookMatter.empty : BookMatter(rows.first);
  }

  Future<void> _putInBook(String text) async {
    final had = _matter.castList.trim();
    if (had.isNotEmpty && had != text.trim()) {
      final replace = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Replace the cast list in the book?'),
          content: const Text(
            'The book already has a cast list, perhaps one you have written in yourself. This one would take its '
            'place.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Keep the one there')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Replace it')),
          ],
        ),
      );
      if (replace != true || !mounted) return;
    }
    final novelId = widget.cast.novelId;
    ref.read(matterActionsProvider).set(novelId, 'castList', text);
    // Written at once, not a moment later, so the book has it when it is opened from the message below.
    ref.read(saveControllerProvider).flush();
    if (!mounted) return;
    setState(() {});
    final router = GoRouter.of(context);
    showToast(
      context,
      'In the book, before chapter one. Book details can change it.',
      actionLabel: 'Read the book',
      onAction: () {
        Navigator.of(context).maybePop();
        router.go('${Destination.write.path}/read');
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final appearance = _appearance;
    final people = _people;
    final hasFactions = people.any((p) => p.factions.any((f) => f.trim().isNotEmpty));
    final by = _by ?? (hasFactions ? CastGrouping.faction : CastGrouping.role);
    // Before the pages are read, or when no one is on a page yet, the whole cast.
    final onPage = appearance?.length ?? 0;
    final onlyOnPage = (_onlyOnPage ?? true) && onPage > 0;
    final text = appearance == null
        ? ''
        : composeDramatis(people, by: by, order: _order, appearance: appearance, onlyOnPage: onlyOnPage);
    final matter = _matter;
    final inBook = matter.castList.trim();
    final same = inBook.isNotEmpty && inBook == text.trim();

    final options = Wrap(
      spacing: 12,
      runSpacing: 12,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        SegmentedButton<CastGrouping>(
          segments: [for (final g in CastGrouping.values) ButtonSegment(value: g, label: Text(g.label))],
          selected: {by},
          showSelectedIcon: false,
          onSelectionChanged: (v) => setState(() => _by = v.first),
        ),
        // With no one on a page there is no order of appearance: by name is the only order.
        if (onPage > 0)
          SegmentedButton<CastOrder>(
            segments: [for (final o in CastOrder.values) ButtonSegment(value: o, label: Text(o.label))],
            selected: {_order},
            showSelectedIcon: false,
            onSelectionChanged: (v) => setState(() => _order = v.first),
          ),
        if (onPage > 0)
          FilterChip(
            label: Text('Only those on the page ($onPage)'),
            selected: onlyOnPage,
            onSelected: (v) => setState(() => _onlyOnPage = v),
          ),
      ],
    );

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dramatis personae'),
        actions: [
          IconButton(
            tooltip: 'Copy',
            onPressed: text.isEmpty
                ? null
                : () {
                    Clipboard.setData(ClipboardData(text: '${matter.castTitle}\n\n$text'));
                    showToast(context, 'The cast list is copied.');
                  },
            icon: const Icon(Icons.copy_outlined),
          ),
        ],
      ),
      body: appearance == null
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 720),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'The cast list a reader turns back to, printed before chapter one: made from your cast, '
                        'who each one is in a phrase a reader may know from the start (the title they go by, the '
                        'first line of their summary, or their trade). Never their fate or their secrets.',
                        style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
                      ),
                      const SizedBox(height: 14),
                      options,
                      if (onPage == 0)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            'No one is on the page yet, so the whole cast is listed, by name.',
                            style: vaultText(context, size: 13.5, color: scheme.onSurfaceVariant),
                          ),
                        ),
                      const SizedBox(height: 18),
                      CastListPage(title: matter.castTitle, text: text),
                      const SizedBox(height: 18),
                      if (text.isEmpty)
                        Text(
                          'No one to list yet.',
                          textAlign: TextAlign.center,
                          style: vaultText(context, size: 15, color: scheme.onSurfaceVariant),
                        )
                      else if (same)
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.check_circle_outline, color: scheme.primary),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Text(
                                'This is the cast list in the book.',
                                style: vaultText(context, size: 15, color: scheme.onSurface),
                              ),
                            ),
                          ],
                        )
                      else
                        Center(
                          child: FilledButton.icon(
                            onPressed: () => _putInBook(text),
                            icon: const Icon(Icons.menu_book_outlined),
                            label: Text(inBook.isEmpty ? 'Put it in the book' : 'Put this one in the book'),
                          ),
                        ),
                      if (inBook.isNotEmpty && !same)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            'The book has a cast list already; this one would replace it.',
                            textAlign: TextAlign.center,
                            style: vaultText(context, size: 13.5, color: scheme.onSurfaceVariant),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
    );
  }
}

/// A cast list as it will be printed: on a page of paper, the title in capitals over an ornament, each group's name in
/// small capitals, each name in bold and who they are after it.
class CastListPage extends StatelessWidget {
  const CastListPage({super.key, required this.title, required this.text});

  final String title;
  final String text;

  static const _paper = Color(0xFFF8F3E6);
  static const _ink = Color(0xFF2A2420);
  static const _faint = Color(0xFF7A6E62);

  @override
  Widget build(BuildContext context) {
    const face = TextStyle(fontFamily: vaultTextFont, color: _ink, height: 1.35);
    final lines = castLines(text);
    return Container(
      padding: const EdgeInsets.fromLTRB(28, 32, 28, 36),
      decoration: BoxDecoration(
        color: _paper,
        borderRadius: BorderRadius.circular(4),
        boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 14, offset: Offset(0, 6))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title.toUpperCase(),
            textAlign: TextAlign.center,
            style: face.copyWith(fontSize: 21, letterSpacing: 3.2, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          // A rule each side of a small diamond, drawn so no face is needed for it.
          ExcludeSemantics(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(width: 44, height: 1, color: _faint),
                const SizedBox(width: 8),
                Transform.rotate(angle: 0.785398, child: Container(width: 6, height: 6, color: _faint)),
                const SizedBox(width: 8),
                Container(width: 44, height: 1, color: _faint),
              ],
            ),
          ),
          const SizedBox(height: 16),
          for (final (i, l) in lines.indexed)
            if (l.group)
              Padding(
                padding: EdgeInsets.only(top: i == 0 ? 0 : 18, bottom: 6),
                child: Text(
                  l.name.toUpperCase(),
                  textAlign: TextAlign.center,
                  style: face.copyWith(fontSize: 13, letterSpacing: 2, color: _faint),
                ),
              )
            else
              Padding(
                padding: const EdgeInsets.only(bottom: 5),
                child: Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: l.name,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      if (l.about.isNotEmpty) TextSpan(text: ' — ${l.about}'),
                    ],
                  ),
                  style: face.copyWith(fontSize: 16.5),
                ),
              ),
        ],
      ),
    );
  }
}
