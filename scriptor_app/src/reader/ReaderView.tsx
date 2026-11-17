// The reader's page in the app: reader-web/ (built into readerPage.generated.ts) in a WebView, opened at the app's own
// Android assets so its fonts are there; nothing is loaded from a network, and links in the book never navigate.

import { type ComponentType, forwardRef, type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView as WebViewClass, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import { readerPageHtml } from './readerPage.generated';

type WebView = WebViewClass;
const WebView = WebViewClass as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewClass> }>;

export type ReaderMode = 'paged' | 'scroll' | 'serial';
export type ReaderSectionHtml = { id: string; html: string };
export type ReaderPlaceReport = { section: number; page: number; pages: number; fraction: number };

export type ReaderViewHandle = {
  /** Shows the book from a place (a section and how far through it, 0 to 1). */
  show(sections: ReaderSectionHtml[], mode: ReaderMode, section: number, fraction: number): void;
  go(section: number, fraction?: number): void;
  turn(delta: number): void;
};

type Props = {
  /** The look as CSS custom properties (see bookCss). */
  css: string;
  onReady: () => void;
  onPlace: (place: ReaderPlaceReport) => void;
  onJump: (section: number) => void;
  onTap?: () => void;
  onError?: (message: string) => void;
};

export const ReaderView = forwardRef<ReaderViewHandle, Props>(function ReaderView(props, ref) {
  const web = useRef<WebView>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const post = useCallback((message: object) => {
    web.current?.injectJavaScript(
      `window.scriptorReader && window.scriptorReader.receive(${JSON.stringify(JSON.stringify(message))}); true;`,
    );
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      show: (sections, mode, section, fraction) => post({ type: 'book', sections, mode, section, fraction }),
      go: (section, fraction = 0) => post({ type: 'go', section, fraction }),
      turn: (delta) => post({ type: 'turn', delta }),
    }),
    [post],
  );

  useEffect(() => post({ type: 'style', css: props.css }), [props.css, post]);

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
          post({ type: 'style', css: p.css });
          p.onReady();
          break;
        case 'place':
          p.onPlace({ section: Number(m.section), page: Number(m.page), pages: Number(m.pages), fraction: Number(m.fraction) });
          break;
        case 'jump':
          p.onJump(Number(m.section));
          break;
        case 'tap':
          p.onTap?.();
          break;
        case 'error':
          p.onError?.(String(m.message));
          break;
      }
    },
    [post],
  );

  const source = useMemo(() => ({ html: readerPageHtml, baseUrl: 'file:///android_asset/' }), []);
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
      overScrollMode="never"
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(r: ShouldStartLoadRequest) => r.url.startsWith('file://') || r.url.startsWith('about:')}
      textZoom={100}
      onRenderProcessGone={() => web.current?.reload()}
    />
  );
});

const styles = StyleSheet.create({ web: { flex: 1, backgroundColor: 'transparent' } });
