import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/text_prompt.dart';
import '../../features/characters/widgets/vault.dart';
import '../../features/workspace/open_novel.dart';
import '../../features/write/write_providers.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/data/settings_store.dart';
import '../destinations.dart';
import 'page_turn.dart';

/// A ribbon laid in a page of the book: where it lies (the page's location, and the chapter when it lies in Write),
/// the name it was given, and its silk (one of [ribbonSilks]).
typedef Ribbon = ({String path, String? node, String label, int silk});

/// At most this many ribbons in one book, as a real book has a few.
const ribbonsMax = 6;

/// The silks, each dark enough for light lettering on it: crimson, forest, navy, old gold, plum, teal.
const ribbonSilks = [
  Color(0xFF9E2A2B),
  Color(0xFF2F5D50),
  Color(0xFF2C3E6B),
  Color(0xFF7E5F17),
  Color(0xFF6B3A6B),
  Color(0xFF225E63),
];

String ribbonsKey(String novelId) => 'ribbons.$novelId';

/// The book's ribbons as kept on this device (its settings, not the novel): none when nothing readable is kept.
List<Ribbon> readRibbons(SettingsStore settings, String novelId) {
  final raw = settings.read(ribbonsKey(novelId));
  if (raw is! List) return const [];
  return [
    for (final r in raw)
      if (r is Map && r['path'] is String && r['label'] is String)
        (
          path: r['path'] as String,
          node: r['node'] is String ? r['node'] as String : null,
          label: r['label'] as String,
          silk: r['silk'] is int ? (r['silk'] as int) % ribbonSilks.length : 0,
        ),
  ].take(ribbonsMax).toList();
}

List<Map<String, Object?>> _encode(List<Ribbon> ribbons) => [
  for (final r in ribbons) {'path': r.path, 'node': ?r.node, 'label': r.label, 'silk': r.silk},
];

/// Whether [r] lies in the page at [location] (and, in Write, at the chapter [node]).
bool ribbonHere(Ribbon r, String location, String? node) {
  if (r.path != location) return false;
  return Destination.forLocation(location) != Destination.write || r.node == null || r.node == node;
}

/// The silk for a new ribbon: the first not yet in the book.
int nextSilk(List<Ribbon> ribbons) {
  for (var i = 0; i < ribbonSilks.length; i++) {
    if (!ribbons.any((r) => r.silk == i)) return i;
  }
  return ribbons.length % ribbonSilks.length;
}

/// The name a ribbon is offered when laid, from the page: the character, entry, event, thread or chapter it lies at
/// (by its name or title, as saved), else the page's own name ("Histories", "Calendar"), else the area's.
String ribbonName({required String location, required NovelStore store, required String novelId, String? node}) {
  final uri = Uri.parse(location);
  final segments = uri.pathSegments;
  final area = Destination.forLocation(location);
  String? named(String collection, String id) {
    final row = store.row(novelId, collection, id);
    for (final key in const ['name', 'title']) {
      final v = row?[key];
      if (v is String && v.trim().isNotEmpty) return v.trim();
    }
    return null;
  }

  if (area == Destination.write && segments.length <= 1 && node != null) {
    return named('chapters', node) ?? 'Write';
  }
  const collections = {
    'character': 'loreEntries',
    'entry': 'loreEntries',
    'event': 'timelineEvents',
    'thread': 'plotThreads',
    'chapter': 'chapters',
  };
  for (var i = 0; i + 1 < segments.length; i++) {
    final collection = collections[segments[i]];
    if (collection != null) {
      final name = named(collection, segments[i + 1]);
      if (name != null) return name;
    }
  }
  if (segments.length > 1) {
    final last = segments.last.replaceAll('-', ' ');
    return '${last[0].toUpperCase()}${last.substring(1)}';
  }
  return area?.label ?? 'This page';
}

/// RIBBONS: silk bookmarks laid in the pages of a book. One ribbon peeks in at the right edge of every page inside
/// the book; pressing it fans out the book's ribbons, each with its name, and pressing one turns to the page it lies
/// in (in Write, the chapter it was laid at). **Lay a ribbon in this page** marks the page being read, named as the
/// author likes; each ribbon can be taken out again. Kept on this device with the app's settings, not in the novel:
/// they are the author's way around the book, not part of it. Hidden while the keyboard is up.
class RibbonMarker extends ConsumerStatefulWidget {
  const RibbonMarker({super.key, required this.location, this.keyboardUp = false});

  final String location;

  /// Whether the keyboard is up, read above the page's Scaffold (which keeps it from the page beneath).
  final bool keyboardUp;

  @override
  ConsumerState<RibbonMarker> createState() => _RibbonMarkerState();
}

