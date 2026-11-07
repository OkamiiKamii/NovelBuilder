import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/destinations.dart';
import '../../core/format.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/widgets/states.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/reader/book.dart';
import '../../shared/domain/reader/reader_prefs.dart';
import '../collab/collab_providers.dart';
import '../workspace/open_novel.dart';
import '../workspace/section_page.dart';
import 'book_layout.dart';
import 'book_view.dart';
import 'publish_dialog.dart';
import 'reader_providers.dart';

/// The reader: the open novel drawn as a printed book, an ebook or a web serial, from the text as saved. It changes
/// nothing in the novel; the look and the place reached belong to this device.
class ReaderPage extends ConsumerStatefulWidget {
  const ReaderPage({super.key});

  @override
  ConsumerState<ReaderPage> createState() => _ReaderPageState();
}

class _ReaderPageState extends ConsumerState<ReaderPage> {
  ReaderPlace _place = (section: 0, page: 0);
  double? _startFraction;
  double _fraction = 0;
  double _furthest = 0;
  String? _placedFor;

  // The book and its look are rebuilt only when what they are made from changes, so pages measured once stay measured.
  (BookSource, BookFormat)? _bookKey;
  Book? _book;
  (ReaderPrefs, String, TargetPlatform)? _lookKey;
  BookLook? _look;

  bool _appearanceOpen = false;

  Book _bookFor(BookSource source, BookFormat format) {
    if (_bookKey == null || !identical(_bookKey!.$1, source) || _bookKey!.$2 != format) {
      _bookKey = (source, format);
      _book = buildBook(source, format);
    }
    return _book!;
  }

  BookLook _lookFor(ReaderPrefs prefs, String sceneBreak, TargetPlatform platform) {
    final key = (prefs, sceneBreak, platform);
    if (_lookKey != key) {
      _lookKey = key;
      _look = BookLook.of(prefs, sceneBreak, platform);
    }
    return _look!;
  }

  /// Opens a novel at the place it was left on this device, or at its start.
  void _restore(String novelId, Book book) {
    _placedFor = novelId;
    final mark = readBookmark(ref.read(settingsStoreProvider), novelId);
    _furthest = mark?.furthest ?? 0;
    final at = mark == null ? -1 : book.sections.indexWhere((s) => s.id == mark.sectionId);
    _place = (section: math.max(at, 0), page: 0);
    _startFraction = at < 0 ? null : mark!.fraction;
    _fraction = _startFraction ?? 0;
  }

  void _onPlace(String novelId, Book book, ReaderPlace place, double fraction) {
    setState(() {
      _place = place;
      _fraction = fraction;
      _startFraction = null;
    });
    final progress = progressAt(book, (index: place.section, fraction: fraction));
    _furthest = math.max(_furthest, progress);
    writeBookmark(
      ref.read(settingsStoreProvider),
      ref.read(saveControllerProvider),
      novelId,
      Bookmark(sectionId: book.sections[place.section].id, fraction: fraction, furthest: _furthest),
    );
  }

  /// Keeps the reader on the same part of the story when the format changes, where the new format has it.
  void _setFormat(Book from, BookFormat format, BookSource source) {
    final id = from.sections[_place.section.clamp(0, from.sections.length - 1)].id;
    final to = _bookFor(source, format);
    final at = to.sections.indexWhere((s) => s.id == id);
    setState(() {
      _place = (section: math.max(at, 0), page: 0);
      _startFraction = null;
      _fraction = 0;
    });
    ref.read(readerPrefsProvider.notifier).update((p) => p.copyWith(format: format));
  }

