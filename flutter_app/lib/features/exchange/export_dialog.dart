import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/widgets/form_dialog.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/exchange/compile.dart';
import '../../shared/domain/exchange/render_pdf.dart';
import 'exchange_service.dart';

const _switches = <(String, String, String)>[
  ('manuscript', 'Manuscript content', 'The text of chapters and scenes'),
  ('titles', 'Chapter titles & scene break dividers', 'Title page, volume and chapter headings, * * * between scenes'),
  ('notes', 'Author private notes', 'Your notes on chapters, scenes and codex entries'),
  ('lore', 'Worldbuilding & lore profiles', 'Codex entries, as an appendix'),
  ('planning', 'Chapter/scene planning sheets', 'Objectives, summaries, beats, dynamics'),
  ('history', 'Draft revision history', 'The log of saved versions and the text of alternate drafts'),
];

bool _get(ExportOptions o, String key) => switch (key) {
  'manuscript' => o.manuscript,
  'titles' => o.titles,
  'notes' => o.notes,
  'lore' => o.lore,
  'planning' => o.planning,
  _ => o.history,
};

ExportOptions _set(ExportOptions o, String key, bool on) => switch (key) {
  'manuscript' => o.copyWith(manuscript: on),
  'titles' => o.copyWith(titles: on),
  'notes' => o.copyWith(notes: on),
  'lore' => o.copyWith(lore: on),
  'planning' => o.copyWith(planning: on),
  _ => o.copyWith(history: on),
};

Future<void> showExportManuscriptDialog(BuildContext context, String novelId) => showDialog<void>(
  context: context,
  builder: (_) => ExportManuscriptDialog(novelId: novelId),
);

/// Exporting the manuscript in a standard format: the clean text for readers, a complete bible with planning, notes
/// and lore, or anything between, for the whole book or one part. It is made on this device and goes only where the
/// author chooses. It is never a backup of the novel, and says so.
class ExportManuscriptDialog extends ConsumerStatefulWidget {
  const ExportManuscriptDialog({super.key, required this.novelId});
  final String novelId;

  @override
  ConsumerState<ExportManuscriptDialog> createState() => _ExportManuscriptDialogState();
}

class _ExportManuscriptDialogState extends ConsumerState<ExportManuscriptDialog> {
  var _format = ExportFormat.docx;
  var _options = ExportOptions.reader;
  String? _scopeId;
  bool _working = false;
  ({String text, bool error})? _message;
  Compiled? _compiled;
  ExportOptions? _compiledFor;

  Compiled _compile() {
    final options = _options.copyWith(scopeId: () => _scopeId);
    if (_compiled == null || _compiledFor != options) {
      _compiled = ref.read(exchangeServiceProvider).compile(widget.novelId, options);
      _compiledFor = options;
    }
    return _compiled!;
  }

