import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/novel_art.dart';
import '../../../shared/data/background.dart';
import '../../../shared/data/backup_files.dart';
import '../../../shared/data/providers.dart';
import '../../../shared/domain/characters/glance.dart';
import '../../../shared/domain/characters/named_in.dart';
import '../../../shared/domain/characters/voice.dart';
import '../../../shared/domain/records/relation.dart';
import '../../../shared/domain/records/story_node.dart';
import '../../../shared/domain/stable_sort.dart';
import '../../write/in_chapter.dart' show entryFace;
import '../characters_providers.dart';
import 'cast_card.dart' show castTone;
import 'vault.dart';

/// THEIR CARD: a character as a card to share, the way writers post their people ("meet my protagonist"): their face
/// in an oval, their name, what they are, the facts that fit a card, a tie or two, and a line they say in the book (or
/// the first sentence of their summary), on their own colour, with the book's name. 1080 by 1350, as a post is.
/// Nothing about the novel is changed; the picture is made only when the author asks.

/// A line taken out of its sentence, ended as an excerpt is: “You want to go out there,” Ilse said → “You want to go
/// out there.”
String quoted(String words) {
  final t = words.trim().replaceFirst(RegExp(r'[,;:\s]+$'), '');
  if (t.isEmpty) return t;
  return RegExp(r'[.!?…—–-]$').hasMatch(t) ? t : '$t.';
}

/// The card's size, drawn three times over for the picture.
const characterCardSize = Size(360, 450);

/// What goes on the card.
typedef CharacterCardData = ({GlanceCard card, String book, Color tone, Widget face, String? line});

class CharacterShareCard extends StatelessWidget {
  const CharacterShareCard({super.key, required this.data, this.withLine = true});

  final CharacterCardData data;

  /// Whether a line they say stands on the card (else the summary's first sentence).
  final bool withLine;

  @override
  Widget build(BuildContext context) {
    final look = NovelArt.of(context).bound(data.tone, lift: 0.04, sink: 0.62, tinted: true);
    final ink = look.ink;
    final faint = ink.withValues(alpha: 0.72);
    final card = data.card;
    final quote = withLine && data.line != null && data.line!.isNotEmpty ? data.line : null;
    final words = quote != null ? '“$quote”' : card.summary;
    final facts = card.facts.take(4).map((f) => '${f.label} ${f.value}').join('  ·  ');
    return SizedBox.fromSize(
      size: characterCardSize,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: look.ground, begin: Alignment.topCenter, end: Alignment.bottomCenter),
        ),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: DecoratedBox(
            // A double rule round the edge, as a playing card or a book plate has.
            decoration: BoxDecoration(border: Border.all(color: look.frame.withValues(alpha: 0.9), width: 1.2)),
            child: Padding(
              padding: const EdgeInsets.all(3),
              child: DecoratedBox(
                decoration: BoxDecoration(border: Border.all(color: look.frame.withValues(alpha: 0.45), width: 0.6)),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(18, 14, 18, 12),
                  child: Column(
                    children: [
                      Text(
                        data.book.toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: vaultHeading(context, size: 9.5, color: faint, weight: 600).copyWith(letterSpacing: 2.4),
                      ),
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(3),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: look.frame, width: 1.6),
                        ),
                        child: SizedBox.square(dimension: 132, child: data.face),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        card.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: vaultHeading(context, size: 25, color: ink, weight: 700),
                      ),
                      if (card.epithet.isNotEmpty)
                        Text(
                          card.epithet,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: vaultText(context, size: 14, color: faint, style: FontStyle.italic),
                        ),
                      if (card.what.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          card.what.toUpperCase(),
                          textAlign: TextAlign.center,
                          style: vaultHeading(
                            context,
                            size: 10,
                            color: look.frame,
                            weight: 700,
                          ).copyWith(letterSpacing: 2),
                        ),
                      ],
                      const SizedBox(height: 10),
                      _Rule(color: look.frame),
                      const SizedBox(height: 10),
                      if (facts.isNotEmpty)
                        Text(
                          facts,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: vaultText(context, size: 12.5, color: ink),
                        ),
                      if (card.ties.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          card.ties.take(2).join('  ·  '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: vaultText(context, size: 12, color: faint, style: FontStyle.italic),
                        ),
                      ],
                      const Spacer(),
                      if (words.isNotEmpty)
                        Text(
                          words,
                          maxLines: 4,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: vaultText(
                            context,
                            size: 14.5,
                            color: ink,
                            style: quote != null ? FontStyle.italic : null,
                          ),
                        ),
                      const Spacer(),
                      Text(
                        'NOVEL BUILDER',
                        style: vaultHeading(
                          context,
                          size: 7.5,
                          color: faint.withValues(alpha: 0.6),
                          weight: 600,
                        ).copyWith(letterSpacing: 2.2),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A rule, a diamond, a rule.
class _Rule extends StatelessWidget {
  const _Rule({required this.color});
  final Color color;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisAlignment: MainAxisAlignment.center,
    children: [
      Container(width: 54, height: 0.8, color: color.withValues(alpha: 0.7)),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: Transform.rotate(angle: 0.785, child: Container(width: 6, height: 6, color: color)),
      ),
      Container(width: 54, height: 0.8, color: color.withValues(alpha: 0.7)),
    ],
  );
}

/// The card of [entryId], previewed, with a line of theirs or not, and Share: on a phone the share sheet, on a
/// computer a picture saved where the author chooses.
Future<void> showCharacterCard(BuildContext context, {required CastData cast, required String entryId}) =>
    showDialog<void>(
      context: context,
      builder: (_) => _CharacterCardDialog(cast: cast, entryId: entryId),
    );

class _CharacterCardDialog extends ConsumerStatefulWidget {
  const _CharacterCardDialog({required this.cast, required this.entryId});
  final CastData cast;
  final String entryId;