  void _showContents(BuildContext context, Book book, String novelId) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      showDragHandle: true,
      builder: (sheet) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        builder: (context, controller) => _Contents(
          book: book,
          current: _place.section,
          controller: controller,
          onJump: (i) {
            Navigator.of(sheet).pop();
            _onPlace(novelId, book, (section: i, page: 0), 0);
          },
        ),
      ),
    );
  }

  void _showAppearance(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      showDragHandle: true,
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        builder: (context, controller) => AppearanceControls(controller: controller, showDevice: false),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final novelId = ref.watch(openNovelProvider);
    if (novelId == null) return const SectionPage(destination: Destination.write);
    final read = ref.watch(readerSourceProvider);
    if (read == null || read.novelId != novelId) {
      return const EmptyState(
        icon: Icons.menu_book_outlined,
        title: 'This novel could not be opened to read',
        message: 'Nothing in it has changed. Go back to Write and try again.',
      );
    }
    final prefs = ref.watch(readerPrefsProvider);
    final book = _bookFor(read.source, prefs.format);
    if (_placedFor != novelId) _restore(novelId, book);
    final look = _lookFor(prefs, book.sceneBreak, Theme.of(context).platform);
    final size = WindowSize.of(context);
    final wide = size == WindowSize.expanded;
    final theme = Theme.of(context);
    final place = (section: _place.section.clamp(0, book.sections.length - 1), page: _place.page);
    final progress = progressAt(book, (index: place.section, fraction: _fraction));
    final left = (book.words * (1 - progress)).round();
    final compact = size == WindowSize.compact;

    // A review copy is the author's book: it is read here, never published or given book details.
    final review = ref.watch(reviewMarkProvider) != null;
    void bookDetails() => context.go('${Destination.write.path}/book');
    void publish() => showPublishDialog(context, novelId: novelId, project: read.source.project, source: read.source);
    final contents = prefs.format == BookFormat.serial
        ? null
        : IconButton(
            tooltip: 'Contents',
            onPressed: () => _showContents(context, book, novelId),
            icon: const Icon(Icons.toc),
          );
    final appearance = IconButton(
      tooltip: 'Appearance',
      isSelected: wide && _appearanceOpen,
      onPressed: () => wide ? setState(() => _appearanceOpen = !_appearanceOpen) : _showAppearance(context),
      icon: const Icon(Icons.format_size),
    );
    final back = IconButton(
      tooltip: 'Back to writing',
      onPressed: () => context.go(Destination.write.path),
      icon: const Icon(Icons.arrow_back),
    );

    // On a phone, one row, so the page keeps the height; elsewhere every choice in view.
    final toolbar = compact
        ? Padding(
            padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
            child: Row(
              children: [
                back,
                Expanded(
                  child: PopupMenuButton<BookFormat>(
                    tooltip: 'Format',
                    initialValue: prefs.format,
                    onSelected: (f) => _setFormat(book, f, read.source),
                    itemBuilder: (_) => [
                      for (final f in BookFormat.values) PopupMenuItem(value: f, child: Text(f.label)),
                    ],
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
                      child: Row(
                        children: [
                          Flexible(child: Text(prefs.format.label, overflow: TextOverflow.ellipsis)),
                          const Icon(Icons.arrow_drop_down),
                        ],
                      ),
                    ),
                  ),
                ),
                ?contents,
                appearance,
                if (!review)
                  PopupMenuButton<String>(
                    tooltip: 'Book details and publishing',
                    onSelected: (v) => v == 'book' ? bookDetails() : publish(),
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: 'book', child: Text('Book details')),
                      PopupMenuItem(value: 'publish', child: Text('Publish…')),
                    ],
                  ),
              ],
            ),
          )
        : Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 8, 4),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                back,
                SegmentedButton<BookFormat>(
                  segments: [
                    for (final f in BookFormat.values) ButtonSegment(value: f, label: Text(f.label), tooltip: f.hint),
                  ],
                  selected: {prefs.format},
                  showSelectedIcon: false,
                  onSelectionChanged: (s) => _setFormat(book, s.first, read.source),
                ),
                ?contents,
                appearance,
                if (!review) ...[
                  TextButton.icon(
                    onPressed: bookDetails,
                    icon: const Icon(Icons.auto_stories_outlined),
                    label: const Text('Book details'),
                  ),
                  FilledButton.icon(
                    onPressed: publish,
                    icon: const Icon(Icons.ios_share),
                    label: const Text('Publish…'),
                  ),
                ],
              ],
            ),
          );

    final label = Text(
      book.words == 0
          ? 'No words yet'
          : '${(progress * 100).round()}% · about ${plural(readingMinutes(left), 'minute')} left',
      style: theme.textTheme.bodySmall,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );
    final reading = Semantics(
      label: 'Reading progress',
      value: '${(progress * 100).round()}%, about ${plural(readingMinutes(left), 'minute')} left',
      child: ExcludeSemantics(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Row(
            children: [
              Expanded(flex: 2, child: LinearProgressIndicator(value: progress)),
              const SizedBox(width: 12),
              Flexible(flex: 3, child: label),
            ],
          ),
        ),
      ),
    );

    void onPlace(ReaderPlace p, double fraction) => _onPlace(novelId, book, p, fraction);
    final serial = prefs.format == BookFormat.serial;
    final flow = resolveLook(prefs).flow;
    final Widget view = book.words == 0 && serial
        ? const EmptyState(
            icon: Icons.edit_note,
            title: 'No chapter has text yet',
            message: 'Write a chapter and it will appear here as a reader will see it.',
          )
        : serial
        ? SerialBook(book: book, look: look, place: place, onPlace: onPlace)
        : flow == ReaderFlow.paged
        ? PagedBook(
            key: ValueKey('paged:$novelId:${prefs.format.name}'),
            book: book,
            look: look,
            place: place,
            onPlace: onPlace,
            startFraction: _startFraction,
          )
        : ScrolledBook(
            key: ValueKey('scroll:$novelId:${prefs.format.name}'),
            book: book,
            look: look,
            place: place,
            onPlace: onPlace,
          );

    final page = DefaultTextStyle.merge(
      style: TextStyle(color: look.foreground),
      child: ColoredBox(color: look.background, child: view),
    );

    // On a wide screen, the book inside the device it is being read on; elsewhere, the whole screen is the device.
    final framed = wide
        ? LayoutBuilder(
            builder: (context, c) {
              final device = prefs.device;
              final scale = math.min(
                1.0,
                math.min((c.maxWidth - 32) / device.width, (c.maxHeight - 32) / device.height),
              );
              return Center(
                child: Semantics(
                  label: '${device.label} preview',
                  container: true,
                  child: Container(
                    width: device.width * scale,
                    height: device.height * scale,
                    clipBehavior: Clip.antiAlias,
                    decoration: BoxDecoration(
                      color: look.background,
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: theme.colorScheme.outline, width: 6),
                    ),
                    child: page,
                  ),
                ),
              );
            },
          )
        : page;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        toolbar,
        reading,
        const Divider(height: 1),
        Expanded(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(child: framed),
              if (wide && _appearanceOpen) ...[
                const VerticalDivider(width: 1),
                const SizedBox(width: 340, child: AppearanceControls(showDevice: true)),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _Contents extends StatelessWidget {
  const _Contents({required this.book, required this.current, required this.onJump, this.controller});
  final Book book;
  final int current;
  final ValueChanged<int> onJump;
  final ScrollController? controller;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      controller: controller,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Semantics(header: true, child: Text('Contents', style: theme.textTheme.titleMedium)),
        ),
        for (final (i, s) in book.sections.indexed)
          if (s.kind != SectionKind.contents)
            ListTile(
              selected: i == current,
              contentPadding: EdgeInsets.only(left: 16.0 + 16 * s.depth, right: 16),
              title: Text(s.showsLabel ? '${s.label}: ${s.title}' : s.title),
              subtitle: s.words > 0 ? Text(plural(s.words, 'word')) : null,
              onTap: () => onJump(i),
            ),
      ],
    );
  }
}