  Future<void> _export(Compiled compiled, String? part) async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    final novel = ref.read(novelStoreProvider).novel(widget.novelId);
    if (novel == null) return;
    setState(() {
      _working = true;
      _message = null;
    });
    try {
      final bytes = await ref.read(exchangeServiceProvider).render(compiled, _format);
      final name = ExchangeService.fileName(novel, _format, part: part);
      final result = await ref.read(backupFilesProvider).saveFile(name, bytes, kind: _format.kind, origin: origin);
      if (mounted && result != null) {
        setState(() => _message = (text: '$result. Nothing in the novel changed.', error: false));
      }
    } on PdfCannotDraw catch (e) {
      if (mounted) setState(() => _message = (text: '$e', error: true));
    } on Object catch (e) {
      if (mounted) {
        setState(() => _message = (text: 'The export could not be made: $e. Nothing has changed.', error: true));
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scopes = ref.read(exchangeServiceProvider).scopes(widget.novelId);
    if (_scopeId != null && !scopes.any((s) => s.node.id == _scopeId)) _scopeId = null;
    final compiled = _compile();
    final nothing = compiled.blocks.isEmpty;
    final pdfMissingLetters = _format == ExportFormat.pdf ? pdfMissing(pdfTextOf(compiled)) : const <String>[];
    final part = scopes.where((s) => s.node.id == _scopeId).firstOrNull?.node.displayTitle;
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    Widget preset(String label, ExportOptions preset) {
      final on = _options.sameSwitches(preset);
      return on
          ? FilledButton.tonal(onPressed: null, child: Text(label))
          : OutlinedButton(onPressed: () => setState(() => _options = preset), child: Text(label));
    }

    return FormDialog(
      title: 'Export manuscript',
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Format', style: theme.textTheme.labelLarge),
          RadioGroup<ExportFormat>(
            groupValue: _format,
            onChanged: (f) => setState(() {
              _format = f ?? _format;
              _message = null;
            }),
            child: Column(
              children: [
                for (final f in ExportFormat.values)
                  RadioListTile<ExportFormat>(
                    value: f,
                    title: Text(f.label),
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text('Start from a preset', style: theme.textTheme.labelLarge),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              preset('Clean reader manuscript', ExportOptions.reader),
              preset('Complete bible', ExportOptions.bible),
            ],
          ),
          const SizedBox(height: 12),
          Text('Include', style: theme.textTheme.labelLarge),
          for (final (key, label, hint) in _switches)
            CheckboxListTile(
              value: _get(_options, key),
              onChanged: (on) => setState(() => _options = _set(_options, key, on ?? false)),
              title: Text(label),
              subtitle: Text(hint),
              dense: true,
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
            ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String?>(
            initialValue: _scopeId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Which part'),
            items: [
              const DropdownMenuItem<String?>(value: null, child: Text('Whole manuscript')),
              for (final s in scopes)
                DropdownMenuItem<String?>(
                  value: s.node.id,
                  child: Text('${'   ' * s.depth}${s.node.displayTitle}', overflow: TextOverflow.ellipsis),
                ),
            ],
            onChanged: (id) => setState(() => _scopeId = id),
          ),
          const SizedBox(height: 12),
          Semantics(
            liveRegion: true,
            child: Text(
              nothing
                  ? 'Nothing is selected to export.'
                  : '${plural(compiled.chapterCount, 'chapter')}${_options.manuscript ? ' · ${plural(compiled.wordCount, 'word')} of manuscript' : ' · no manuscript text'}',
            ),
          ),
          if (!nothing) _ExportPreview(compiled: compiled),
          if (pdfMissingLetters.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              '⚠ The PDF fonts cannot draw some characters in this text (${pdfMissingLetters.take(8).join(' ')}). '
              'Choose Word or a web page instead: they keep every character.',
              style: TextStyle(color: theme.colorScheme.error),
            ),
          ],
          const SizedBox(height: 8),
          Text(
            'A manuscript export holds only what is ticked above. It is not a backup: to keep or move the whole novel, '
            'use Library → Export backup.',
            style: muted,
          ),
          if (_message case final m?) ...[
            const SizedBox(height: 8),
            Semantics(
              liveRegion: true,
              child: Text(m.text, style: m.error ? TextStyle(color: theme.colorScheme.error) : null),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Close')),
        FilledButton(
          onPressed: nothing || _working || pdfMissingLetters.isNotEmpty ? null : () => _export(compiled, part),
          child: Text(_working ? 'Exporting…' : 'Export ${_format.noun}'),
        ),
      ],
    );
  }
}

/// The start of the export, as it will read, before anything is made: headings, paragraphs, fields and lists in
/// order. The full book, drawn page by page, is in the reader.
class _ExportPreview extends StatelessWidget {
  const _ExportPreview({required this.compiled});
  final Compiled compiled;

  static const _shown = 60;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final blocks = compiled.blocks.take(_shown).toList();
    Widget line(Block b) => switch (b) {
      HeadingBlock(:final text, :final level) => Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 4),
        child: Text(text, style: level <= 1 ? theme.textTheme.titleMedium : theme.textTheme.titleSmall),
      ),
      ParagraphBlock(:final runs, :final quote) => Padding(
        padding: EdgeInsets.only(bottom: 6, left: quote ? 16 : 0),
        child: Text.rich(
          TextSpan(
            children: [
              for (final r in runs)
                TextSpan(
                  text: r.text,
                  style: TextStyle(
                    fontWeight: r.bold ? FontWeight.bold : null,
                    fontStyle: r.italic ? FontStyle.italic : null,
                    decoration: TextDecoration.combine([
                      if (r.underline) TextDecoration.underline,
                      if (r.strike) TextDecoration.lineThrough,
                    ]),
                  ),
                ),
            ],
          ),
        ),
      ),
      DividerBlock() => const Padding(
        padding: EdgeInsets.symmetric(vertical: 6),
        child: Center(child: Text('* * *')),
      ),
      FieldBlock(:final label, :final text) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Text('$label: $text'),
      ),
      ListBlock(:final items, :final ordered) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text([for (final (i, t) in items.indexed) '${ordered ? '${i + 1}.' : '•'} $t'].join('\n')),
      ),
    };
    return ExpansionTile(
      title: const Text('Preview'),
      subtitle: Text(
        compiled.blocks.length > _shown ? 'The first $_shown of ${compiled.blocks.length} blocks' : 'All of it',
        style: muted,
      ),
      tilePadding: EdgeInsets.zero,
      childrenPadding: const EdgeInsets.only(bottom: 8),
      children: [
        Container(
          constraints: const BoxConstraints(maxHeight: 260),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            border: Border.all(color: theme.colorScheme.outlineVariant),
            borderRadius: BorderRadius.circular(8),
          ),
          child: SingleChildScrollView(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [for (final b in blocks) line(b)]),
          ),
        ),
      ],
    );
  }
}