class _RibbonMarkerState extends ConsumerState<RibbonMarker> {
  @override
  Widget build(BuildContext context) {
    final novel = ref.watch(openNovelProvider);
    if (novel == null || widget.keyboardUp) return const SizedBox.shrink();
    final node = ref.watch(selectedNodeProvider);
    final ribbons = readRibbons(ref.read(settingsStoreProvider), novel);
    final here = ribbons.where((r) => ribbonHere(r, widget.location, node)).firstOrNull;
    final silk = here == null
        ? (ribbons.isEmpty ? Theme.of(context).colorScheme.primary : ribbonSilks[ribbons.first.silk])
        : ribbonSilks[here.silk];
    final label = ribbons.isEmpty
        ? 'Ribbons: mark pages of this book'
        : here == null
        ? 'Ribbons: ${ribbons.length} in this book'
        : 'Ribbons: this page is marked “${here.label}”';
    return Tooltip(
      message: label,
      child: Semantics(
        button: true,
        label: label,
        excludeSemantics: true,
        child: InkWell(
          onTap: () => _open(novel, node),
          child: SizedBox(
            width: 48,
            height: 56,
            child: Align(
              alignment: Alignment.centerRight,
              // Longer when it lies in this page.
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                width: here == null ? 20 : 30,
                height: 48,
                child: CustomPaint(painter: _Silk(silk, notch: 7)),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _open(String novel, String? node) async {
    final choice = await showGeneralDialog<_Choice>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Close the ribbons',
      barrierColor: Colors.black.withValues(alpha: 0.25),
      transitionDuration: const Duration(milliseconds: 320),
      pageBuilder: (dialogContext, animation, _) =>
          _RibbonFan(novel: novel, location: widget.location, node: node, animation: animation),
      transitionBuilder: (_, animation, _, child) => SlideTransition(
        position: Tween(
          begin: const Offset(1, 0),
          end: Offset.zero,
        ).animate(CurvedAnimation(parent: animation, curve: Curves.easeOutCubic)),
        child: child,
      ),
    );
    if (!mounted) return;
    setState(() {}); // A ribbon may have been taken out.
    switch (choice) {
      case _Turn(:final ribbon):
        _turnTo(ribbon);
      case _Lay():
        await _lay(novel, node);
      case null:
        break;
    }
  }

  void _turnTo(Ribbon r) {
    final router = GoRouter.of(context);
    if (r.node != null) ref.read(selectedNodeProvider.notifier).select(r.node);
    final from = Destination.forLocation(widget.location);
    final to = Destination.forLocation(r.path);
    void go() => router.go(r.path);
    final turner = PageTurner.of(context);
    if (turner == null || from == null || to == null || r.path == widget.location) return go();
    turner.turn(forward: to.index >= from.index, go: go);
  }

  Future<void> _lay(String novel, String? node) async {
    final settings = ref.read(settingsStoreProvider);
    final ribbons = readRibbons(settings, novel);
    final inWrite = Destination.forLocation(widget.location) == Destination.write;
    final guess = ribbonName(
      location: widget.location,
      store: ref.read(novelStoreProvider),
      novelId: novel,
      node: inWrite ? node : null,
    );
    final name = await showTextPrompt(
      context,
      title: 'Lay a ribbon in this page',
      label: 'The ribbon’s name',
      initial: guess,
      confirmLabel: 'Lay the ribbon',
    );
    if (!mounted || name == null || name.trim().isEmpty) return;
    final laid = [
      ...ribbons,
      (path: widget.location, node: inWrite ? node : null, label: name.trim(), silk: nextSilk(ribbons)),
    ];
    ref
        .read(saveControllerProvider)
        .saveNow('setting:${ribbonsKey(novel)}', () => settings.write(ribbonsKey(novel), _encode(laid)));
    setState(() {});
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('A ribbon now lies in “${name.trim()}”.')));
  }
}

sealed class _Choice {
  const _Choice();
}

class _Turn extends _Choice {
  const _Turn(this.ribbon);
  final Ribbon ribbon;
}

class _Lay extends _Choice {
  const _Lay();
}

/// The book's ribbons fanned out from the right edge, on a slip of paper: each a strip of silk with its name, the one
/// lying in this page marked "Here"; under them, laying a ribbon in this page.
class _RibbonFan extends ConsumerStatefulWidget {
  const _RibbonFan({required this.novel, required this.location, required this.node, required this.animation});

  final String novel;
  final String location;
  final String? node;
  final Animation<double> animation;

  @override
  ConsumerState<_RibbonFan> createState() => _RibbonFanState();
}

class _RibbonFanState extends ConsumerState<_RibbonFan> {
  late List<Ribbon> _ribbons = readRibbons(ref.read(settingsStoreProvider), widget.novel);

  void _takeOut(Ribbon r) {
    final settings = ref.read(settingsStoreProvider);
    final left = [..._ribbons]..remove(r);
    ref
        .read(saveControllerProvider)
        .saveNow('setting:${ribbonsKey(widget.novel)}', () => settings.write(ribbonsKey(widget.novel), _encode(left)));
    setState(() => _ribbons = left);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final here = _ribbons.where((r) => ribbonHere(r, widget.location, widget.node)).firstOrNull;
    final full = _ribbons.length >= ribbonsMax;
    final width = MediaQuery.sizeOf(context).width;
    return SafeArea(
      child: Align(
        alignment: Alignment.centerRight,
        child: Padding(
          padding: const EdgeInsets.only(left: 40, top: 24, bottom: 24),
          child: Material(
            color: scheme.surface,
            elevation: 8,
            shape: const RoundedRectangleBorder(borderRadius: BorderRadius.horizontal(left: Radius.circular(14))),
            clipBehavior: Clip.antiAlias,
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: width < 400 ? width - 40 : 340),
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(0, 18, 0, 10),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Semantics(
                            header: true,
                            child: Text('Ribbons', style: vaultHeading(context, size: 20, weight: 700)),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _ribbons.isEmpty
                                ? 'Lay ribbons in the pages you keep going back to: a character, a chapter, the map. '
                                      'They wait here, a press away from any page of the book.'
                                : 'Press a ribbon to turn to the page it lies in.',
                            style: vaultText(
                              context,
                              size: 15,
                              color: scheme.onSurfaceVariant,
                              style: FontStyle.italic,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    for (final (i, r) in _ribbons.indexed)
                      _Unfurl(
                        animation: widget.animation,
                        index: i,
                        child: _RibbonStrip(
                          ribbon: r,
                          here: identical(r, here),
                          onTurn: () => Navigator.of(context).pop(_Turn(r)),
                          onTakeOut: () => _takeOut(r),
                        ),
                      ),
                    const SizedBox(height: 6),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: here != null
                          ? Text('This page has its ribbon, “${here.label}”.', style: theme.textTheme.bodySmall)
                          : full
                          ? Text(
                              'Six ribbons is the most a book holds: take one out to lay another.',
                              style: theme.textTheme.bodySmall,
                            )
                          : Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton.icon(
                                onPressed: () => Navigator.of(context).pop(const _Lay()),
                                icon: const Icon(Icons.bookmark_add_outlined),
                                label: const Text('Lay a ribbon in this page'),
                              ),
                            ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Each ribbon slides in a moment after the one above it.
class _Unfurl extends StatelessWidget {
  const _Unfurl({required this.animation, required this.index, required this.child});
  final Animation<double> animation;
  final int index;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final start = (0.15 + index * 0.1).clamp(0.0, 0.7);
    final curve = CurvedAnimation(
      parent: animation,
      curve: Interval(start, 1, curve: Curves.easeOutCubic),
    );
    return SlideTransition(
      position: Tween(begin: const Offset(0.6, 0), end: Offset.zero).animate(curve),
      child: child,
    );
  }
}

class _RibbonStrip extends StatelessWidget {
  const _RibbonStrip({required this.ribbon, required this.here, required this.onTurn, required this.onTakeOut});

  final Ribbon ribbon;
  final bool here;
  final VoidCallback onTurn;
  final VoidCallback onTakeOut;

  @override
  Widget build(BuildContext context) {
    final silk = ribbonSilks[ribbon.silk];
    const ink = Color(0xFFFFF6E6);
    final area = Destination.forLocation(ribbon.path);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: CustomPaint(
        painter: _Silk(silk, notch: 14),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            onTap: onTurn,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 52),
              child: Padding(
                padding: const EdgeInsets.only(left: 24),
                child: Row(
                  children: [
                    Icon(area?.icon ?? Icons.bookmark, size: 18, color: ink),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Text(
                          ribbon.label,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: vaultHeading(context, size: 15, color: ink, weight: 700),
                        ),
                      ),
                    ),
                    if (here)
                      Padding(
                        padding: const EdgeInsets.only(left: 6),
                        child: Text(
                          'Here',
                          style: vaultText(context, size: 14, color: ink, style: FontStyle.italic),
                        ),
                      ),
                    IconButton(
                      tooltip: 'Take out the ribbon “${ribbon.label}”',
                      onPressed: onTakeOut,
                      icon: const Icon(Icons.close, size: 18, color: ink),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A strip of silk, its left end cut in a swallowtail [notch] deep, with a sheen along it and a stitch near each edge.
class _Silk extends CustomPainter {
  const _Silk(this.colour, {required this.notch});
  final Color colour;
  final double notch;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final strip = Path()
      ..moveTo(0, 0)
      ..lineTo(w, 0)
      ..lineTo(w, h)
      ..lineTo(0, h)
      ..lineTo(notch, h / 2)
      ..close();
    canvas.drawShadow(strip, Colors.black, 2, false);
    canvas.drawPath(
      strip,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color.lerp(colour, Colors.white, 0.18)!, colour, Color.lerp(colour, Colors.black, 0.25)!],
          stops: const [0, 0.45, 1],
        ).createShader(Offset.zero & size),
    );
    if (h >= 30) {
      final stitch = Paint()
        ..color = Colors.white.withValues(alpha: 0.22)
        ..strokeWidth = 1;
      for (final y in [3.5, h - 3.5]) {
        for (var x = notch; x < w; x += 6) {
          canvas.drawLine(Offset(x, y), Offset((x + 3).clamp(0, w), y), stitch);
        }
      }
    }
  }

  @override
  bool shouldRepaint(_Silk old) => old.colour != colour || old.notch != notch;
}
