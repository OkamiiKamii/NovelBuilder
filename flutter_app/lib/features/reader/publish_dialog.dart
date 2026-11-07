import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../shared/data/backup_files.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/exchange/render_book.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/reader/book.dart';
import '../exchange/export_dialog.dart';

enum PublishKind {
  epub('Ebook (EPUB)', 'One file for Apple Books, Kobo, Google Play Books, and Kindle through Send to Kindle.'),
  serialAll(
    'Web serial: every chapter',
    'Each chapter as its own file, with its heading and your notes before and after, in one zip.',
  ),
  serialOne('Web serial: one chapter', 'One chapter, ready to paste into a serial site or save as a file.');

  const PublishKind(this.label, this.hint);
  final String label;
  final String hint;
}

String _safe(String s) => s.trim().replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1F]'), '').replaceAll(RegExp(r'\s+'), ' ');

Future<void> showPublishDialog(
  BuildContext context, {
  required String novelId,
  required JsonMap project,
  required BookSource source,
}) => showDialog<void>(
  context: context,
  builder: (_) => PublishDialog(novelId: novelId, project: project, source: source),
);

/// PREVIEW BEFORE EXPORT: what a publishing file will hold is shown in full (every page in order, what is left out and
/// why) before anything is made, and the reader shows the same book drawn. Made on this device, sent only where the
/// author chooses, from the book as saved; nothing in the novel changes.
class PublishDialog extends ConsumerStatefulWidget {
  const PublishDialog({super.key, required this.novelId, required this.project, required this.source});
  final String novelId;
  final JsonMap project;
  final BookSource source;

  @override
  ConsumerState<PublishDialog> createState() => _PublishDialogState();
}

class _PublishDialogState extends ConsumerState<PublishDialog> {
  var _kind = PublishKind.epub;
  var _format = SerialFormat.html;
  String? _chapterId;
  bool _working = false;
  ({String text, bool error})? _message;

  Book get _book => buildBook(widget.source, _kind == PublishKind.epub ? BookFormat.ebook : BookFormat.serial);

  List<Section> _chapters(Book book) => [
    for (final s in book.sections)
      if (s.kind == SectionKind.chapter) s,
  ];

