import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../core/errors/error_log.dart';
import '../core/widgets/broken_widget.dart';
import '../shared/data/database.dart';
import '../shared/data/providers.dart';
import 'app.dart';
import 'library_error_app.dart';

/// Starts the app with every kind of uncaught error routed to [ErrorLog], once the library on this device is open.
///
/// Nothing is sent anywhere: errors stay in memory on this device, and in release builds nothing is printed either, so
/// story text that happens to be inside an error message never reaches a log.
void bootstrap() {
  runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();
    installErrorHandlers(ErrorLog.instance);
    registerFontLicences();
    await startApp();
  }, (error, stack) => ErrorLog.instance.record(error, stack, context: 'zone'));
}

/// The bundled typefaces' licences, in the app's licence list beside the packages'.
void registerFontLicences() {
  LicenseRegistry.addLicense(() async* {
    for (final (family, file) in [('Cinzel', 'Cinzel-OFL.txt'), ('EB Garamond', 'EBGaramond-OFL.txt')]) {
      yield LicenseEntryWithLineBreaks([family], await rootBundle.loadString('assets/fonts/$file'));
    }
  });
}

/// Opens the library and shows the app, or, when the library cannot be opened, a screen that says why and offers to
/// try again. It never starts with an empty library in place of one it could not open.
Future<void> startApp() async {
  try {
    final db = AppDatabase.open(await libraryPath());
    runApp(ProviderScope(overrides: [databaseProvider.overrideWithValue(db)], child: const NovelBuilderApp()));
  } on Object catch (e) {
    runApp(
      LibraryErrorApp(
        reason: e is DatabaseOpenException ? e.reason : 'The library could not be opened ($e).',
        onRetry: startApp,
      ),
    );
  }
}

/// Where the library file lives: the app's own private support folder on this device.
Future<String> libraryPath() async {
  final dir = await getApplicationSupportDirectory();
  final sep = Platform.pathSeparator;
  return '${dir.path}${sep}library${sep}novel_builder.sqlite3';
}

/// Wires Flutter's error hooks to [log]. Separate from [bootstrap] so tests can call it.
void installErrorHandlers(ErrorLog log) {
  FlutterError.onError = (details) {
    log.record(details.exception, details.stack, context: details.context?.toDescription() ?? 'framework');
    if (kDebugMode) FlutterError.presentError(details);
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    log.record(error, stack, context: 'platform');
    return true;
  };
  // In debug builds the framework's red error screen stays, because it is the most useful thing for development.
  if (!kDebugMode) {
    ErrorWidget.builder = (details) => const BrokenWidget();
  }
}
