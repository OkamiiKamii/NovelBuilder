import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../shared/data/providers.dart';
import 'router.dart';
import 'shell/trail.dart';
import 'theme/book_tone.dart';
import 'theme/theme_choice.dart';

class NovelBuilderApp extends ConsumerStatefulWidget {
  const NovelBuilderApp({super.key});

  @override
  ConsumerState<NovelBuilderApp> createState() => _NovelBuilderAppState();
}

class _NovelBuilderAppState extends ConsumerState<NovelBuilderApp> {
  late final AppLifecycleListener _lifecycle;
  late final _router = ref.read(routerProvider);

  @override
  void initState() {
    super.initState();
    // Anything waiting to be saved is saved before the app is put away, closed or killed by the system.
    void flush() => ref.read(saveControllerProvider).flush();
    _lifecycle = AppLifecycleListener(onInactive: flush, onPause: flush, onDetach: flush);
    // Where the author goes in a book is its trail, which More shows (`shell/trail.dart`).
    _router.routerDelegate.addListener(_walked);
  }

  void _walked() => ref.read(trailProvider.notifier).went(_router.routerDelegate.currentConfiguration.uri.toString());

  @override
  void dispose() {
    _router.routerDelegate.removeListener(_walked);
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final choice = ref.watch(themeChoiceProvider);
    // The open book's colour, when the app wears it (`theme/book_tone.dart`); the room changes slowly with the book.
    final book = ref.watch(wornColourProvider);
    return MaterialApp.router(
      title: 'Novel Builder',
      debugShowCheckedModeBanner: false,
      theme: choice.dayThemeIn(book),
      darkTheme: choice.nightThemeIn(book),
      themeMode: choice.mode,
      themeAnimationDuration: const Duration(milliseconds: 700),
      themeAnimationCurve: Curves.easeInOut,
      routerConfig: ref.watch(routerProvider),
    );
  }
}
