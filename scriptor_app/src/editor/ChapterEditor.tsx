// The chapter editor in the app: the TipTap page (editor-web/, built into editorPage.generated.ts) in a WebView. It is
// opened at the app's own Android assets, so the page's fonts are the app's; nothing is loaded from a network.

import { type ComponentType, forwardRef, type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView as WebViewClass, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

// The WebView class with its props spelled out: its own typing resolves to `never` under React 19.3's types.
type WebView = WebViewClass;
const WebView = WebViewClass as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewClass> }>;

import type { JsonMap } from '../domain/json';
import type { Lens, LensSummary } from '../../editor-web/lenses';
import type { Atmosphere, ChapterEndAction, ChapterEndInfo } from '../../editor-web/extras';
import { editorPageHtml } from './editorPage.generated';

export type { Atmosphere, ChapterEndAction, ChapterEndInfo, Lens, LensSummary };

export type EditorUiState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  block: 'paragraph' | 'h1' | 'h2' | 'h3' | 'quote';
  bullet: boolean;
  ordered: boolean;
  align: 'left' | 'center' | 'right' | 'justify';
  canUndo: boolean;
  canRedo: boolean;
  selectionEmpty: boolean;
  linkedEntry: string | null;
  focused: boolean;
  /** With the caret in a paragraph and nothing selected: that paragraph's text and where in it the caret is. */
  caret: { text: string; offset: number; block: number } | null;
};

export const emptyUiState: EditorUiState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  block: 'paragraph',
  bullet: false,
  ordered: false,
  align: 'left',
  canUndo: false,
  canRedo: false,
  selectionEmpty: true,
  linkedEntry: null,
  focused: false,
  caret: null,
};

export type EditorLook = {
  font: 'serif' | 'sans' | 'mono';
  fontSize: number;
  lineHeight: number;
  /** Space between paragraphs, in lines. */
  paragraphSpacing: number;
  maxWidth: number | null;
  padding: number;
  page: { background: string; text: string; muted: string };
};

const fontFamilies = {
  serif: "'Merriweather', Georgia, serif",
  sans: "'Outfit', sans-serif",
  mono: "'JetBrains Mono', monospace",
};

export type Sentence = { from: number; to: number; text: string };

export type ChapterEditorHandle = {
  load(doc: JsonMap | null, readOnlyReason?: string | null): void;
  command(name: string, value?: string): void;
  link(entryId: string): void;
  unlink(): void;
  find(query: string, matchCase: boolean, wholeWords: boolean): void;
  findStep(delta: number): void;
  clearFind(): void;
  replace(withText: string): void;
  replaceAll(withText: string): void;
  focus(atEnd?: boolean): void;
  blur(): void;
  /** Sends any typing not yet reported; resolves once it has arrived (or at once, if there was none). */
  flush(): Promise<void>;
  /** The text before and after the caret's paragraph, or why it cannot be split. */
  split(): Promise<{ ok: boolean; head?: JsonMap; tail?: JsonMap; reason?: string }>;
  /** Focus mode's typewriter, and "set like a book". */
  modes(typewriter: boolean, bookSetting: boolean): void;
  /** The sentences from the caret's to the chapter's end, for Listen. */
  sentences(): Promise<Sentence[]>;
  /** Turns a lens on or off (red pencil, voices); names and colours are the cast's, for voices. */
  lens(lens: Lens, names?: Record<string, string[]>, colours?: Record<string, string>): void;
  /** Selects the next mark of a kind (a pencil mark, or a speaker's line: their id, '' for nobody named). */
  lensNext(key: string): void;
  /** Leaves a gap: [[ ]] at the caret, or around the selection. */
  gap(): void;
  /** Lights the sentence being read (null: none). */
  speaking(range: { from: number; to: number } | null): void;
  /** Selects characters start–end of paragraph `block` (paragraphs and headings in reading order). */
  select(block: number, start: number, end: number): void;
  /** Writing weather around the page. */
  atmosphere(kind: Atmosphere): void;
  /** The chapter's spine down the right edge (long chapters only). */
  spine(on: boolean): void;
  /** Today's ink: on or off, and the chapter's paragraphs as the day began (null: not known; omitted: unchanged). */
  ink(on: boolean, before?: string[] | null): void;
  /** What is below the last line: the next chapter, or the end so far (null: nothing). */
  chapterEnd(info: ChapterEndInfo | null): void;
  /** Puts text in over the `replace` characters before the caret (a name key). */
  insert(replace: number, text: string): void;
};

type Props = {
  look: EditorLook;
  onReady: () => void;
  onLoaded: (editable: boolean, reason: string | null) => void;
  onChange: (doc: JsonMap) => void;
  onState: (state: EditorUiState) => void;
  onFind: (count: number, index: number) => void;
  onError?: (message: string) => void;
  /** The counts of the lens in use, each time they are worked out. */
  onLens?: (summary: LensSummary) => void;
  /** The button below the last line was pressed. */
  onChapterEnd?: (action: ChapterEndAction) => void;
};

