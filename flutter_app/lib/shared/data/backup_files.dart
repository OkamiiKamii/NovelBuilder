import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Where backup files come from and go to. Only ever where the author chooses: nothing is uploaded on its own.
abstract interface class BackupFiles {
  /// Lets the author choose a backup file. Null when they cancel.
  Future<({String name, String text})?> pickBackup();

  /// Lets the author choose where a backup goes. Returns what happened in words, or null when they cancel.
  Future<String?> saveBackup(String fileName, String text, {Rect? origin});

  /// Lets the author choose where a table goes (a CSV file). Null when they cancel.
  Future<String?> saveCsv(String fileName, String text, {Rect? origin});

  /// Lets the author choose a picture (a portrait). Null when they cancel.
  Future<({String name, Uint8List bytes})?> pickImage();

  /// Lets the author choose a manuscript to import (.txt, .md, .docx, .rtf). Null when they cancel.
  Future<({String name, Uint8List bytes})?> pickManuscript();

  /// Lets the author choose where a file goes (a Word document, a PDF, a picture of a view). Null when they cancel.
  Future<String?> saveFile(String fileName, Uint8List bytes, {required FileKind kind, Rect? origin});
}

/// The kinds of file the app writes besides backups, text and tables: what the save dialog and share sheet are told.
enum FileKind {
  docx(
    'Word documents',
    'docx',
    'org.openxmlformats.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ),
  pdf('PDF documents', 'pdf', 'com.adobe.pdf', 'application/pdf'),
  html('Web pages', 'html', 'public.html', 'text/html'),
  markdown('Markdown', 'md', 'net.daringfireball.markdown', 'text/markdown'),
  text('Text', 'txt', 'public.plain-text', 'text/plain'),
  json('JSON', 'json', 'public.json', 'application/json'),
  csv('Tables', 'csv', 'public.comma-separated-values-text', 'text/csv'),
  png('PNG pictures', 'png', 'public.png', 'image/png'),
  epub('Ebooks', 'epub', 'org.idpf.epub-container', 'application/epub+zip'),
  zip('Zip archives', 'zip', 'public.zip-archive', 'application/zip');

  const FileKind(this.label, this.extension, this.uti, this.mimeType);
  final String label;
  final String extension;
  final String uti;
  final String mimeType;

  XTypeGroup get types =>
      XTypeGroup(label: label, extensions: [extension], uniformTypeIdentifiers: [uti], mimeTypes: [mimeType]);
}

/// The platform's own file pickers. On the Mac and on Windows, a save dialog; on iPhone and Android, which have no save dialog for
/// apps, the system share sheet, where the author picks "Save to Files", a drive, or anywhere else.
class PlatformBackupFiles implements BackupFiles {
  static const _types = XTypeGroup(
    label: 'Novel backups',
    extensions: ['json'],
    uniformTypeIdentifiers: ['public.json', 'public.text'],
    // Android names files by type, and a .novel.json file is often reported as plain text or unknown.
    mimeTypes: ['application/json', 'text/plain', 'application/octet-stream'],
  );

  @override
  Future<({String name, String text})?> pickBackup() async {
    final file = await openFile(acceptedTypeGroups: const [_types]);
    if (file == null) return null;
    return (name: file.name, text: await file.readAsString());
  }

  static const _imageTypes = XTypeGroup(
    label: 'Pictures',
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp'],
    uniformTypeIdentifiers: ['public.image'],
    mimeTypes: ['image/*'],
  );

  @override
  Future<({String name, Uint8List bytes})?> pickImage() async {
    final file = await openFile(acceptedTypeGroups: const [_imageTypes]);
    if (file == null) return null;
    return (name: file.name, bytes: await file.readAsBytes());
  }

  static const _manuscriptTypes = XTypeGroup(
    label: 'Manuscripts',
    extensions: ['txt', 'md', 'markdown', 'docx', 'rtf'],
    uniformTypeIdentifiers: [
      'public.plain-text',
      'net.daringfireball.markdown',
      'org.openxmlformats.wordprocessingml.document',
      'public.rtf',
      'public.text',
    ],
    mimeTypes: [
      'text/plain',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/rtf',
      'text/rtf',
      'application/octet-stream',
    ],
  );

  @override
  Future<({String name, Uint8List bytes})?> pickManuscript() async {
    final file = await openFile(acceptedTypeGroups: const [_manuscriptTypes]);
    if (file == null) return null;
    return (name: file.name, bytes: await file.readAsBytes());
  }

  @override
  Future<String?> saveFile(String fileName, Uint8List bytes, {required FileKind kind, Rect? origin}) =>
      _saveBytes(fileName, bytes, kind.types, kind.mimeType, origin);

  static const _csvTypes = XTypeGroup(
    label: 'Tables',
    extensions: ['csv'],
    uniformTypeIdentifiers: ['public.comma-separated-values-text'],
    mimeTypes: ['text/csv'],
  );

  @override
  Future<String?> saveCsv(String fileName, String text, {Rect? origin}) =>
      _save(fileName, text, _csvTypes, 'text/csv', origin);

  @override
  Future<String?> saveBackup(String fileName, String text, {Rect? origin}) =>
      _save(fileName, text, _types, 'application/json', origin);

  Future<String?> _save(String fileName, String text, XTypeGroup types, String mimeType, Rect? origin) =>
      _saveBytes(fileName, Uint8List.fromList(utf8.encode(text)), types, mimeType, origin);

  Future<String?> _saveBytes(String fileName, Uint8List bytes, XTypeGroup types, String mimeType, Rect? origin) async {
    // On a computer (a Mac, or Windows) the system's Save dialog; on a phone, the share sheet.
    if (!kIsWeb && (Platform.isMacOS || Platform.isWindows)) {
      final location = await getSaveLocation(suggestedName: fileName, acceptedTypeGroups: [types]);
      if (location == null) return null;
      await File(location.path).writeAsBytes(bytes, flush: true);
      return 'Saved to ${location.path}';
    }
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}${Platform.pathSeparator}$fileName');
    await file.writeAsBytes(bytes, flush: true);
    final result = await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path, mimeType: mimeType)],
        sharePositionOrigin: origin,
      ),
    );
    return switch (result.status) {
      ShareResultStatus.success => 'Handed to ${result.raw.isEmpty ? 'the app you chose' : result.raw}',
      ShareResultStatus.dismissed => null,
      ShareResultStatus.unavailable => 'Prepared; your device did not say where it went',
    };
  }
}
