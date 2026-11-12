import 'dart:isolate';
import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/app.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/shared/data/background.dart';
import 'package:novel_builder/shared/data/backup_files.dart';
import 'package:novel_builder/shared/data/database.dart';
import 'package:novel_builder/shared/data/providers.dart';

/// Window sizes used across tests: a phone, a small tablet and a desktop window.
const phone = Size(390, 844);
const tablet = Size(800, 1100);
const desktop = Size(1400, 900);

/// Stands in for the platform's file pickers.
class FakeBackupFiles implements BackupFiles {
  ({String name, String text})? toPick;
  ({String name, Uint8List bytes})? imageToPick;
  ({String name, Uint8List bytes})? manuscriptToPick;
  final saved = <({String name, String text})>[];

  /// Binary files saved (Word, PDF, pictures), with what the save dialog was told they are.
  final savedFiles = <({String name, Uint8List bytes, FileKind kind})>[];

  @override
  Future<({String name, String text})?> pickBackup() async => toPick;

  @override
  Future<({String name, Uint8List bytes})?> pickImage() async => imageToPick;

  @override
  Future<({String name, Uint8List bytes})?> pickManuscript() async => manuscriptToPick;

  @override
  Future<String?> saveFile(String fileName, Uint8List bytes, {required FileKind kind, Rect? origin}) async {
    savedFiles.add((name: fileName, bytes: bytes, kind: kind));
    return 'Saved $fileName';
  }

  @override
  Future<String?> saveCsv(String fileName, String text, {Rect? origin}) => saveBackup(fileName, text);

  @override
  Future<String?> saveBackup(String fileName, String text, {Rect? origin}) async {
    saved.add((name: fileName, text: text));
    return 'Saved $fileName';
  }
}

/// Pumps the whole app at [size], starting at [location], with fresh state and a fresh in-memory library (or [db]).
Future<ProviderContainer> pumpApp(
  WidgetTester tester, {
  Size size = desktop,
  String location = '/',
  AppDatabase? db,
  FakeBackupFiles? files,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final database = db ?? AppDatabase.inMemory();
  if (db == null) addTearDown(database.close);
  final container = ProviderContainer(
    overrides: [
      databaseProvider.overrideWithValue(database),
      backupFilesProvider.overrideWithValue(files ?? FakeBackupFiles()),
      routerProvider.overrideWith((ref) => buildRouter(initialLocation: location)),
      // Work the app does in its own isolate runs here in place: a widget test's clock does not wait for isolates.
      // The same functions run either way (`test/shared/data/background_test.dart` runs one in a real isolate).
      // It is still checked to be sendable to an isolate, as the app would send it: a job that holds a widget or the
      // database fails here as it would on the phone.
      runAsideProvider.overrideWithValue(<R>(R Function() job) async {
        final port = RawReceivePort();
        try {
          port.sendPort.send(job);
        } finally {
          port.close();
        }
        return job();
      }),
    ],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const NovelBuilderApp()));
  await tester.pumpAndSettle();
  return container;
}

/// The location the router is showing.
String currentLocation(ProviderContainer container) =>
    container.read(routerProvider).routerDelegate.currentConfiguration.uri.toString();
