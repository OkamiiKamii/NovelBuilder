// The chapter editor in the app: the TipTap page (editor-web/, built into editorPage.generated.ts) in a WebView. It is
// opened at the app's own Android assets, so the page's fonts are the app's; nothing is loaded from a network.

import { type ComponentType, forwardRef, type Ref, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView as WebViewClass, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

// The WebView class with its props spelled out: its own typing resolves to `never` under React 19.3's types.
type WebView = WebViewClass;
const WebView = WebViewClass as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewClass> }>;

import type { JsonMap } from '../domain/json';
import { editorPageHtml } from './editorPage.generated';

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
};

export type EditorLook = { fontSize: number; lineHeight: number; maxWidth: number | null; padding: number };

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
};

type Props = {
  look: EditorLook;
  onReady: () => void;
  onLoaded: (editable: boolean, reason: string | null) => void;
  onChange: (doc: JsonMap) => void;
  onState: (state: EditorUiState) => void;
  onFind: (count: number, index: number) => void;
  onError?: (message: string) => void;
};

export const ChapterEditor = forwardRef<ChapterEditorHandle, Props>(function ChapterEditor(props, ref) {
  const web = useRef<WebView>(null);
  const pendingSplit = useRef<((r: { ok: boolean; head?: JsonMap; tail?: JsonMap; reason?: string }) => void) | null>(null);
  const pendingFlush = useRef<(() => void)[]>([]);
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
      }; --pad: ${look.padding}px; }`;
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
      focus: (atEnd) => post({ type: 'focus', end: atEnd }),
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
        case 'error':
          p.onError?.(String(m.message));
          break;
      }
    },
    [sendLook],
  );

  // The look can change while the page is open (text size, width).
  const lookKey = `${props.look.fontSize}/${props.look.lineHeight}/${props.look.maxWidth}/${props.look.padding}`;
  useMemo(() => sendLook(props.look), [lookKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
