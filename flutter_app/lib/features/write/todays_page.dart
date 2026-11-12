import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme/book_faces.dart';
import '../../core/format.dart';
import '../../shared/data/backup_files.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/analytics/day_book.dart';
import '../../shared/domain/analytics/progress.dart';
import '../../shared/domain/manuscript/outline.dart';
import '../../shared/domain/manuscript/prose.dart';
import '../characters/widgets/vault.dart';
import 'day_book.dart' show carryOnNode;
import 'fresh_ink.dart';
import 'write_providers.dart';

/// What today's page says: the novel, the day, the words and the goal, the days in a row and the last week, the page
/// written in, and (only when the author asks for it) a line written today.
typedef TodaysPage = ({
  String novel,
  String author,
  DateTime day,
  int today,
  int? goal,
  int streak,
  List<BookDay> week,
  String? chapter,
  int total,
  String? line,
});

/// The first sentence of [paragraph], at most [max] letters, cut at a word.
String firstSentence(String paragraph, {int max = 150}) {
  final t = paragraph.trim().replaceAll(RegExp(r'\s+'), ' ');
  final end = RegExp(r'[.!?…]["”’)]*(\s|$)').firstMatch(t);
  var s = end == null ? t : t.substring(0, end.end).trim();
  if (s.length > max) {
    final cut = s.lastIndexOf(' ', max - 1);
    s = '${s.substring(0, cut > 40 ? cut : max - 1).trimRight()}…';
  }
  return s;
}

/// The last line written today in [nodeId]: the last paragraph in today's ink, its first sentence. Null when none.
String? lineWrittenToday(WidgetRef ref, String novelId, String nodeId, DateTime now) {
  final store = ref.read(novelStoreProvider);
  final saved = store.row(novelId, 'chapterContents', nodeId);
  final texts = blockTexts(saved?['doc']);
  final before = textAtDayStart(
    node: store.row(novelId, 'chapters', nodeId),
    saved: saved,
    revisions: ref.read(manuscriptServiceProvider).revisions(novelId, nodeId),
    dayStart: DateTime(now.year, now.month, now.day),
  );
  final fresh = freshParagraphs(texts, before).toList()..sort();
  if (fresh.isEmpty) return null;
  final line = firstSentence(texts[fresh.last]);
  return line.isEmpty ? null : line;
}

TodaysPage todaysPageOf(WidgetRef ref, String novelId, {required bool withLine, DateTime? now}) {
  final at = now ?? DateTime.now();
  final store = ref.read(novelStoreProvider);
  final nodes = ref.read(outlineProvider);
  final book = dayBookOf([for (final r in store.rowsIn(novelId, 'writingSessions')) WritingSession(r)], at);
  final novel = store.novel(novelId);
  final next = nodes.any((n) => isDocument(n.kind))
      ? carryOnNode(nodes, ref.read(settingsStoreProvider).read('write.lastNode.$novelId'))
      : null;
  return (
    novel: (novel?.title.trim().isEmpty ?? true) ? 'Untitled novel' : novel!.title.trim(),
    author: novel?.author.trim() ?? '',
    day: at,
    today: book.today,
    goal: ref.read(manuscriptServiceProvider).wordGoals(novelId).daily,
    streak: book.streak,
    week: book.days.where((d) => !d.ahead).toList().reversed.take(7).toList().reversed.toList(),
    chapter: next?.displayTitle,
    total: nodes.fold(0, (a, n) => a + n.wordCount),
    line: withLine && next != null ? lineWrittenToday(ref, novelId, next.id, at) : null,
  );
}

const _weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// The size the card is laid out at; the picture is made at three times it (1080 × 1350, a portrait post).
const todaysPageSize = Size(360, 450);

/// TODAY'S PAGE: the day's writing as a card to share, the way writers post their counts: ink on dark paper, the
/// words written today large over a ring that closes on the goal, the days in a row and the last week as ink marks,
/// the novel and the page written in, and a line written today only when the author chooses to include one.
class TodaysPageCard extends StatelessWidget {
  const TodaysPageCard({super.key, required this.page});
  final TodaysPage page;