export const ChapterEditor = forwardRef<ChapterEditorHandle, Props>(function ChapterEditor(props, ref) {
  const web = useRef<WebView>(null);
  const pendingSplit = useRef<((r: { ok: boolean; head?: JsonMap; tail?: JsonMap; reason?: string }) => void) | null>(null);
  const pendingFlush = useRef<(() => void)[]>([]);
  const pendingSentences = useRef<((s: Sentence[]) => void) | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const post = useCallback((message: object) => {
    // Delivered to the page as a JavaScript string; JSON.stringify twice makes it a safe literal.
    web.current?.injectJavaScript(`window.scriptor && window.scriptor.receive(${JSON.stringify(JSON.stringify(message))}); true;`);
  }, []);

  const sendLook = useCallback(
    (look: EditorLook) => {
      const css = `:root { --size: ${look.fontSize}px; --line: ${look.lineHeight}; --width: ${
        look.maxWidth ? `${look.maxWidth}px` : '100%'
      }; --pad: ${look.padding}px; --para: ${(look.paragraphSpacing * look.lineHeight).toFixed(2)}em; --font: ${
        fontFamilies[look.font]
      }; --page: ${look.page.background}; --text: ${look.page.text}; --muted: ${look.page.muted}; }`;
      post({ type: 'style', css });
    },
    [post],
  );

  useImperativeHandle(
    ref,
    () => ({
      load: (doc, readOnlyReason = null) => post({ type: 'load', doc, readOnlyReason }),
      command: (name, value) => post({ type: 'command', name, value }),
      link: (entryId) => post({ type: 'link', entryId }),
      unlink: () => post({ type: 'unlink' }),
      find: (query, matchCase, wholeWords) => post({ type: 'find', query, matchCase, wholeWords }),
      findStep: (delta) => post({ type: 'findStep', delta }),
      clearFind: () => post({ type: 'clearFind' }),
      replace: (withText) => post({ type: 'replace', with: withText }),
      replaceAll: (withText) => post({ type: 'replaceAll', with: withText }),
      focus: (atEnd) => {
        // The WebView itself takes focus first: without it Android does not bring the keyboard up.
        web.current?.requestFocus();
        post({ type: 'focus', end: atEnd });
      },
      blur: () => post({ type: 'blur' }),
      flush: () =>
        new Promise<void>((resolve) => {
          pendingFlush.current.push(resolve);
          post({ type: 'flush' });
          // Nothing pending in the page: no change comes back, so this resolves on its own shortly.
          setTimeout(() => {
            const i = pendingFlush.current.indexOf(resolve);
            if (i >= 0) {
              pendingFlush.current.splice(i, 1);
              resolve();
            }
          }, 120);
        }),
      split: () =>
        new Promise((resolve) => {
          pendingSplit.current = resolve;
          post({ type: 'split' });
        }),
      modes: (typewriter, bookSetting) => post({ type: 'modes', typewriter, bookSetting }),
      sentences: () =>
        new Promise<Sentence[]>((resolve) => {
          pendingSentences.current = resolve;
          post({ type: 'sentences' });
        }),
      speaking: (range) => post({ type: 'speaking', range }),
      lens: (lens, names, colours) => post({ type: 'lens', lens, names, colours }),
      lensNext: (key) => post({ type: 'lensNext', key }),
      gap: () => post({ type: 'gap' }),
      select: (block, start, end) => {
        web.current?.requestFocus();
        post({ type: 'select', block, start, end });
      },
      atmosphere: (kind) => post({ type: 'atmosphere', kind }),
      spine: (on) => post({ type: 'spine', on }),
      ink: (on, before) => post(before === undefined ? { type: 'ink', on } : { type: 'ink', on, before }),
      chapterEnd: (info) => post({ type: 'chapterEnd', info }),
      insert: (replace, text) => post({ type: 'insert', replace, text }),
    }),
    [post],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let m: { type: string; [key: string]: unknown };
      try {
        m = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      const p = propsRef.current;
      switch (m.type) {
        case 'ready':
          sendLook(p.look);
          p.onReady();
          break;
        case 'loaded':
          p.onLoaded(Boolean(m.editable), (m.reason as string | null) ?? null);
          break;
        case 'change':
          p.onChange(m.doc as JsonMap);
          for (const resolve of pendingFlush.current.splice(0)) resolve();
          break;
        case 'state':
          p.onState(m.state as EditorUiState);
          break;
        case 'find':
          p.onFind(Number(m.count), Number(m.index));
          break;
        case 'split':
          pendingSplit.current?.(m as never);
          pendingSplit.current = null;
          break;
        case 'lens':
          p.onLens?.(m.summary as LensSummary);
          break;
        case 'sentences':
          pendingSentences.current?.(m.sentences as Sentence[]);
          pendingSentences.current = null;
          break;
        case 'error':
          p.onError?.(String(m.message));
          break;
        case 'chapterEndTap':
          p.onChapterEnd?.(m.action as ChapterEndAction);
          break;
      }
    },
    [sendLook],
  );

  // The look can change while the page is open (text size, width).
  const lookKey = JSON.stringify(props.look);
  useEffect(() => sendLook(props.look), [lookKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const source = useMemo(() => ({ html: editorPageHtml, baseUrl: 'file:///android_asset/' }), []);

  return (
    <WebView
      ref={web}
      source={source}
      originWhitelist={['file://*', 'about:*']}
      onMessage={onMessage}
      style={styles.web}
      containerStyle={styles.web}
      allowFileAccess
      javaScriptEnabled
      domStorageEnabled={false}
      keyboardDisplayRequiresUserAction={false}
      hideKeyboardAccessoryView
      overScrollMode="never"
      setSupportMultipleWindows={false}
      // The page never navigates anywhere: links in prose are never opened.
      onShouldStartLoadWithRequest={(r: ShouldStartLoadRequest) => r.url.startsWith('file://') || r.url.startsWith('about:')}
      textZoom={100}
      androidLayerType="hardware"
      // Android can stop the page's process (memory, an update of the system WebView). The page is loaded again; it says
      // it is ready, and the chapter reopens, with any unsaved typing offered back from its crash copy.
      onRenderProcessGone={() => web.current?.reload()}
    />
  );
});

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: 'transparent' },
});
