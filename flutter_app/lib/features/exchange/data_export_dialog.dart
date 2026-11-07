import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../core/format.dart';
import '../../core/widgets/form_dialog.dart';
import '../../shared/data/backup_files.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/analytics/charts.dart';
import '../../shared/domain/exchange/records_export.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/story_model.dart';
import '../../shared/domain/progression/track.dart' show whenWords;
import '../../shared/domain/snapshot/novel_snapshot.dart';
import '../../shared/domain/visualize/views.dart';

/// What a view export knows about the view it was opened from.
class ExportedView {
  const ExportedView({
    required this.key,
    required this.filter,
    required this.config,
    required this.keep,
    required this.picture,
  });

  final String key;

  /// The page's shared filters, in the original's shape.
  final JsonMap filter;

  /// What the view shows besides them: its mode, layers, layout.
  final JsonMap config;

  /// Whether the filters keep a record, by id.
  final bool Function(String id) keep;

  /// The view as it is drawn on screen, for a picture.
  final GlobalKey picture;
}

enum _Format {
  png('Picture (PNG)', 'The view as it is shown, with its title, the novel, the filters and the date above it.'),
  pdf('PDF', 'The same picture on a page, ready to print or keep.'),
  json(
    'Records (JSON)',
    'The records, as the app keeps them (every field, with stable ids), narrowed by the filters, with the names of what they point at.',
  ),
  csv('Table (CSV)', 'The same records as tables for a spreadsheet: one table per kind, ids shown as names.');

  const _Format(this.label, this.what);
  final String label;
  final String what;
}

Future<void> showDataExportDialog(BuildContext context, {required CastSource source, ExportedView? view}) =>
    showDialog<void>(
      context: context,
      builder: (_) => DataExportDialog(source: source, view: view),
    );

/// The novel the export reads: its records now, as one snapshot and model.
class CastSource {
  const CastSource(this.snapshot, this.model);
  final NovelSnapshot snapshot;
  final StoryModel model;
}

/// EXPORTING DATA: one view (a picture of it, or its records), or records of the kinds the author picks. Made on this
/// device, saved only where the author chooses. Private notes and secrets are left out unless ticked in. Never a
/// backup, and every file says so.
class DataExportDialog extends ConsumerStatefulWidget {
  const DataExportDialog({super.key, required this.source, this.view});
  final CastSource source;

  /// The view it was opened from; null to choose kinds of record instead.
  final ExportedView? view;

  @override
  ConsumerState<DataExportDialog> createState() => _DataExportDialogState();
}

class _DataExportDialogState extends ConsumerState<DataExportDialog> {
  late _Format _format = widget.view == null ? _Format.json : _Format.png;
  final Set<String> _kinds = {'characters', 'places', 'events', 'threads'};
  bool _private = false;
  bool _secrets = false;
  bool _working = false;
  ({String text, bool error})? _message;

  StoryModel get model => widget.source.model;
  String get title => model.novel.title;
  VisualView? get viewInfo => widget.view == null ? null : viewOf(widget.view!.key);
  List<String> get kinds => widget.view == null
      ? [
          for (final k in recordKinds)
            if (_kinds.contains(k)) k,
        ]
      : (viewData[widget.view!.key] ?? const []);

  List<String> filters() {
    final v = widget.view;
    if (v == null) return const [];
    final words = filterWords(v.filter, model, when: (at) => whenWords(at, model));
    if (v.config['mode'] == 'list') words.add('Shown as a list');
    return words;
  }

  ExportedRecords records() {
    final v = widget.view;
    List<JsonMap>? charts;
    if (v?.key == 'charts') {
      charts = [
        for (final c in analyticsCharts(model, ChartFilter.of(mapOrNull(v!.config['layout']) ?? const {}, model)))
          {
            'key': c.key,
            'title': c.title,
            'uses': c.uses,
            'empty': c.empty,
            'notes': c.notes,
            'table': {'columns': c.columns, 'rows': c.rows},
          },
      ];
    }
    return exportRecords(
      model,
      kinds,
      keep: v?.keep,
      includePrivate: _private,
      secrets: kinds.contains('secrets') && _secrets ? widget.source.snapshot.rows('characterSecrets').toList() : null,
      charts: charts,
    );
  }