  @override
  Widget build(BuildContext context) {
    final faces = BookFaces.of(context);
    const paper = Color(0xFF14161F);
    const gold = Color(0xFFF2B33D);
    const ink = Color(0xFFF4EFE4);
    const soft = Color(0xFFB9B3A6);
    final day = page.day;
    final date = '${_weekdays[day.weekday - 1]}, ${_months[day.month - 1]} ${day.day}';
    final goal = page.goal;
    final reached = goal != null && goal > 0 && page.today >= goal;
    TextStyle heading(double size, Color color, {double spacing = 0.12}) => TextStyle(
      fontFamily: faces.heading,
      fontSize: size,
      fontWeight: FontWeight.w700,
      letterSpacing: size * spacing,
      color: color,
      height: 1.1,
    );
    TextStyle text(double size, Color color, {FontStyle? style}) =>
        TextStyle(fontFamily: faces.text, fontSize: size, color: color, fontStyle: style, height: 1.3);
    return SizedBox.fromSize(
      size: todaysPageSize,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          color: paper,
          gradient: RadialGradient(center: Alignment(0, -0.35), radius: 1.1, colors: [Color(0xFF232637), paper]),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(26, 24, 26, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('TODAY AT THE DESK', style: heading(10.5, gold, spacing: 0.22)),
              const SizedBox(height: 3),
              Text(date, style: text(13, soft)),
              // The room left over shared above the day's words and below the week, so they sit in the middle.
              const Spacer(),
              // The day's words over the ring of the goal.
              Center(
                child: SizedBox.square(
                  dimension: 150,
                  child: CustomPaint(
                    painter: _Ring(
                      part: goal == null || goal <= 0 ? null : (page.today / goal).clamp(0.0, 1.0),
                      ink: gold,
                    ),
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          FittedBox(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 18),
                              child: Text(formatNumber(math.max(0, page.today)), style: heading(44, ink, spacing: 0)),
                            ),
                          ),
                          Text(
                            goal == null || goal <= 0
                                ? 'words today'
                                : reached
                                ? 'goal of ${formatNumber(goal)} met'
                                : 'of ${formatNumber(goal)} words',
                            style: text(12.5, soft),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Text(
                page.streak >= 2
                    ? '${page.streak} days in a row'
                    : page.streak == 1
                    ? 'Written today'
                    : 'A page at a time',
                textAlign: TextAlign.center,
                style: heading(15, ink, spacing: 0.06),
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (final d in page.week)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: Column(
                        children: [
                          SizedBox.square(dimension: 18, child: CustomPaint(painter: _Blot(d, page.week, gold))),
                          const SizedBox(height: 2),
                          Text(_weekdays[_weekdayOf(d.key) - 1][0], style: text(9.5, soft)),
                        ],
                      ),
                    ),
                ],
              ),
              const Spacer(),
              if (page.line != null) ...[
                Text(
                  '“${page.line}”',
                  textAlign: TextAlign.center,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: text(14, ink, style: FontStyle.italic),
                ),
                const SizedBox(height: 10),
              ],
              Container(height: 1, color: gold.withValues(alpha: 0.35)),
              const SizedBox(height: 10),
              Text(
                page.novel,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: heading(15, ink, spacing: 0.08),
              ),
              const SizedBox(height: 2),
              Text(
                [
                  if (page.author.isNotEmpty) page.author,
                  if (page.chapter != null) page.chapter!,
                  '${formatNumber(page.total)} words so far',
                ].join(' · '),
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: text(11.5, soft),
              ),
              const SizedBox(height: 8),
              Text('#amwriting', textAlign: TextAlign.center, style: heading(9.5, gold, spacing: 0.16)),
            ],
          ),
        ),
      ),
    );
  }
}

int _weekdayOf(String key) => parseDay(key).weekday;

class _Ring extends CustomPainter {
  _Ring({required this.part, required this.ink});

  /// How far to the goal (null: no goal set, a quiet full ring).
  final double? part;
  final Color ink;

