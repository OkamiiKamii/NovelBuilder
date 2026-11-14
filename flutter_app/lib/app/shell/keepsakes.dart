import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/characters/widgets/vault.dart';
import '../../shared/data/providers.dart';

/// THE KEEPSAKES: everything a book can be made into, under More. One list (`keepsakesOf`), shown two ways: a row of
/// tiles under the card of the day, the ones not yet opened first; and **the shelf**, all of them at once as objects
/// on wooden shelves. A keepsake not yet opened wears a gold ribbon, NEW, until it is; the row's heading says how many
/// are left. What has been opened is remembered on this device (`keepsakes.opened`), for every book.

/// The setting that holds the keepsakes opened (their ids).
const keepsakesOpenedSettingKey = 'keepsakes.opened';

/// A keepsake: its id (what is remembered once it is opened), the capitals at its head, its line, what a screen reader
/// says, its icon and colours, black bars (a film) or threads of colour (the print) on its tile, and how it opens.
typedef Keepsake = ({
  String id,
  String kicker,
  String line,
  String label,
  IconData icon,
  List<Color> colours,
  bool bars,
  bool stripes,
  VoidCallback open,
});

/// Every keepsake of the book called [title], in their order; each opens with the call given for it.
List<Keepsake> keepsakesOf({
  required String title,
  required VoidCallback gazette,
  required VoidCallback quiz,
  required VoidCallback postcards,
  required VoidCallback trailer,
  required VoidCallback lines,
  required VoidCallback sampler,
  required VoidCallback story,
  required VoidCallback print,
  required VoidCallback jacket,
}) {
  final book = title.trim().isEmpty ? 'your novel' : title.trim();
  Keepsake k(
    String id,
    String kicker,
    String line,
    String label,
    IconData icon,
    List<Color> colours,
    VoidCallback open, {
    bool bars = false,
    bool stripes = false,
  }) => (
    id: id,
    kicker: kicker,
    line: line,
    label: label,
    icon: icon,
    colours: colours,
    bars: bars,
    stripes: stripes,
    open: open,
  );
  return [
    k(
      'gazette',
      'THE GAZETTE',
      'Every chapter a front page of your world’s paper.',
      'The Gazette: each chapter of $book as the front page of its world’s newspaper',
      Icons.newspaper,
      const [Color(0xFF3B352C), Color(0xFF8C7F68)],
      gazette,
    ),
    k(
      'quiz',
      'QUIZ',
      'How well do you know your own book?',
      'The book quiz: how well do you know $book? Who said it, which chapter, the missing word',
      Icons.quiz_outlined,
      const [Color(0xFF14233A), Color(0xFF2C4A6E)],
      quiz,
    ),
    k(
      'postcards',
      'POSTCARDS',
      'Greetings from the places in your book.',
      'Postcards: greetings from the places in $book, a painted postcard each',
      Icons.local_post_office_outlined,
      const [Color(0xFF2E6F8E), Color(0xFFD98B5F)],
      postcards,
    ),
    k(
      'trailer',
      'TRAILER',
      'Your book as a film trailer, cut from its own lines.',
      'The trailer: $book as a film trailer, cut from its own lines',
      Icons.play_circle_outline,
      const [Color(0xFF07070B), Color(0xFF2A0E12)],
      trailer,
      bars: true,
    ),
    k(
      'lines',
      'BEST LINES',
      'The sentences most worth quoting, as cards to share.',
      'Your best lines: the sentences of $book most worth quoting, as cards to share',
      Icons.format_quote,
      const [Color(0xFF3D2F1E), Color(0xFF7A5B2E)],
      lines,
    ),
    k(
      'sampler',
      'SAMPLER',
      'Your opening chapters as a PDF to send to a reader.',
      'The sampler: the opening of $book as a reader’s sample, a PDF to send',
      Icons.picture_as_pdf_outlined,
      const [Color(0xFF1E3A34), Color(0xFF2F5E4E)],
      sampler,
    ),
    k(
      'story',
      'SO FAR',
      'Your words, days and people, told as a story.',
      'Your book so far: $book told as a story',
      Icons.auto_stories_outlined,
      const [Color(0xFF2B2350), Color(0xFF7A2E3A), Color(0xFF8A4B1C)],
      story,
    ),
    k(
      'print',
      'FINGERPRINT',
      'Every paragraph a thread, in its character’s colour.',
      'Its fingerprint: $book as a print, every paragraph a thread',
      Icons.fingerprint,
      const [Color(0xFF14121A), Color(0xFF1F2B3A)],
      print,
      stripes: true,
    ),
    k(
      'jacket',
      'FULL JACKET',
      'Back, spine and front, as a printer lays them out.',
      'The full jacket: $book as a printed cover, back, spine and front',
      Icons.menu_book_outlined,
      const [Color(0xFF3A2A1C), Color(0xFF1A130D)],
      jacket,
    ),
  ];
}