  /// The picture of the view with what it is above it: the title, the novel, the filters and the date.
  Future<Uint8List> picture(DateTime at) async {
    final boundary = widget.view!.picture.currentContext?.findRenderObject() as RenderRepaintBoundary?;
    if (boundary == null) throw StateError('The view is not on screen to make a picture of.');
    final size = boundary.size;
    // At most about 40 million pixels, so a long list cannot run the device out of memory.
    final ratio = math.min(2.0, math.sqrt(40e6 / math.max(1, size.width * size.height)));
    final theme = Theme.of(context);
    final local = MaterialLocalizations.of(context);
    final drawing = await boundary.toImage(pixelRatio: ratio);
    final width = drawing.width.toDouble();
    final pad = 24 * ratio;
    TextPainter text(String s, TextStyle style) => TextPainter(
      text: TextSpan(text: s, style: style),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: width - pad * 2);
    final ink = theme.colorScheme.onSurface;
    final heading = text(
      '${viewInfo?.label ?? 'View'}: $title',
      TextStyle(fontSize: 22 * ratio, fontWeight: FontWeight.w600, color: ink),
    );
    final lines = text(
      [
        '$title · ${viewInfo?.label} · exported ${local.formatMediumDate(at)}, ${local.formatTimeOfDay(TimeOfDay.fromDateTime(at))}',
        filters().isEmpty ? 'No filters: everything the view shows.' : 'Filters and settings: ${filters().join('; ')}',
      ].join('\n'),
      TextStyle(fontSize: 13 * ratio, color: theme.colorScheme.onSurfaceVariant),
    );
    final top = pad + heading.height + 6 * ratio + lines.height + pad;
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawRect(Rect.fromLTWH(0, 0, width, top + drawing.height), Paint()..color = theme.colorScheme.surface);
    heading.paint(canvas, Offset(pad, pad));
    lines.paint(canvas, Offset(pad, pad + heading.height + 6 * ratio));
    canvas.drawImage(drawing, Offset(0, top), Paint());
    final framed = await recorder.endRecording().toImage(width.round(), (top + drawing.height).round());
    final png = await framed.toByteData(format: ui.ImageByteFormat.png);
    return png!.buffer.asUint8List();
  }

