import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../shared/data/providers.dart';
import 'router.dart';
import 'theme/app_theme.dart';
import 'theme/theme_choice.dart';

class NovelBuilderApp extends ConsumerStatefulWidget {
  const NovelBuilderApp({super.key});

  @override
  ConsumerState<NovelBuilderApp> createState() => _NovelBuilderAppState();
}

class _NovelBuilderAppState extends ConsumerState<NovelBuilderApp> {
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    // Anything waiting to be saved is saved before the app is put away, closed or killed by the system.
    void flush() => ref.read(saveControllerProvider).flush();
    _lifecycle = AppLifecycleListener(onInactive: flush, onPause: flush, onDetach: flush);
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final choice = ref.watch(themeChoiceProvider);
    return MaterialApp.router(
      title: 'Novel Builder',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: choice.mode,
      routerConfig: ref.watch(routerProvider),
    );
  }
}