  @override
  void paint(Canvas canvas, Size size) {
    final r = Rect.fromCircle(center: size.center(Offset.zero), radius: size.shortestSide / 2 - 6);
    canvas.drawArc(
      r,
      0,
      math.pi * 2,
      false,
      Paint()
        ..color = ink.withValues(alpha: part == null ? 0.4 : 0.16)
        ..style = PaintingStyle.stroke
        ..strokeWidth = part == null ? 2 : 8,
    );
    final p = part;
    if (p != null && p > 0) {
      canvas.drawArc(
        r,
        -math.pi / 2,
        math.pi * 2 * p,
        false,
        Paint()
          ..color = ink
          ..style = PaintingStyle.stroke
          ..strokeWidth = 8
          ..strokeCap = StrokeCap.round,
      );
    }
  }

  @override
  bool shouldRepaint(_Ring old) => old.part != part || old.ink != ink;
}

class _Blot extends CustomPainter {
  _Blot(this.day, this.week, this.ink);
  final BookDay day;
  final List<BookDay> week;
  final Color ink;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.shortestSide / 2;
    if (!day.written) {
      canvas.drawCircle(
        c,
        r * 0.35,
        Paint()
          ..color = ink.withValues(alpha: 0.35)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.2,
      );
      return;
    }
    final most = math.max(1, week.fold(0, (m, d) => math.max(m, d.words)));
    final share = math.sqrt(day.words / most).clamp(0.0, 1.0);
    canvas.drawCircle(c, r * (0.45 + 0.5 * share), Paint()..color = ink.withValues(alpha: 0.45 + 0.55 * share));
  }

  @override
  bool shouldRepaint(_Blot old) => old.day != day || old.ink != ink;
}

/// The card, previewed, with the choice of including a line written today, and Share: on a phone the share sheet,
/// on a computer a picture saved where the author chooses. Nothing about the novel is changed.
Future<void> showTodaysPage(BuildContext context, WidgetRef ref, String novelId) => showDialog<void>(
  context: context,
  builder: (_) => _TodaysPageDialog(novelId: novelId),
);

class _TodaysPageDialog extends ConsumerStatefulWidget {
  const _TodaysPageDialog({required this.novelId});
  final String novelId;

  @override
  ConsumerState<_TodaysPageDialog> createState() => _TodaysPageDialogState();
}

class _TodaysPageDialogState extends ConsumerState<_TodaysPageDialog> {
  final _card = GlobalKey();
  bool _line = false;
  bool _working = false;
  String? _message;

  Future<void> _share() async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    setState(() {
      _working = true;
      _message = null;
    });
    try {
      final boundary = _card.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 3);
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      final now = DateTime.now();
      final name = 'todays-page-${dayOf(now)}.png';
      final said = await ref
          .read(backupFilesProvider)
          .saveFile(name, png!.buffer.asUint8List(), kind: FileKind.png, origin: origin);
      if (mounted) setState(() => _message = said);
    } on Object catch (e) {
      if (mounted) setState(() => _message = 'The picture could not be made: $e');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final page = todaysPageOf(ref, widget.novelId, withLine: _line);
    final scheme = Theme.of(context).colorScheme;
    return AlertDialog(
      title: Text('Today’s page', style: vaultHeading(context, size: 18, weight: 700)),
      contentPadding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 300),
                child: AspectRatio(
                  aspectRatio: todaysPageSize.aspectRatio,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: FittedBox(
                      child: RepaintBoundary(
                        key: _card,
                        child: TodaysPageCard(page: page),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Include a line I wrote today'),
              subtitle: Text(
                page.line == null && _line ? 'Nothing written today on this page yet' : 'Your own words, quoted',
              ),
              value: _line,
              onChanged: (v) => setState(() => _line = v),
            ),
            if (_message != null)
              Text(
                _message!,
                style: TextStyle(color: scheme.onSurfaceVariant),
                textAlign: TextAlign.center,
              ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Close')),
        FilledButton.icon(
          onPressed: _working ? null : _share,
          icon: const Icon(Icons.ios_share),
          label: const Text('Share'),
        ),
      ],
    );
  }
}
