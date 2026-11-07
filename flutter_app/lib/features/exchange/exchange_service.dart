import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/backup_files.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/exchange/compile.dart';
import '../../shared/domain/exchange/import_parse.dart';
import '../../shared/domain/exchange/import_structure.dart';
import '../../shared/domain/exchange/render_docx.dart';
import '../../shared/domain/exchange/render_pdf.dart';
import '../../shared/domain/exchange/render_text.dart';
import '../../shared/domain/manuscript/board.dart';
import '../../shared/domain/manuscript/outline.dart' show ImportItem;
import '../../shared/domain/records/novel.dart';
import '../../shared/domain/records/story_node.dart';
import '../write/data/manuscript_service.dart';
import '../write/write_providers.dart' show manuscriptServiceProvider;

/// The formats a manuscript can be exported in, as the original app offers them.
enum ExportFormat {
  docx('Word (.docx)', 'Word document', FileKind.docx),
  pdf('PDF (.pdf)', 'PDF', FileKind.pdf),
  md('Markdown (.md)', 'Markdown', FileKind.markdown),
  txt('Plain text (.txt)', 'text', FileKind.text),
  html('Web page (.html)', 'web page', FileKind.html);

  const ExportFormat(this.label, this.noun, this.kind);
  final String label;

  /// "Export Word document".
  final String noun;
  final FileKind kind;
}

/// Bringing manuscripts in and taking them out in standard formats. Everything is made on the device; nothing is sent
/// anywhere: a file goes only where the author chooses. A manuscript export is the text (and whatever the author ticks
/// in); the full backup of a novel is Library → Export backup.
class ExchangeService {
  ExchangeService(this.store, this.manuscript);

  final NovelStore store;
  final ManuscriptService manuscript;

  /// The export document for the given choices. Read-only.
  Compiled compile(String projectId, ExportOptions options) {
    final snapshot = store.load(projectId) ?? (throw StateError('That novel is no longer in the library.'));
    return compileNovel(snapshot, options);
  }

  /// The parts of the book an export can be limited to: volumes, acts, arcs and chapters, in reading order.
  List<TreeItem> scopes(String projectId) => [
    for (final item in flattenTree(buildTree(manuscript.nodes(projectId))))
      if (item.node.kind != NodeKind.scene) item,
  ];

  /// The file's bytes. Throws [PdfCannotDraw] when a PDF would lose letters.
  Future<Uint8List> render(Compiled compiled, ExportFormat format) async => switch (format) {
    ExportFormat.docx => renderDocx(compiled),
    ExportFormat.pdf => await renderPdf(compiled),
    ExportFormat.md => Uint8List.fromList(utf8.encode(renderMarkdown(compiled))),
    ExportFormat.txt => Uint8List.fromList(utf8.encode(renderText(compiled))),
    ExportFormat.html => Uint8List.fromList(utf8.encode(renderHtml(compiled))),
  };

  /// "The Ember Crown.docx", or "The Ember Crown - Book One.docx" for one part: safe on any file system.
  static String fileName(Novel novel, ExportFormat format, {String? part}) {
    String safe(String s) => s.trim().replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1F]'), '').replaceAll(RegExp(r'\s+'), ' ');
    final base = safe(novel.title).isEmpty ? 'Untitled novel' : safe(novel.title);
    final scope = part == null || safe(part).isEmpty ? '' : ' - ${safe(part)}';
    return '$base$scope.${format.kind.extension}';
  }

  /// Reads a manuscript file. Throws [ImportException] with a reason; nothing is added either way.
  List<ImportBlock> read(String fileName, List<int> bytes) => parseFile(fileName, bytes);

  /// Adds an imported structure to the manuscript, after everything under [parentId], in one transaction. Returns the
  /// ids created, in reading order.
  List<String> importNodes(String projectId, String? parentId, List<ImportNode> nodes) =>
      manuscript.importTree(projectId, parentId, [for (final n in nodes) _item(n)]);

  static ImportItem _item(ImportNode node) => ImportItem(
    kind: node.kind,
    title: node.title,
    doc: toDoc(node.blocks),
    children: [for (final c in node.children) _item(c)],
  );
}

final exchangeServiceProvider = Provider<ExchangeService>(
  (ref) => ExchangeService(ref.watch(novelStoreProvider), ref.watch(manuscriptServiceProvider)),
);
