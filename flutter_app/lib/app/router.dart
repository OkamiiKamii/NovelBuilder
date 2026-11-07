import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/abilities/ability_paths_page.dart';
import '../features/characters/character_page.dart';
import '../features/characters/characters_page.dart';
import '../features/codex/entry_page.dart';
import '../features/codex/kinds_page.dart';
import '../features/codex/world_page.dart';
import '../features/collab/team_page.dart';
import '../features/consequences/consequences_page.dart';
import '../features/exchange/exchange_page.dart';
import '../features/graph/graph_page.dart';
import '../features/kinds/kinds_view_page.dart';
import '../features/library/library_page.dart';
import '../features/modules/module_page.dart';
import '../features/modules/modules_page.dart';
import '../features/places/factions_page.dart';
import '../features/places/journeys_page.dart';
import '../features/places/ownership_page.dart';
import '../features/places/places_page.dart';
import '../features/plot/appearances_page.dart';
import '../features/plot/board_page.dart';
import '../features/plot/chapter_plan_page.dart';
import '../features/plot/plot_lanes_page.dart';
import '../features/plot/structure_page.dart';
import '../features/plot/thread_page.dart';
import '../features/plot/threads_page.dart';
import '../features/progress/analytics_page.dart';
import '../features/progress/charts_page.dart';
import '../features/progress/progress_page.dart';
import '../features/progression/systems_page.dart';
import '../features/reader/book_details_page.dart';
import '../features/reader/reader_page.dart';
import '../features/relationships/relation_settings_page.dart';
import '../features/relationships/relationship_map_page.dart';
import '../features/relationships/relationship_page.dart';
import '../features/review/canon_page.dart';
import '../features/review/continuity_page.dart';
import '../features/review/knowledge_page.dart';
import '../features/review/record_check_page.dart';
import '../features/review/review_page.dart';
import '../features/settings/settings_page.dart';
import '../features/timeline/calendar_page.dart';
import '../features/timeline/event_page.dart';
import '../features/timeline/histories_page.dart';
import '../features/timeline/life_history_page.dart';
import '../features/timeline/order_page.dart';
import '../features/timeline/timeline_page.dart';
import '../features/timeline/timeline_review_page.dart';
import '../features/timeline/timeline_view_page.dart';
import '../features/visualize/view_lists_page.dart';
import '../features/workspace/section_page.dart';
import '../features/write/write_page.dart';
import 'destinations.dart';
import 'not_found_page.dart';
import 'shell/app_shell.dart';

/// Switching areas is instant: no slide animation, which also respects reduced-motion settings.
Page<void> _page(GoRouterState state, Widget child) => NoTransitionPage<void>(key: state.pageKey, child: child);