/// The keepsakes opened on this device, by id.
class OpenedKeepsakesNotifier extends Notifier<Set<String>> {
  @override
  Set<String> build() {
    final stored = ref.watch(settingsStoreProvider).read(keepsakesOpenedSettingKey);
    return {if (stored is List) ...stored.whereType<String>()};
  }

  /// Remembers that the keepsake [id] has been opened.
  void opened(String id) {
    if (state.contains(id)) return;
    state = {...state, id};
    final settings = ref.read(settingsStoreProvider);
    final ids = state.toList()..sort();
    ref.read(saveControllerProvider).saveNow('setting:$keepsakesOpenedSettingKey', () {
      settings.write(keepsakesOpenedSettingKey, ids);
    });
  }
}

final openedKeepsakesProvider = NotifierProvider<OpenedKeepsakesNotifier, Set<String>>(OpenedKeepsakesNotifier.new);

/// The row under More: a heading (how many, how many not yet opened, and the shelf), then a tile each, the ones not
/// yet opened first.
class KeepsakeRow extends ConsumerWidget {
  const KeepsakeRow({super.key, required this.keepsakes});

  final List<Keepsake> keepsakes;

  /// Each tile's width: two and a little of the third show on a phone, so the row says it goes on.
  static const _tile = 168.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final opened = ref.watch(openedKeepsakesProvider);
    final scheme = Theme.of(context).colorScheme;
    final fresh = keepsakes.where((k) => !opened.contains(k.id)).length;
    final ordered = [
      ...keepsakes.where((k) => !opened.contains(k.id)),
      ...keepsakes.where((k) => opened.contains(k.id)),
    ];
    void open(Keepsake k) {
      ref.read(openedKeepsakesProvider.notifier).opened(k.id);
      k.open();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 6, 6, 0),
          // Side by side, or one under the other when the words are large.
          child: Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text.rich(
                TextSpan(
                  children: [
                    const TextSpan(text: 'KEEPSAKES'),
                    TextSpan(
                      text: fresh == 0 ? '  ·  ${keepsakes.length}' : '  ·  $fresh new',
                      style: TextStyle(color: scheme.onSurfaceVariant, letterSpacing: 0.5),
                    ),
                  ],
                ),
                style: vaultHeading(context, size: 11, color: scheme.primary, weight: 700).copyWith(letterSpacing: 2.5),
              ),
              TextButton.icon(
                onPressed: () => showKeepsakeShelf(context, keepsakes: keepsakes),
                icon: const Icon(Icons.shelves, size: 18),
                label: const Text('See the shelf'),
              ),
            ],
          ),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(16, 2, 16, 8),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final (i, k) in ordered.indexed) ...[
                  if (i > 0) const SizedBox(width: 10),
                  SizedBox(
                    width: _tile,
                    child: KeepsakeTile(keepsake: k, isNew: !opened.contains(k.id), onOpen: () => open(k)),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// A keepsake's tile, in its own colours; on the shelf, standing ([standing]: its icon large in the middle). One not
/// yet opened wears the NEW ribbon across its corner.
class KeepsakeTile extends StatelessWidget {
  const KeepsakeTile({
    super.key,
    required this.keepsake,
    required this.isNew,
    required this.onOpen,
    this.standing = false,
  });

  final Keepsake keepsake;
  final bool isNew;
  final VoidCallback onOpen;
  final bool standing;

  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFFF7F1E4);
    const gold = Color(0xFFE8C46A);
    final k = keepsake;
    final kicker = Text(
      k.kicker,
      style: vaultHeading(context, size: standing ? 11 : 10, color: gold, weight: 700).copyWith(letterSpacing: 2),
    );
    final tile = Material(
      borderRadius: BorderRadius.circular(standing ? 12 : 16),
      clipBehavior: Clip.antiAlias,
      child: Ink(
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: k.colours, begin: Alignment.topLeft, end: Alignment.bottomRight),
        ),
        child: InkWell(
          onTap: onOpen,
          child: Container(
            foregroundDecoration: k.bars ? const _Letterbox() : null,
            padding: EdgeInsets.fromLTRB(14, k.bars ? 20 : 12, 12, k.bars ? 20 : 12),
            child: standing
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      kicker,
                      Expanded(
                        child: Center(child: Icon(k.icon, color: ink.withValues(alpha: 0.9), size: 44)),
                      ),
                      Text(
                        k.line,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: vaultText(context, size: 13.5, color: ink).copyWith(height: 1.25),
                      ),
                      if (k.stripes) ...[const SizedBox(height: 8), const _Threads()],
                    ],
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(child: kicker),
                          // The ribbon sits where the icon would.
                          if (!isNew) Icon(k.icon, color: ink, size: 20),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(k.line, style: vaultText(context, size: 14.5, color: ink)),
                      if (k.stripes) ...[const Spacer(), const SizedBox(height: 8), const _Threads()],
                    ],
                  ),
          ),
        ),
      ),
    );
    return Semantics(
      button: true,
      label: isNew ? '${k.label}, not yet opened' : k.label,
      excludeSemantics: true,
      child: isNew
          ? ClipRRect(
              borderRadius: BorderRadius.circular(standing ? 12 : 16),
              child: Banner(
                message: 'NEW',
                location: BannerLocation.topEnd,
                color: gold,
                textStyle: const TextStyle(
                  color: Color(0xFF2A1E12),
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.5,
                ),
                child: tile,
              ),
            )
          : tile,
    );
  }
}