/// How the reader looks on this device: typeface, size, spacing, paragraphs and colours. Every change shows at once.
class AppearanceControls extends ConsumerWidget {
  const AppearanceControls({super.key, this.controller, required this.showDevice});
  final ScrollController? controller;
  final bool showDevice;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(readerPrefsProvider);
    final notifier = ref.read(readerPrefsProvider.notifier);
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final look = resolveLook(prefs);
    final contrast = contrastOf(look.background, look.text);
    final serial = prefs.format == BookFormat.serial;

    Widget slider(String label, double value, ReaderRange range, String shown, ReaderPrefs Function(double) change) =>
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('$label: $shown'),
            Slider(
              value: value.clamp(range.min, range.max),
              min: range.min,
              max: range.max,
              divisions: ((range.max - range.min) / range.step).round(),
              label: shown,
              semanticFormatterCallback: (_) => shown,
              onChanged: (v) => notifier.update((_) => change(v)),
            ),
          ],
        );

    Widget choice<T>(String label, T value, List<T> values, String Function(T) name, ReaderPrefs Function(T) change) =>
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: DropdownButtonFormField<T>(
            initialValue: value,
            isExpanded: true,
            decoration: InputDecoration(labelText: label),
            items: [for (final v in values) DropdownMenuItem(value: v, child: Text(name(v)))],
            onChanged: (v) => notifier.update((_) => change(v as T)),
          ),
        );

    return Material(
      color: theme.colorScheme.surface,
      child: ListView(
        controller: controller,
        padding: const EdgeInsets.all(16),
        children: [
          Semantics(header: true, child: Text('Appearance', style: theme.textTheme.titleMedium)),
          const SizedBox(height: 16),
          if (serial)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text('A web serial always scrolls, as it does online.', style: muted),
            )
          else
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: SegmentedButton<ReaderFlow>(
                segments: const [
                  ButtonSegment(value: ReaderFlow.paged, label: Text('Pages'), icon: Icon(Icons.auto_stories_outlined)),
                  ButtonSegment(value: ReaderFlow.scroll, label: Text('Scroll'), icon: Icon(Icons.swap_vert)),
                ],
                selected: {prefs.flow},
                onSelectionChanged: (s) => notifier.update((p) => p.copyWith(flow: s.first)),
              ),
            ),
          choice('Typeface', prefs.font, ReaderFont.values, (f) => f.label, (f) => prefs.copyWith(font: f)),
          slider('Text size', prefs.size, readerSizeRange, '${prefs.size.round()} pt', (v) => prefs.copyWith(size: v)),
          slider(
            'Line spacing',
            prefs.leading,
            readerLeadingRange,
            prefs.leading.toStringAsFixed(2),
            (v) => prefs.copyWith(leading: v),
          ),
          slider(
            'Line length',
            prefs.measure,
            readerMeasureRange,
            '${prefs.measure.round()} characters',
            (v) => prefs.copyWith(measure: v),
          ),
          choice(
            'Paragraphs',
            prefs.paragraphs,
            ParagraphStyle.values,
            (p) => p.label,
            (p) => prefs.copyWith(paragraphs: p),
          ),
          if (look.indented)
            slider(
              'First-line indent',
              prefs.indent,
              readerIndentRange,
              '${prefs.indent} em',
              (v) => prefs.copyWith(indent: v),
            )
          else
            slider(
              'Space between paragraphs',
              prefs.spacing,
              readerSpacingRange,
              '${prefs.spacing.toStringAsFixed(1)} lines',
              (v) => prefs.copyWith(spacing: v),
            ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Justified text'),
            subtitle: serial ? const Text('A web serial is set ragged-right, as browsers show it.') : null,
            value: prefs.justify,
            onChanged: (v) => notifier.update((p) => p.copyWith(justify: v)),
          ),
          const SizedBox(height: 8),
          choice('Colours', prefs.scheme, ReaderScheme.values, (s) => s.label, (s) => prefs.copyWith(scheme: s)),
          if (prefs.scheme == ReaderScheme.custom) ...[
            _HexField(
              label: 'Page colour',
              value: prefs.customBg,
              onValid: (v) => notifier.update((p) => p.copyWith(customBg: v)),
            ),
            const SizedBox(height: 8),
            _HexField(
              label: 'Text colour',
              value: prefs.customText,
              onValid: (v) => notifier.update((p) => p.copyWith(customText: v)),
            ),
            const SizedBox(height: 8),
          ],
          Text(
            'Contrast ${contrast.toStringAsFixed(1)} to 1: ${contrastVerdict(contrast)}.',
            style: contrast < 4.5 ? TextStyle(color: theme.colorScheme.error) : muted,
          ),
          if (showDevice) ...[
            const SizedBox(height: 16),
            choice(
              'Preview on',
              prefs.device,
              ReaderDevice.values,
              (d) => '${d.label} (${d.width.round()} × ${d.height.round()})',
              (d) => prefs.copyWith(device: d),
            ),
          ],
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(onPressed: notifier.reset, child: const Text('Back to the usual look')),
          ),
        ],
      ),
    );
  }
}

