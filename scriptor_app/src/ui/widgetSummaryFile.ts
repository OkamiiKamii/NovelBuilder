// The home-screen widget's and Quick Settings tile's page (domain/desk/widgetSummary.ts): a small JSON file the app
// writes beside the library, so native code never opens the library itself (plugins/withWritingWidget.js reads it).

import { Directory, File, Paths } from 'expo-file-system';

import { ErrorLog } from '../data/errorLog';
import type { Library } from '../data/library';
import { widgetSummary } from '../domain/desk/widgetSummary';
import { lastNodeSetting } from './write/WriteScreen';

/** Writes `widget/today.json` from what is stored now: whole or not at all (a temporary file moved over it). Never
 * throws. */
export function writeWidgetSummary(lib: Library): void {
  try {
    const summary = widgetSummary({
      novels: lib.library.novels(),
      sessionsOf: (id) => lib.novels.rowsIn(id, 'writingSessions'),
      goalsOf: (id) => lib.novels.rowsIn(id, 'goals'),
      lastDocOf: (id) => {
        const chapter = lib.settings.read(lastNodeSetting(id));
        return typeof chapter === 'string' ? lib.novels.row(id, 'chapterContents', chapter)?.['doc'] : undefined;
      },
    });
    const folder = new Directory(Paths.document, 'widget');
    if (!folder.exists) folder.create({ intermediates: true });
    const tmp = new File(folder, 'today.json.tmp');
    tmp.writeSync(JSON.stringify(summary));
    tmp.moveSync(new File(folder, 'today.json'), { overwrite: true });
  } catch (e) {
    ErrorLog.instance.record(e, 'writing the widget summary');
  }
}

/** Writes the summary now, then again shortly after the library changes. Returns the stop. */
export function followWidgetSummary(lib: Library): () => void {
  writeWidgetSummary(lib);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = lib.novels.subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => writeWidgetSummary(lib), 800);
  });
  return () => {
    stop();
    if (timer) clearTimeout(timer);
  };
}