  @override
  ConsumerState<_CharacterCardDialog> createState() => _CharacterCardDialogState();
}

class _CharacterCardDialogState extends ConsumerState<_CharacterCardDialog> {
  final _card = GlobalKey();
  bool _withLine = true;
  bool _working = false;
  String? _message;
  String? _line;

  @override
  void initState() {
    super.initState();
    _readLine();
  }

  /// The first line they say in the book, read away from the screen.
  void _readLine() {
    final cast = widget.cast;
    final model = cast.model;
    final chapters = stableSorted(
      model.nodes.values.where((n) => n.kind == NodeKind.chapter || n.kind == NodeKind.scene),
      (a, b) => (model.order.position[a.id] ?? 0) - (model.order.position[b.id] ?? 0),
    ).map((n) => n.id).toList();
    final names = namesToFind(cast.entries, cast.profiles)[widget.entryId] ?? const <String>[];
    if (chapters.isEmpty || names.isEmpty) return;
    final stored = ref.read(characterServiceProvider).storedChapters(cast.novelId);
    ref
        .read(runAsideProvider)(spokenJob(stored, chapters, names))
        .then(
          (lines) {
            // A line of a sentence or more, not an exclamation: the first that says something.
            final good = lines.where((l) => l.words.split(' ').length >= 4).firstOrNull ?? lines.firstOrNull;
            if (mounted && good != null) setState(() => _line = quoted(good.words));
          },
          onError: (Object e, StackTrace s) {
            FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'characters'));
          },
        );
  }

  CharacterCardData _data(BuildContext context) {
    final cast = widget.cast;
    final entry = cast.entries.firstWhere((e) => e.id == widget.entryId);
    final profile = cast.profiles[entry.id];
    return (
      card: glanceOf(
        entry,
        profile: profile,
        what: 'Character',
        relations: [for (final r in cast.snapshot.rows('characterRelations')) CharacterRelation(r)],
        names: {for (final e in cast.entries) e.id: e.name.trim()},
      ),
      book: cast.novelTitle,
      tone: castTone(entry.id),
      face: entryFace(context, entry: entry, profile: profile, size: 132),
      line: _line,
    );
  }

  Future<void> _share(String name) async {
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
      final slug = name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-').replaceAll(RegExp(r'^-|-$'), '');
      final said = await ref
          .read(backupFilesProvider)
          .saveFile(
            '${slug.isEmpty ? 'character' : slug}-card.png',
            png!.buffer.asUint8List(),
            kind: FileKind.png,
            origin: origin,
          );
      if (mounted) setState(() => _message = said);
    } on Object catch (e) {
      if (mounted) setState(() => _message = 'The picture could not be made: $e');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data(context);
    final scheme = Theme.of(context).colorScheme;
    return AlertDialog(
      title: Text('${data.card.name}’s card', style: vaultHeading(context, size: 18, weight: 700)),
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
                  aspectRatio: characterCardSize.aspectRatio,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: FittedBox(
                      child: RepaintBoundary(
                        key: _card,
                        child: CharacterShareCard(data: data, withLine: _withLine),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            if (_line != null)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('A line they say'),
                subtitle: const Text('Their own words from your chapters, else their summary'),
                value: _withLine,
                onChanged: (v) => setState(() => _withLine = v),
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
          onPressed: _working ? null : () => _share(data.card.name),
          icon: const Icon(Icons.ios_share),
          label: const Text('Share'),
        ),
      ],
    );
  }
}