GoRouter buildRouter({String initialLocation = '/'}) {
  return GoRouter(
    initialLocation: initialLocation,
    errorBuilder: (context, state) => AppShell(location: state.uri.toString(), child: const NotFoundPage()),
    routes: [
      ShellRoute(
        builder: (context, state, child) => AppShell(location: state.uri.toString(), child: child),
        routes: [
          GoRoute(path: Destination.library.path, pageBuilder: (context, state) => _page(state, const LibraryPage())),
          GoRoute(
            path: Destination.write.path,
            pageBuilder: (context, state) => _page(state, const WritePage()),
            routes: [
              GoRoute(path: 'read', pageBuilder: (context, state) => _page(state, const ReaderPage())),
              GoRoute(path: 'book', pageBuilder: (context, state) => _page(state, const BookDetailsPage())),
            ],
          ),
          GoRoute(
            path: Destination.organize.path,
            pageBuilder: (context, state) => _page(state, const CharactersPage()),
            routes: [
              GoRoute(path: 'world', pageBuilder: (context, state) => _page(state, const WorldPage())),
              GoRoute(
                path: 'systems',
                pageBuilder: (context, state) {
                  final q = state.uri.queryParameters;
                  return _page(state, SystemsPage(systemId: q['system'], tab: q['tab'], sheetId: q['sheet']));
                },
              ),
              GoRoute(path: 'modules', pageBuilder: (context, state) => _page(state, const ModulesPage())),
              GoRoute(
                path: 'modules/:moduleId',
                pageBuilder: (context, state) => _page(
                  state,
                  ModulePage(
                    moduleId: state.pathParameters['moduleId']!,
                    toolId: state.uri.queryParameters['tool'],
                    recordId: state.uri.queryParameters['record'],
                  ),
                ),
              ),
              GoRoute(
                path: 'relationship/:relationId',
                pageBuilder: (context, state) =>
                    _page(state, RelationshipPage(relationId: state.pathParameters['relationId']!)),
              ),
              GoRoute(
                path: 'relationships/settings',
                pageBuilder: (context, state) => _page(state, const RelationSettingsPage()),
              ),
              GoRoute(
                path: 'world/kinds',
                pageBuilder: (context, state) => _page(state, KindsPage(kind: state.uri.queryParameters['kind'])),
              ),
              GoRoute(
                path: 'world/entry/:entryId',
                pageBuilder: (context, state) => _page(state, EntryPage(entryId: state.pathParameters['entryId']!)),
              ),
              GoRoute(
                path: 'character/:entryId',
                pageBuilder: (context, state) => _page(
                  state,
                  CharacterPage(entryId: state.pathParameters['entryId']!, tab: state.uri.queryParameters['tab']),
                ),
              ),
            ],
          ),
          GoRoute(
            path: Destination.plan.path,
            pageBuilder: (context, state) => _page(state, const TimelinePage()),
            routes: [
              GoRoute(
                path: 'event/:eventId',
                pageBuilder: (context, state) => _page(state, EventPage(eventId: state.pathParameters['eventId']!)),
              ),
              GoRoute(path: 'calendar', pageBuilder: (context, state) => _page(state, const CalendarPage())),
              GoRoute(path: 'threads', pageBuilder: (context, state) => _page(state, const ThreadsPage())),
              GoRoute(
                path: 'thread/:threadId',
                pageBuilder: (context, state) => _page(state, ThreadPage(threadId: state.pathParameters['threadId']!)),
              ),
              GoRoute(
                path: 'board',
                pageBuilder: (context, state) => _page(state, BoardPage(threadId: state.uri.queryParameters['thread'])),
              ),
              GoRoute(
                path: 'chapter/:nodeId',
                pageBuilder: (context, state) => _page(state, ChapterPlanPage(nodeId: state.pathParameters['nodeId']!)),
              ),
              GoRoute(
                path: 'histories',
                pageBuilder: (context, state) =>
                    _page(state, HistoriesPage(historyId: state.uri.queryParameters['history'])),
              ),
            ],
          ),
          GoRoute(
            path: Destination.review.path,
            pageBuilder: (context, state) => _page(state, const ReviewPage()),
            routes: [
              GoRoute(path: 'records', pageBuilder: (context, state) => _page(state, const RecordCheckPage())),
              GoRoute(path: 'team', pageBuilder: (context, state) => _page(state, const TeamPage())),
              GoRoute(
                path: 'consequences',
                pageBuilder: (context, state) => _page(
                  state,
                  ConsequencesPage(
                    nodeId: state.uri.queryParameters['node'],
                    eventId: state.uri.queryParameters['event'],
                    threadId: state.uri.queryParameters['thread'],
                    beatId: state.uri.queryParameters['beat'],
                  ),
                ),
              ),
              GoRoute(path: 'timeline', pageBuilder: (context, state) => _page(state, const TimelineReviewPage())),
              GoRoute(
                path: 'canon',
                pageBuilder: (context, state) => _page(state, CanonPage(factId: state.uri.queryParameters['fact'])),
              ),
              GoRoute(
                path: 'continuity',
                pageBuilder: (context, state) => _page(state, ContinuityPage(tab: state.uri.queryParameters['tab'])),
              ),
            ],
          ),
          GoRoute(
            path: Destination.visualize.path,
            pageBuilder: (context, state) => _page(state, const RelationshipMapPage()),
            routes: [
              GoRoute(path: 'timeline', pageBuilder: (context, state) => _page(state, const TimelineViewPage())),
              GoRoute(path: 'order', pageBuilder: (context, state) => _page(state, const OrderPage())),
              GoRoute(path: 'plot', pageBuilder: (context, state) => _page(state, const PlotLanesPage())),
              GoRoute(path: 'structure', pageBuilder: (context, state) => _page(state, const StructurePage())),
              GoRoute(path: 'appearances', pageBuilder: (context, state) => _page(state, const AppearancesPage())),
              GoRoute(path: 'graph', pageBuilder: (context, state) => _page(state, const GraphPage())),
              GoRoute(path: 'kinds', pageBuilder: (context, state) => _page(state, const KindsViewPage())),
              GoRoute(path: 'abilities', pageBuilder: (context, state) => _page(state, const AbilityPathsPage())),
              GoRoute(
                path: 'progression',
                pageBuilder: (context, state) => _page(state, const ViewListPage(view: 'progression')),
              ),
              GoRoute(path: 'places', pageBuilder: (context, state) => _page(state, const PlacesPage())),
              GoRoute(
                path: 'knowledge',
                pageBuilder: (context, state) =>
                    _page(state, KnowledgePage(secretId: state.uri.queryParameters['secret'])),
              ),
              GoRoute(path: 'journeys', pageBuilder: (context, state) => _page(state, const JourneysPage())),
              GoRoute(path: 'factions', pageBuilder: (context, state) => _page(state, const FactionsPage())),
              GoRoute(path: 'ownership', pageBuilder: (context, state) => _page(state, const OwnershipPage())),
              GoRoute(path: 'charts', pageBuilder: (context, state) => _page(state, const ChartsPage())),
              GoRoute(
                path: 'history',
                pageBuilder: (context, state) => _page(state, LifeHistoryPage(who: state.uri.queryParameters['who'])),
              ),
            ],
          ),
          GoRoute(
            path: Destination.progress.path,
            pageBuilder: (context, state) => _page(state, const ProgressPage()),
            routes: [GoRoute(path: 'analytics', pageBuilder: (context, state) => _page(state, const AnalyticsPage()))],
          ),
          for (final d in Destination.values.where(
            (d) =>
                d.needsNovel &&
                d != Destination.write &&
                d != Destination.organize &&
                d != Destination.plan &&
                d != Destination.review &&
                d != Destination.progress &&
                d != Destination.visualize,
          ))
            GoRoute(
              path: d.path,
              pageBuilder: (context, state) => _page(state, SectionPage(destination: d)),
            ),
          GoRoute(
            path: Destination.settings.path,
            pageBuilder: (context, state) => _page(state, const SettingsPage()),
            routes: [
              GoRoute(path: 'import-export', pageBuilder: (context, state) => _page(state, const ExchangePage())),
            ],
          ),
        ],
      ),
    ],
  );
}

final routerProvider = Provider<GoRouter>((ref) {
  final router = buildRouter();
  ref.onDispose(router.dispose);
  return router;
});