/// A colour typed as #rrggbb. Only a whole colour is applied; until then the last one stays.
class _HexField extends StatefulWidget {
  const _HexField({required this.label, required this.value, required this.onValid});
  final String label;
  final String value;
  final ValueChanged<String> onValid;

  @override
  State<_HexField> createState() => _HexFieldState();
}

class _HexFieldState extends State<_HexField> {
  late final _controller = TextEditingController(text: widget.value);
  static final _hex = RegExp(r'^#?[0-9a-fA-F]{6}$');

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final text = _controller.text.trim();
    final ok = _hex.hasMatch(text);
    return TextField(
      controller: _controller,
      decoration: InputDecoration(
        labelText: widget.label,
        hintText: '#rrggbb',
        errorText: ok ? null : 'A colour as # and six digits or letters a to f, like #f4ecd8',
        prefixIcon: Padding(
          padding: const EdgeInsets.all(12),
          child: Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              color: Color(int.parse(widget.value.substring(1), radix: 16) | 0xFF000000),
              border: Border.all(color: Theme.of(context).colorScheme.outline),
              borderRadius: BorderRadius.circular(4),
            ),
          ),
        ),
      ),
      onChanged: (v) {
        setState(() {});
        final t = v.trim();
        if (_hex.hasMatch(t)) widget.onValid((t.startsWith('#') ? t : '#$t').toLowerCase());
      },
    );
  }
}
