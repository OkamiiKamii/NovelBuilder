import { App as NativeApp } from '@capacitor/app';
import { isAndroidApp } from '@/shared/platform';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RelationshipsPage } from '@/modules/relationships/pages/RelationshipsPage';
import { OrganizerPage } from '@/modules/manuscript/pages/OrganizerPage';
import { BoardPage } from '@/modules/manuscript/pages/BoardPage';
import { IntegrityPage } from '@/modules/integrity/IntegrityPage';
import { ReviewPage } from '@/modules/review/ReviewPage';
import { DashboardPage } from '@/modules/analytics/pages/DashboardPage';
import { AssistantPage } from '@/modules/assistant/pages/AssistantPage';
import { BranchesPage } from '@/modules/branching/pages/BranchesPage';
import { CanonPage } from '@/modules/canon/pages/CanonPage';
import { CodexPage } from '@/modules/codex/pages/CodexPage';
import { ConsequencesPage } from '@/modules/consequences/pages/ConsequencesPage';
import { ContinuityPage } from '@/modules/continuity/pages/ContinuityPage';
import { ModulePage } from '@/modules/extensions/pages/ModulePage';
import { ModulesPage } from '@/modules/extensions/pages/ModulesPage';
import { ExchangePage } from '@/modules/exchange/pages/ExchangePage';
import { GraphPage } from '@/modules/graph/GraphPage';
import { ManuscriptPage } from '@/modules/manuscript/pages/ManuscriptPage';
import { PlotPage } from '@/modules/plot/pages/PlotPage';
import { ProgressionPage } from '@/modules/progression/pages/ProgressionPage';
import { ProgressPage } from '@/modules/progress/pages/ProgressPage';
import { LibraryPage } from '@/modules/projects';
import { OverviewPage } from '@/modules/workspace/OverviewPage';
import { PlaceholderPage } from '@/modules/workspace/PlaceholderPage';
import { StudioPage } from '@/modules/studio/StudioPage';
import { JoinPage, TeamPage } from '@/modules/collab/pages/TeamPage';
import { ReaderPage } from '@/modules/reader/pages/ReaderPage';
import { CharacterPage } from '@/modules/characters/pages/CharacterPage';
import { CharactersPage } from '@/modules/characters/pages/CharactersPage';
import { CloudPage, SyncPage } from '@/modules/sync/pages/SyncPage';
import { startTheme } from '@/shared/theme';
import { Tutorial } from '@/modules/tutorial/Tutorial';
import { startDevice } from '@/modules/platform/device';
import { startSync } from '@/modules/sync/runner';
import { SystemsPage } from '@/modules/systems/pages/SystemsPage';
import { SettingsPage } from '@/modules/workspace/SettingsPage';
import { TimelinePage } from '@/modules/timeline/pages/TimelinePage';
import { HistoriesPage } from '@/modules/timeline/pages/HistoriesPage';
import { TimelineReviewPage } from '@/modules/timeline/pages/TimelineReviewPage';
import { VisualizePage } from '@/modules/visualize/VisualizePage';
import { WORKSPACE_SECTIONS } from '@/modules/workspace/sections';
import { WorkspaceRoute } from '@/modules/workspace/WorkspaceLayout';

// The colours the author chose (or the device's own).
startTheme();
// The interface follows the device: its size, and what the author is pointing with.
startDevice();
// In the Android app the system Back button goes back a screen, and leaves the app from the first one.
if (isAndroidApp()) void NativeApp.addListener('backButton', ({ canGoBack }) => (canGoBack ? window.history.back() : void NativeApp.exitApp()));
// Background sync starts with the app. Without an account it does nothing.
startSync();

/** Systems used to have a page of their own. Old links and bookmarks land where they live now, with the same system and sheet open. */
function SystemsMoved() {
  const { search } = useLocation();
  return <Navigate to={`../characters/systems${search}`} replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <Tutorial />
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/cloud" element={<CloudPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/project/:id" element={<WorkspaceRoute />}>
          <Route index element={<OverviewPage />} />
          <Route path="manuscript/:chapterId?" element={<ManuscriptPage />} />
          <Route path="organizer" element={<OrganizerPage />} />
          <Route path="board" element={<BoardPage />} />
          <Route path="characters" element={<CharactersPage />} />
          <Route path="characters/systems" element={<SystemsPage />} />
          <Route path="characters/:entryId/:tab?" element={<CharacterPage />} />
          <Route path="codex/:entryId?" element={<CodexPage />} />
          <Route path="relationships" element={<RelationshipsPage />} />
          <Route path="timeline" element={<TimelinePage />} />
          <Route path="histories" element={<HistoriesPage />} />
          <Route path="timeline/review" element={<TimelineReviewPage />} />
          <Route path="plot" element={<PlotPage />} />
          <Route path="canon" element={<CanonPage />} />
          <Route path="continuity" element={<ContinuityPage />} />
          <Route path="integrity" element={<IntegrityPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="systems" element={<SystemsMoved />} />
          <Route path="progression" element={<ProgressionPage />} />
          <Route path="branches" element={<BranchesPage />} />
          <Route path="consequences" element={<ConsequencesPage />} />
          <Route path="graph" element={<GraphPage />} />
          <Route path="visualize/:view?" element={<VisualizePage />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="export" element={<ExchangePage />} />
          {WORKSPACE_SECTIONS.map((section) => (
            <Route key={section.path} path={section.path} element={<PlaceholderPage section={section} />} />
          ))}
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="assistant" element={<AssistantPage />} />
          <Route path="modules" element={<ModulesPage />} />
          <Route path="modules/:moduleId" element={<ModulePage />} />
          <Route path="read" element={<ReaderPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="sync" element={<SyncPage />} />
          <Route path="studio" element={<StudioPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
