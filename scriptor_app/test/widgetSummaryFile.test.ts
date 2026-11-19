import { ErrorLog } from '../src/data/errorLog';
import { openLibrary } from '../src/data/library';
import { widgetSummary } from '../src/domain/desk/widgetSummary';
import { textToDoc } from '../src/domain/prose';
import { followWidgetSummary, writeWidgetSummary } from '../src/ui/widgetSummaryFile';
import { testIds } from './fixtures';
import { memoryLibrary } from './nodeSql';

// Files in memory, with the sync calls the writer uses; every write and move is logged in order.
const mockFiles = new Map<string, string>();
const mockLog: string[] = [];
const mockFail = { write: false };
jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) => parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return true;
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    writeSync(text: string) {
      if (mockFail.write) throw new Error('disk full');
      mockLog.push(`write ${this.uri}`);
      mockFiles.set(this.uri, text);
    }
    moveSync(to: File, options?: { overwrite?: boolean }) {
      if (mockFiles.has(to.uri) && !options?.overwrite) throw new Error('exists');
      mockLog.push(`move ${this.uri} ${to.uri}`);
      mockFiles.set(to.uri, mockFiles.get(this.uri)!);
      mockFiles.delete(this.uri);
      this.uri = to.uri;
    }
  }
  return { Directory, File, Paths: { document: { uri: 'doc' } } };
});
// The real module pulls in the whole Write screen; only the setting's name is needed.
jest.mock('../src/ui/write/WriteScreen', () => ({ lastNodeSetting: (id: string) => `write.lastNode.${id}` }));

function aLibrary() {
  const lib = openLibrary(memoryLibrary(), Date.now, testIds());
  const { novel, chapterId } = lib.library.create({ title: 'The Road' }, { firstChapter: true });
  lib.library.markOpened(novel.id);
  lib.novels.writeRows(novel.id, [
    { collection: 'writingSessions', id: 's1', value: { id: 's1', day: '2026-11-18', netWords: 300, added: 320 } },
    { collection: 'writingSessions', id: 's2', value: { id: 's2', day: '2026-11-19', netWords: -20, added: 0 } },
    { collection: 'goals', id: 'g1', value: { id: 'g1', kind: 'daily', targetWords: 500 } },
    { collection: 'chapterContents', id: chapterId!, value: { id: chapterId!, projectId: novel.id, doc: textToDoc('She ran.') } },
  ]);
  lib.settings.write(`write.lastNode.${novel.id}`, chapterId!);
  return lib;
}

beforeEach(() => {
  mockFiles.clear();
  mockLog.length = 0;
  mockFail.write = false;
});

describe('the widget summary file', () => {
  test('is the domain summary of the book, written whole beside the library', () => {
    const lib = aLibrary();
    writeWidgetSummary(lib);
    writeWidgetSummary(lib);
    expect(mockLog).toEqual([
      'write doc/widget/today.json.tmp',
      'move doc/widget/today.json.tmp doc/widget/today.json',
      'write doc/widget/today.json.tmp',
      'move doc/widget/today.json.tmp doc/widget/today.json',
    ]);
    expect([...mockFiles.keys()]).toEqual(['doc/widget/today.json']);
    const written = JSON.parse(mockFiles.get('doc/widget/today.json')!);
    const novels = lib.library.novels();
    expect(written).toEqual(
      widgetSummary({
        novels,
        sessionsOf: (n) => lib.novels.rowsIn(n, 'writingSessions'),
        goalsOf: (n) => lib.novels.rowsIn(n, 'goals'),
        lastDocOf: () => textToDoc('She ran.'),
      }),
    );
    expect(written.book).toMatchObject({ title: 'The Road', goal: 500, lines: 'She ran.' });
    expect(written.book.days['2026-11-19']).toEqual({ net: -20, written: false });
  });

  test('with no book opened yet, says so', () => {
    const lib = openLibrary(memoryLibrary(), Date.now, testIds());
    writeWidgetSummary(lib);
    expect(JSON.parse(mockFiles.get('doc/widget/today.json')!)).toEqual({ version: 1, book: null });
  });

  test('a write that fails is logged, never thrown, and leaves the last file', () => {
    const lib = aLibrary();
    writeWidgetSummary(lib);
    const before = mockFiles.get('doc/widget/today.json');
    mockFail.write = true;
    const logged = ErrorLog.instance.entries.length;
    expect(() => writeWidgetSummary(lib)).not.toThrow();
    expect(ErrorLog.instance.entries.at(-1)?.context).toBe('writing the widget summary');
    expect(ErrorLog.instance.entries.length).toBe(logged + 1);
    expect(mockFiles.get('doc/widget/today.json')).toBe(before);
  });

  test('follows the library: once now, once after a burst of changes, never after the stop', () => {
    jest.useFakeTimers();
    try {
      const lib = aLibrary();
      const stop = followWidgetSummary(lib);
      expect(mockLog).toHaveLength(2);
      lib.novels.touchSettings();
      jest.advanceTimersByTime(500);
      lib.novels.touchSettings();
      jest.advanceTimersByTime(799);
      expect(mockLog).toHaveLength(2);
      jest.advanceTimersByTime(1);
      expect(mockLog).toHaveLength(4);
      lib.novels.touchSettings();
      stop();
      jest.advanceTimersByTime(2000);
      expect(mockLog).toHaveLength(4);
    } finally {
      jest.useRealTimers();
    }
  });
});
