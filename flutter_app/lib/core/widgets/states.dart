import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Shared loading, empty, error and no-results states, so every screen says these things the same way.

class LoadingState extends StatelessWidget {
  const LoadingState({super.key, this.message = 'Loading…'});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      label: message,
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            ExcludeSemantics(child: Text(message)),
          ],
        ),
      ),
    );
  }
}

/// Nothing here yet. Says what would be here and, when possible, offers the way to add it.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.message, this.action});

  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) => _StateCard(icon: icon, title: title, message: message, action: action);
}

/// Something went wrong. Says so plainly, never pretends it worked, and offers a retry when one makes sense.
class ErrorState extends StatelessWidget {
  const ErrorState({super.key, this.title = 'Something went wrong', required this.message, this.onRetry});

  final String title;
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return _StateCard(
      icon: Icons.error_outline,
      iconColor: Theme.of(context).colorScheme.error,
      title: title,
      message: message,
      liveRegion: true,
      action: onRetry == null
          ? null
          : OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: const Text('Try again')),
    );
  }
}

/// A search or filter matched nothing. This is different from having no records at all.
class NoResultsState extends StatelessWidget {
  const NoResultsState({super.key, this.query, this.onClear});

  final String? query;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    final q = query;
    return _StateCard(
      icon: Icons.search_off,
      title: q == null || q.isEmpty ? 'Nothing matches these filters' : 'Nothing matches “$q”',
      message: 'Your records are unchanged; they are only hidden by the current search or filters.',
      action: onClear == null ? null : TextButton(onPressed: onClear, child: const Text('Clear search and filters')),
    );
  }
}

/// Shows an [AsyncValue] with the shared states: loading, error (with retry), empty, or the data.
class AsyncValueView<T> extends StatelessWidget {
  const AsyncValueView({super.key, required this.value, required this.data, this.isEmpty, this.empty, this.onRetry});

  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final bool Function(T data)? isEmpty;
  final Widget? empty;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return switch (value) {
      AsyncData(:final value) => (isEmpty?.call(value) ?? false) && empty != null ? empty! : data(value),
      AsyncError(:final error) => ErrorState(message: _describe(error), onRetry: onRetry),
      _ => const LoadingState(),
    };
  }

  static String _describe(Object error) => switch (error) {
    final Exception e => e.toString().replaceFirst('Exception: ', ''),
    _ => 'An unexpected problem occurred.',
  };
}

class _StateCard extends StatelessWidget {
  const _StateCard({
    required this.icon,
    required this.title,
    this.message,
    this.action,
    this.iconColor,
    this.liveRegion = false,
  });

  final IconData icon;
  final Color? iconColor;
  final String title;
  final String? message;
  final Widget? action;
  final bool liveRegion;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      liveRegion: liveRegion,
      container: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 16),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 40, color: iconColor ?? theme.colorScheme.onSurfaceVariant),
                const SizedBox(height: 12),
                Text(title, style: theme.textTheme.titleMedium, textAlign: TextAlign.center),
                if (message != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    message!,
                    style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    textAlign: TextAlign.center,
                  ),
                ],
                if (action != null) ...[const SizedBox(height: 16), action!],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
