import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/widgets/page_scaffold.dart';
import '../core/widgets/states.dart';

class NotFoundPage extends StatelessWidget {
  const NotFoundPage({super.key});

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: 'Page not found',
      child: EmptyState(
        icon: Icons.explore_off_outlined,
        title: 'This page does not exist',
        message: 'The link may be out of date. Nothing was changed.',
        action: FilledButton(onPressed: () => context.go('/'), child: const Text('Back to library')),
      ),
    );
  }
}