/// A few threads of colour along a tile's foot, as the print has.
class _Threads extends StatelessWidget {
  const _Threads();

  @override
  Widget build(BuildContext context) => Row(
    children: [
      for (final (i, c) in const [
        Color(0xFF5B8DEF),
        Color(0xFFE07A5F),
        Color(0xFF81B29A),
        Color(0xFFF2CC8F),
        Color(0xFF9D7BD8),
        Color(0xFF5B8DEF),
        Color(0xFFE07A5F),
      ].indexed)
        Expanded(
          child: Container(
            height: 6.0 + (i * 7 % 11),
            margin: const EdgeInsets.only(right: 2),
            color: c.withValues(alpha: i.isEven ? 1 : 0.55),
          ),
        ),
    ],
  );
}

/// Black bars across the top and foot of a tile, as a film is shown on a wide screen.
class _Letterbox extends Decoration {
  const _Letterbox();

  @override
  BoxPainter createBoxPainter([VoidCallback? onChanged]) => _LetterboxPainter();
}

class _LetterboxPainter extends BoxPainter {
  @override
  void paint(Canvas canvas, Offset offset, ImageConfiguration configuration) {
    final size = configuration.size;
    if (size == null) return;
    final paint = Paint()..color = Colors.black;
    canvas
      ..drawRect(offset & Size(size.width, 9), paint)
      ..drawRect(Offset(offset.dx, offset.dy + size.height - 9) & Size(size.width, 9), paint);
  }
}