  Future<void> _save() async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    final book = _book;
    final base = _safe(book.title).isEmpty ? 'Untitled novel' : _safe(book.title);
    setState(() {
      _working = true;
      _message = null;
    });
    try {
      final (String name, Uint8List bytes, FileKind kind, List<OutputNote> notes) = switch (_kind) {
        PublishKind.epub => () {
          final result = renderEpub(
            book,
            identifier: epubIdentifier(widget.project),
            language: str(widget.project['language'], 'en'),
            modified: DateTime.now(),
          );
          return ('$base.epub', result.bytes, FileKind.epub, result.notes);
        }(),
        PublishKind.serialAll => (
          '$base - web serial.zip',
          renderSerialZip(book, _format),
          FileKind.zip,
          const <OutputNote>[],
        ),
        PublishKind.serialOne => () {
          final chapters = _chapters(book);
          final s = chapters.firstWhere((c) => c.id == _chapterId, orElse: () => chapters.first);
          final kind = switch (_format) {
            SerialFormat.html => FileKind.html,
            SerialFormat.markdown => FileKind.markdown,
            SerialFormat.text => FileKind.text,
          };
          return (
            '$base - ${serialFileName(s, chapters.indexOf(s), _format)}',
            Uint8List.fromList(utf8.encode(renderSerialChapter(book, s, _format))),
            kind,
            const <OutputNote>[],
          );
        }(),
      };
      final result = await ref.read(backupFilesProvider).saveFile(name, bytes, kind: kind, origin: origin);
      if (mounted && result != null) {
        setState(
          () => _message = (
            text: ['$result. Nothing in the novel changed.', for (final n in notes) n.text].join(' '),
            error: false,
          ),
        );
      }
    } on BookOutputException catch (e) {
      if (mounted) setState(() => _message = (text: e.message, error: true));
    } on Object catch (e) {
      if (mounted) {
        setState(() => _message = (text: 'The file could not be made: $e. Nothing has changed.', error: true));
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _copy(Book book, Section s) async {
    await Clipboard.setData(ClipboardData(text: renderSerialChapter(book, s, _format)));
    if (mounted) {
      setState(
        () => _message = (
          text: 'Copied "${serialHeading(s)}" as ${_format.label.toLowerCase()}. Nothing in the novel changed.',
          error: false,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final book = _book;
    final chapters = _chapters(book);
    if (_chapterId == null || !chapters.any((c) => c.id == _chapterId)) _chapterId = chapters.firstOrNull?.id;
    final chapter = chapters.where((c) => c.id == _chapterId).firstOrNull;
    final written = chapters.where((c) => c.words > 0).length;
    final pages = switch (_kind) {
      PublishKind.epub => [
        for (final s in book.sections)
          s.kind == SectionKind.contents ? 'Contents' : (s.showsLabel ? '${s.label}: ${s.title}' : s.title),
      ],
      PublishKind.serialAll => [for (final (i, s) in chapters.indexed) serialFileName(s, i, _format)],
      PublishKind.serialOne => [if (chapter != null) serialHeading(chapter)],
    };
    final empty = written == 0;
    return AlertDialog(
      title: const Text('Publish'),
      content: SizedBox(
        width: 560,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              RadioGroup<PublishKind>(
                groupValue: _kind,
                onChanged: (v) {
                  if (!_working && v != null) setState(() => _kind = v);
                },
                child: Column(
                  children: [
                    for (final k in PublishKind.values)
                      RadioListTile<PublishKind>(
                        value: k,
                        title: Text(k.label),
                        subtitle: Text(k.hint),
                        contentPadding: EdgeInsets.zero,
                      ),
                  ],
                ),
              ),
              if (_kind != PublishKind.epub) ...[
                const SizedBox(height: 8),
                DropdownButtonFormField<SerialFormat>(
                  initialValue: _format,
                  decoration: const InputDecoration(labelText: 'Each chapter as'),
                  items: [
                    for (final f in SerialFormat.values)
                      DropdownMenuItem(value: f, child: Text('${f.label} (.${f.extension})')),
                  ],
                  onChanged: (v) => setState(() => _format = v!),
                ),
              ],
              if (_kind == PublishKind.serialOne && chapters.isNotEmpty) ...[
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _chapterId,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Chapter'),
                  items: [
                    for (final c in chapters)
                      DropdownMenuItem(
                        value: c.id,
                        child: Text(serialHeading(c), overflow: TextOverflow.ellipsis),
                      ),
                  ],
                  onChanged: (v) => setState(() => _chapterId = v),
                ),
              ],
              const SizedBox(height: 16),
              Text('What it will hold', style: theme.textTheme.titleSmall),
              const SizedBox(height: 4),
              Text(
                empty
                    ? 'No chapter has text yet: there is nothing to publish. Write a chapter first.'
                    : '${pages.length} ${_kind == PublishKind.epub ? 'pages' : (pages.length == 1 ? 'chapter' : 'chapters')}, '
                          '${formatNumber(book.words)} words of story. Your text goes out exactly as written; '
                          '${_kind == PublishKind.epub ? 'serial notes are left out of an ebook.' : 'your notes before and after each chapter are included.'}',
                style: muted,
              ),
              if (!empty)
                Container(
                  margin: const EdgeInsets.only(top: 8),
                  constraints: const BoxConstraints(maxHeight: 180),
                  decoration: BoxDecoration(
                    border: Border.all(color: theme.colorScheme.outlineVariant),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: ListView(
                    shrinkWrap: true,
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    children: [
                      for (final (i, p) in pages.indexed)
                        ListTile(
                          dense: true,
                          title: Text(p),
                          leading: Text('${i + 1}', style: muted),
                        ),
                    ],
                  ),
                ),
              if (_kind == PublishKind.epub && (book.cover?.startsWith('http') ?? false))
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'The cover is a web address, which this app never fetches, so the ebook opens on its title page instead.',
                    style: muted,
                  ),
                ),
              const SizedBox(height: 12),
              Text(
                'The reader shows this book drawn, page by page: choose its format there to look before you save.',
                style: muted,
              ),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () {
                    Navigator.of(context).pop();
                    showExportManuscriptDialog(context, widget.novelId);
                  },
                  icon: const Icon(Icons.description_outlined),
                  label: const Text('Word, PDF, Markdown, text or a web page…'),
                ),
              ),
              if (_message != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    _message!.text,
                    style: TextStyle(color: _message!.error ? theme.colorScheme.error : null),
                    semanticsLabel: _message!.text,
                  ),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Close')),
        if (_kind == PublishKind.serialOne && chapter != null)
          TextButton(onPressed: empty || _working ? null : () => _copy(book, chapter), child: const Text('Copy')),
        FilledButton(onPressed: empty || _working ? null : _save, child: Text(_working ? 'Making…' : 'Save…')),
      ],
    );
  }
}
