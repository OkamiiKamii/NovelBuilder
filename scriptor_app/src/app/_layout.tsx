// Starts Scriptor: opens the library on this device, then shows the app in its frame; or, when the library cannot be
// opened, a screen that says why and offers to try again (FEATURES.md #1). A port of flutter_app/lib/app/bootstrap.dart.

import { router, Slot, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { AppState, useWindowDimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DatabaseOpenError, describe } from '../data/database';
import { ErrorLog } from '../data/errorLog';
import { deviceLibraryFile } from '../data/expoSql';
import { type Library, openLibrary } from '../data/library';
import { addSampleNovelOnFirstStart } from '../data/sampleNovel';
import { openNovelSettingKey } from '../data/settingsStore';
import { ReviewGate } from '../ui/collab/ReviewGate';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { AppFrame, bottomBarHeight, showsAreas } from '../ui/frame';
import { LibraryProvider } from '../ui/LibraryContext';
import { LibraryErrorScreen } from '../ui/LibraryErrorScreen';
import { followReminders, planReminders } from '../ui/reminders';
import { sizeClassOf } from '../ui/theme';
import { ToastProvider } from '../ui/toast';

type Opened = { library: Library } | { error: string };

function start(): Opened {
  try {
    const library = openLibrary(deviceLibraryFile());
    welcome(library);
    return { library };
  } catch (e) {
    return { error: e instanceof DatabaseOpenError ? e.reason : `The library could not be opened (${describe(e)}).` };
  }
}

/** First start: the sample novel; every start: forget an open novel that no longer exists. Anything that goes wrong is
 * logged and the app starts all the same. */
function welcome(library: Library): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sample: unknown = require('../../assets/sample/the-drowned-road.novel.json');
    addSampleNovelOnFirstStart(library.novels, library.settings, sample, Date.now());
  } catch (e) {
    ErrorLog.instance.record(e, 'adding the sample novel');
  }
  try {
    const open = library.settings.read(openNovelSettingKey);
    if (typeof open === 'string' && !library.novels.exists(open)) library.settings.write(openNovelSettingKey, null);
  } catch (e) {
    ErrorLog.instance.record(e, 'reopening the last novel');
  }
}

export default function RootLayout() {
  const [opened, setOpened] = useState<Opened>(start);
  const retry = useCallback(() => setOpened(start()), []);
  const library = 'library' in opened ? opened.library : null;
  const phone = sizeClassOf(useWindowDimensions().width) === 'compact';
  // Toasts sit above the bottom bar where it shows; the Library has none.
  const pathname = usePathname();
  const barShown = phone && showsAreas(pathname);

  // Pending saves are written when the app goes to the background or is closed (FEATURES.md #7).
  useEffect(() => {
    if (!library) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        library.saves.flush();
        // The daily nudge planned again: today's dropped once today is written, the last line kept current.
        void planReminders(library);
      }
    });
    return () => sub.remove();
  }, [library]);

  // A pressed nudge opens what it names (Write, at the last word).
  useEffect(() => (library ? followReminders((url) => router.navigate(url as never)) : undefined), [library]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {library ? (
        <LibraryProvider value={library}>
          <ToastProvider bottomOffset={barShown ? bottomBarHeight : 0}>
            <AppFrame>
              <ErrorBoundary where="page">
                <ReviewGate>
                  <Slot />
                </ReviewGate>
              </ErrorBoundary>
            </AppFrame>
          </ToastProvider>
        </LibraryProvider>
      ) : (
        <LibraryErrorScreen reason={'error' in opened ? opened.error : ''} onRetry={retry} />
      )}
    </SafeAreaProvider>
  );
}
