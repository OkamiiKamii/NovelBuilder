import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/background.dart';
import '../../shared/data/backup_files.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/exchange/compile.dart' hide Align;
import '../../shared/domain/exchange/compile.dart' as doc show Align;
import '../../shared/domain/exchange/render_pdf.dart';
import '../../shared/domain/exchange/sampler.dart';
import '../../shared/domain/manuscript/outline.dart';
import '../../shared/domain/model/story_order.dart';
import '../../shared/domain/records/story_node.dart';
import '../characters/widgets/vault.dart';
import 'charts_page.dart' show fileSlug;

/// THE SAMPLER on screen (`sampler.dart` makes it): the opening of the book as a reader's sample, the thing a writer
/// sends to a beta reader, a writing group or an agent. Its pages are shown as pages, swiped through: the title page
/// (the title, who wrote it, the best line, the synopsis), each chapter's first page, and the last, which says how much
/// more there is. **Make the PDF** saves it, ready to send. It only reads.

/// A page as it is drawn here: half a US Letter page in points, scaled to fit.
const samplerPageSize = Size(306, 396);

/// The reading speed the time to read is told at, in words a minute.
const _readingSpeed = 250;

/// Opens the sampler of [novelId], full screen.
Future<void> showSampler(BuildContext context, {required String novelId}) =>
    Navigator.of(context, rootNavigator: true).push(
      PageRouteBuilder<void>(
        pageBuilder: (_, _, _) => SamplerScreen(novelId: novelId),
        transitionsBuilder: (_, animation, _, child) => FadeTransition(opacity: animation, child: child),
      ),
    );

/// The pages the sample is shown as: the title page, each chapter (its first page), and the end.
List<List<Block>> samplerPages(Compiled sample) {
  final pages = <List<Block>>[[]];
  for (final b in sample.blocks) {
    if (b is HeadingBlock && b.pageBreak) pages.add([]);
    pages.last.add(b);
  }
  // The last three blocks (a rule, how much more there is, where it was made) are a page of their own here.
  if (pages.length > 1 && pages.last.length > 3) {
    final last = pages.removeLast();
    pages
      ..add(last.sublist(0, last.length - 3))
      ..add(last.sublist(last.length - 3));
  }
  return pages;
}

class SamplerScreen extends ConsumerStatefulWidget {
  const SamplerScreen({super.key, required this.novelId});

  final String novelId;

  @override
  ConsumerState<SamplerScreen> createState() => _SamplerScreenState();
}