  Future<void> _export() async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    setState(() {
      _working = true;
      _message = null;
    });
    final at = DateTime.now();
    final what = widget.view?.key ?? 'records';
    String file(String ext) => exportFileName(title, what, at, ext);
    final files = ref.read(backupFilesProvider);
    try {
      String? result;
      switch (_format) {
        case _Format.png:
          result = await files.saveFile(file('png'), await picture(at), kind: FileKind.png, origin: origin);
        case _Format.pdf:
          final png = await picture(at);
          final doc = pw.Document(title: '${viewInfo?.label}: $title', creator: 'Novel Builder');
          final image = pw.MemoryImage(png);
          doc.addPage(
            pw.Page(
              pageFormat: PdfPageFormat.letter.landscape,
              margin: const pw.EdgeInsets.all(36),
              build: (_) => pw.Center(child: pw.Image(image, fit: pw.BoxFit.contain)),
            ),
          );
          result = await files.saveFile(file('pdf'), await doc.save(), kind: FileKind.pdf, origin: origin);
        case _Format.json:
          final data = records();
          final v = widget.view;
          final envelope = {
            'format': v == null ? 'novel-builder/records-export' : 'novel-builder/view-export',
            'version': 1,
            'exportedAt': at.toUtc().toIso8601String(),
            'novel': {'id': model.novel.id, 'title': title},
            if (v != null)
              'view': {
                'key': v.key,
                'label': viewInfo?.label,
                'description': viewInfo?.description,
                'shownAs': v.config['mode'] == 'list' ? 'list' : 'drawing',
              }
            else
              'kinds': kinds,
            'filters': filters(),
            'notABackup': notABackup,
            'leftOut': [
              'The text of chapters and scenes, and everything not of the kinds exported.',
              if (!_private && kinds.any(privateFields.containsKey))
                'Private notes on codex entries, chapters and scenes.',
              if (kinds.contains('secrets') && !_secrets) 'Secrets: they are included only when you choose to.',
              if (filters().isNotEmpty) 'Records the page’s filters leave out.',
            ],
            'names': data.names,
            'records': data.records,
          };
          final bytes = Uint8List.fromList(utf8.encode(const JsonEncoder.withIndent('  ').convert(envelope)));
          result = await files.saveFile(file('json'), bytes, kind: FileKind.json, origin: origin);
          if (result != null) result = '$result: ${plural(data.count, 'record')}';
        case _Format.csv:
          final data = records();
          final heading = [
            widget.view == null ? 'Records of $title' : '${viewInfo?.label}: $title',
            'Exported ${at.toUtc().toIso8601String()}',
            filters().isEmpty ? 'No filters' : 'Filters: ${filters().join('; ')}',
            notABackup,
          ];
          final bytes = Uint8List.fromList(utf8.encode(recordsCsv(data, heading: heading)));
          result = await files.saveFile(file('csv'), bytes, kind: FileKind.csv, origin: origin);
          if (result != null) result = '$result: ${plural(data.count, 'record')}';
      }
      if (mounted && result != null) setState(() => _message = (text: '$result.', error: false));
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
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final v = widget.view;
    final formats = v == null ? const [_Format.json, _Format.csv] : _Format.values;
    final hasPrivate = kinds.any(privateFields.containsKey);
    final hasSecrets = kinds.contains('secrets');
    final words = filters();
    return FormDialog(
      title: v == null ? 'Export records' : 'Export “${viewInfo?.label ?? v.key}”',
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (v == null) ...[
            Text('Which records', style: theme.textTheme.labelLarge),
            for (final k in recordKinds.where((k) => k != 'charts' && k != 'abilities'))
              CheckboxListTile(
                value: _kinds.contains(k),
                onChanged: (on) => setState(() => on == true ? _kinds.add(k) : _kinds.remove(k)),
                title: Text(recordKindWords[k]!.$2),
                dense: true,
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
              ),
            const SizedBox(height: 8),
          ],
          Text('As', style: theme.textTheme.labelLarge),
          RadioGroup<_Format>(
            groupValue: _format,
            onChanged: (f) => setState(() {
              _format = f ?? _format;
              _message = null;
            }),
            child: Column(
              children: [
                for (final f in formats)
                  RadioListTile<_Format>(
                    value: f,
                    title: Text(f.label),
                    subtitle: Text(f.what),
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                  ),
              ],
            ),
          ),
          if (v != null) ...[
            const SizedBox(height: 8),
            Text(
              words.isEmpty
                  ? 'With it: the view’s title, the novel, the date, and no filters (everything the view shows).'
                  : 'With it: the view’s title, the novel, the date, and these filters and settings: ${words.join('; ')}.',
            ),
          ],
          if ((_format == _Format.json || _format == _Format.csv) && hasPrivate)
            CheckboxListTile(
              value: _private,
              onChanged: (on) => setState(() => _private = on ?? false),
              title: const Text('Include private notes (on codex entries, chapters and scenes)'),
              dense: true,
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
            ),
          if ((_format == _Format.json || _format == _Format.csv) && hasSecrets)
            CheckboxListTile(
              value: _secrets,
              onChanged: (on) => setState(() => _secrets = on ?? false),
              title: const Text('Include the secrets themselves'),
              dense: true,
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
            ),
          if (v?.key == 'knowledge' && (_format == _Format.png || _format == _Format.pdf))
            const Text('This view shows secrets: a picture holds what is on screen.'),
          const SizedBox(height: 8),
          Text('This is not a backup. To keep or move the whole novel, use Library → Export backup.', style: muted),
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
          onPressed: _working || kinds.isEmpty ? null : _export,
          child: Text(_working ? 'Exporting…' : 'Export'),
        ),
      ],
    );
  }
}