/// Opens the shelf: every keepsake at once, full screen. A keepsake opened from it opens in the shelf's place.
Future<void> showKeepsakeShelf(BuildContext context, {required List<Keepsake> keepsakes}) =>
    Navigator.of(context, rootNavigator: true).push(
      PageRouteBuilder<void>(
        pageBuilder: (_, _, _) => KeepsakeShelf(keepsakes: keepsakes),
        transitionsBuilder: (_, animation, _, child) => FadeTransition(opacity: animation, child: child),
      ),
    );

/// THE SHELF: the keepsakes standing on wooden shelves, two or more to a shelf as the screen allows, each a little
/// askew as things set down are.
class KeepsakeShelf extends ConsumerWidget {
  const KeepsakeShelf({super.key, required this.keepsakes});

  final List<Keepsake> keepsakes;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final opened = ref.watch(openedKeepsakesProvider);
    final fresh = keepsakes.where((k) => !opened.contains(k.id)).length;
    const light = Color(0xFFF3EBDD);
    void open(Keepsake k) {
      ref.read(openedKeepsakesProvider.notifier).opened(k.id);
      // The keepsake opens in the shelf's place, so leaving it (or going to the writing) is not left behind the shelf.
      Navigator.of(context).pop();
      k.open();
    }

    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF2E2017), Color(0xFF1C130D)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              Row(
                children: [
                  const SizedBox(width: 16),
                  Expanded(
                    child: Text(
                      'The keepsake shelf',
                      style: vaultHeading(context, size: 18, color: light, weight: 700),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close',
                    color: light,
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    fresh == 0
                        ? 'Everything your book can be made into. You have opened them all.'
                        : 'Everything your book can be made into. $fresh of ${keepsakes.length} not yet opened.',
                    style: vaultText(context, size: 14, color: light.withValues(alpha: 0.75)),
                  ),
                ),
              ),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final across = max(2, min(4, (constraints.maxWidth - 32) ~/ 190));
                    final rows = [
                      for (var i = 0; i < keepsakes.length; i += across)
                        keepsakes.sublist(i, min(i + across, keepsakes.length)),
                    ];
                    return ListView(
                      padding: const EdgeInsets.fromLTRB(0, 8, 0, 24),
                      children: [
                        for (final (r, row) in rows.indexed)
                          _Shelf(
                            children: [
                              for (var i = 0; i < across; i++)
                                Expanded(
                                  child: i < row.length
                                      ? Transform.rotate(
                                          // A little askew, each its own way.
                                          angle: ((r * across + i) % 3 - 1) * 0.018,
                                          child: AspectRatio(
                                            aspectRatio: 0.78,
                                            child: KeepsakeTile(
                                              keepsake: row[i],
                                              isNew: !opened.contains(row[i].id),
                                              standing: true,
                                              onOpen: () => open(row[i]),
                                            ),
                                          ),
                                        )
                                      : const SizedBox.shrink(),
                                ),
                            ],
                          ),
                      ],
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A shelf: its keepsakes standing on a wooden plank.
class _Shelf extends StatelessWidget {
  const _Shelf({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 26),
    child: Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (final (i, c) in children.indexed) ...[if (i > 0) const SizedBox(width: 16), c],
            ],
          ),
        ),
        // The plank: its lit top edge, its face, and its shadow on the wall below.
        Container(
          height: 16,
          margin: const EdgeInsets.symmetric(horizontal: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(2),
            gradient: const LinearGradient(
              colors: [Color(0xFFB07A4C), Color(0xFF8A5A35), Color(0xFF5E3B22)],
              stops: [0, 0.25, 1],
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
            ),
            boxShadow: const [BoxShadow(color: Color(0xAA000000), blurRadius: 10, offset: Offset(0, 8))],
          ),
        ),
      ],
    ),
  );
}