class _SamplerScreenState extends ConsumerState<SamplerScreen> {
  Compiled? _sample;
  final _pages = PageController(viewportFraction: 0.82);
  int _at = 0;
  bool _working = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    final store = ref.read(novelStoreProvider);
    final novel = store.novel(widget.novelId);
    final nodes = [
      for (final n in readingOrder([for (final r in store.rowsIn(widget.novelId, 'chapters')) StoryNode(r)]))
        if (isDocument(n.kind)) n,
    ];
    ref
        .read(runAsideProvider)(
          samplerJob(
            store.rawJsonIn(widget.novelId, 'chapterContents'),
            [for (final n in nodes) n.id],
            {for (final n in nodes) n.id: n.title},
            title: novel?.title ?? '',
            author: novel?.author ?? '',
            synopsis: novel?.synopsis ?? '',
          ),
        )
        .then(
          (sample) {
            if (mounted) setState(() => _sample = sample);
          },
          onError: (Object e, StackTrace s) =>
              FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'progress')),
        );
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  Future<void> _make(Compiled sample) async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    setState(() {
      _working = true;
      _message = null;
    });
    try {
      final pdf = await renderPdf(sample);
      final said = await ref
          .read(backupFilesProvider)
          .saveFile('${fileSlug(sample.title).toLowerCase()}-sampler.pdf', pdf, kind: FileKind.pdf, origin: origin);
      if (mounted) setState(() => _message = said);
    } on Object catch (e) {
      if (mounted) setState(() => _message = e is PdfCannotDraw ? '$e' : 'The sampler could not be made: $e');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sample = _sample;
    const ink = Color(0xFFF4EEDF);
    return Scaffold(
      backgroundColor: const Color(0xFF1B1916),
      body: SafeArea(
        child: Column(
          children: [
            Row(
              children: [
                const SizedBox(width: 16),
                Expanded(
                  child: Text('The sampler', style: vaultHeading(context, size: 18, color: ink, weight: 700)),
                ),
                IconButton(
                  tooltip: 'Close',
                  color: ink,
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(
                'The opening of your book as a reader’s sample, to send to a beta reader, a writing group or an agent.',
                style: vaultText(context, size: 14, color: ink.withValues(alpha: 0.75)),
              ),
            ),
            Expanded(
              child: sample == null
                  ? const Center(child: CircularProgressIndicator())
                  : sample.chapterCount == 0
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Text(
                          'Nothing to sample yet. Once a chapter has words in it, its opening is set here as pages.',
                          textAlign: TextAlign.center,
                          style: vaultText(context, size: 17, color: ink.withValues(alpha: 0.8)),
                        ),
                      ),
                    )
                  : _Pages(pages: samplerPages(sample), controller: _pages, onPage: (i) => setState(() => _at = i)),
            ),
            if (sample != null && sample.chapterCount > 0) ...[
              _Dots(count: samplerPages(sample).length, at: _at),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                child: Text(
                  _whatIsInIt(sample),
                  textAlign: TextAlign.center,
                  style: vaultText(context, size: 14, color: ink.withValues(alpha: 0.8)),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFE8C46A),
                    foregroundColor: const Color(0xFF1B1916),
                    minimumSize: const Size.fromHeight(48),
                  ),
                  onPressed: _working ? null : () => _make(sample),
                  icon: _working
                      ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.picture_as_pdf_outlined),
                  label: const Text('Make the PDF'),
                ),
              ),
              if (_message != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: Text(
                    _message!,
                    textAlign: TextAlign.center,
                    style: vaultText(context, size: 13, color: ink.withValues(alpha: 0.8)),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

/// What the sample holds, said in a line: its chapters, its words, and how long it takes to read.
String _whatIsInIt(Compiled sample) {
  final n = sample.chapterCount;
  final minutes = (sample.wordCount / _readingSpeed).ceil().clamp(1, 999);
  final words = sample.wordCount.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  return 'A title page, ${n == 1 ? 'the first chapter' : 'the first $n chapters'} · $words words · '
      'about $minutes ${minutes == 1 ? 'minute' : 'minutes'} to read';
}

class _Pages extends StatelessWidget {
  const _Pages({required this.pages, required this.controller, required this.onPage});

  final List<List<Block>> pages;
  final PageController controller;
  final ValueChanged<int> onPage;

  @override
  Widget build(BuildContext context) => PageView.builder(
    controller: controller,
    itemCount: pages.length,
    onPageChanged: onPage,
    itemBuilder: (context, i) => Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
      child: Center(
        child: FittedBox(
          child: Semantics(
            label: i == 0 ? 'The title page' : 'Page ${i + 1} of the sample',
            child: SamplerPage(blocks: pages[i], number: i == 0 ? null : i + 1),
          ),
        ),
      ),
    ),
  );
}

/// A page of the sample as it is printed: ink on paper, the book's type, cut at the foot as a page is.
class SamplerPage extends StatelessWidget {
  const SamplerPage({super.key, required this.blocks, this.number});

  final List<Block> blocks;

  /// The number at its foot (none on the title page).
  final int? number;

  @override
  Widget build(BuildContext context) {
    const ink = Color(0xFF221D17);
    const paper = Color(0xFFFBF8F1);
    TextStyle body({double size = 7.5, bool italic = false, bool bold = false}) => vaultText(
      context,
      size: size,
      color: ink,
    ).copyWith(height: 1.45, fontStyle: italic ? FontStyle.italic : null, fontWeight: bold ? FontWeight.w700 : null);

    Widget block(Block b) => switch (b) {
      HeadingBlock(role: HeadingRole.title) => Padding(
        padding: const EdgeInsets.only(top: 44, bottom: 6),
        child: Text(b.text, textAlign: TextAlign.center, style: body(size: 17, bold: true)),
      ),
      HeadingBlock(role: HeadingRole.subtitle) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(b.text, textAlign: TextAlign.center, style: body(size: 9, italic: true)),
      ),
      HeadingBlock() => Padding(
        padding: const EdgeInsets.only(top: 30, bottom: 14),
        child: Text(b.text, textAlign: TextAlign.center, style: body(size: 12, bold: true)),
      ),
      DividerBlock() => const Padding(
        padding: EdgeInsets.symmetric(vertical: 10),
        child: Center(
          child: SizedBox(width: 40, child: Divider(height: 1, thickness: 0.6, color: Color(0x88221D17))),
        ),
      ),
      ParagraphBlock() => Padding(
        padding: EdgeInsets.only(bottom: b.align == doc.Align.center ? 8 : 3),
        // A paragraph of prose opens indented, as a printed page's do (a space would be eaten by justifying).
        child: Text.rich(
          TextSpan(
            children: [
              if (b.align != doc.Align.center) const WidgetSpan(child: SizedBox(width: 12)),
              TextSpan(text: b.text),
            ],
          ),
          textAlign: b.align == doc.Align.center ? TextAlign.center : TextAlign.justify,
          style: body(italic: b.runs.isNotEmpty && b.runs.first.italic),
        ),
      ),
      _ => const SizedBox.shrink(),
    };

    return Container(
      width: samplerPageSize.width,
      height: samplerPageSize.height,
      decoration: BoxDecoration(
        color: paper,
        borderRadius: BorderRadius.circular(2),
        boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 18, offset: Offset(0, 8))],
      ),
      padding: const EdgeInsets.fromLTRB(36, 30, 36, 18),
      child: Column(
        children: [
          Expanded(
            child: ClipRect(
              child: OverflowBox(
                // The last page, its few lines in the middle of the sheet; every other from the top.
                alignment: blocks.isNotEmpty && blocks.first is DividerBlock ? Alignment.center : Alignment.topCenter,
                minHeight: 0,
                maxHeight: double.infinity,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [for (final b in blocks) block(b)],
                ),
              ),
            ),
          ),
          SizedBox(
            height: 12,
            child: number == null
                ? null
                : Text('$number', style: body(size: 7).copyWith(color: ink.withValues(alpha: 0.6))),
          ),
        ],
      ),
    );
  }
}

class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.at});

  final int count;
  final int at;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisAlignment: MainAxisAlignment.center,
    children: [
      for (var i = 0; i < count; i++)
        AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          margin: const EdgeInsets.symmetric(horizontal: 3),
          width: i == at ? 16 : 6,
          height: 6,
          decoration: BoxDecoration(
            color: const Color(0xFFE8C46A).withValues(alpha: i == at ? 1 : 0.35),
            borderRadius: BorderRadius.circular(3),
          ),
        ),
    ],
  );
}
