import 'package:flutter/material.dart';

import '../core/widgets/states.dart';
import 'theme/app_theme.dart';

/// Shown instead of the app when the library on this device cannot be opened. The file is not touched, so nothing is
/// lost by stopping here; the app never carries on with an empty library in its place.
class LibraryErrorApp extends StatelessWidget {
  const LibraryErrorApp({super.key, required this.reason, required this.onRetry});

  final String reason;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Novel Builder',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      home: Scaffold(
        body: SafeArea(
          child: ErrorState(
            title: 'Your library could not be opened',
            message: '$reason\n\nYour novels have not been changed.',
            onRetry: onRetry,
          ),
        ),
      ),
    );
  }
}
