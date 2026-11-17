// Builds the chapter editor page (editor-web/) into one HTML string the app carries: src/editor/editorPage.generated.ts.
// Run after changing anything in editor-web/:   npm run build:editor
//
// The page loads nothing from a network. Its fonts are the app's own, which expo-font puts in the Android app's assets
// (file:///android_asset/fonts/), the base address the WebView opens the page at.

import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const result = await build({
  entryPoints: [join(root, 'editor-web', 'main.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
});
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const css = `
@font-face { font-family: 'Merriweather'; src: url('fonts/Merriweather.ttf'); }
@font-face { font-family: 'Merriweather'; font-style: italic; src: url('fonts/Merriweather-Italic.ttf'); }
@font-face { font-family: 'Cinzel'; src: url('fonts/Cinzel.ttf'); }
@font-face { font-family: 'Outfit'; src: url('fonts/Outfit.ttf'); }
@font-face { font-family: 'JetBrains Mono'; src: url('fonts/JetBrainsMono.ttf'); }
:root {
  --size: 18px; --line: 1.7; --para: 0.9em; --width: 720px; --pad: 20px;
  --text: #F8FAFC; --muted: #94A3B8; --gold: #F3B63A; --sky: #38BDF8; --page: transparent;
  --font: 'Merriweather', Georgia, serif; --heading: 'Cinzel', Georgia, serif;
}
/* Set like a book: a raised first letter and small capitals on the chapter's first paragraph (display only). */
body.book-setting #editor .ProseMirror > p:first-child::first-letter {
  float: left; font-family: var(--heading); color: var(--gold); font-size: 2.6em; line-height: 0.9;
  padding: 0.06em 0.08em 0 0;
}
body.book-setting #editor .ProseMirror > p:first-child::first-line { font-variant: small-caps; letter-spacing: 0.03em; }
body.book-setting #editor .ProseMirror p.scene-break { text-align: center; letter-spacing: 0.5em; color: var(--muted); }
/* Focus mode's typewriter: the text fades away from the line being typed, which stays at 45% of the page. */
html.typewriter { -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 28%, #000 62%, transparent 100%); }
#editor .ProseMirror .listen-current { background: rgba(56, 189, 248, 0.28); border-radius: 3px; }
/* The red pencil: echoes wavy, long sentences straight, fillers dotted. */
#editor .ProseMirror .pencil-echo { text-decoration: underline wavy #F87171; text-underline-offset: 4px; }
#editor .ProseMirror .pencil-long { text-decoration: underline solid var(--sky); text-underline-offset: 4px; }
#editor .ProseMirror .pencil-filler { text-decoration: underline dotted var(--gold); text-decoration-thickness: 2px; text-underline-offset: 4px; }
/* Voices: narration dimmed, each speaker's lines in their colour; a line nobody is named for, underlined. */
#editor .ProseMirror.lens-voices p, #editor .ProseMirror.lens-voices h1, #editor .ProseMirror.lens-voices h2,
#editor .ProseMirror.lens-voices h3 { color: var(--muted); }
#editor .ProseMirror.lens-voices .voice-unknown { color: var(--text); text-decoration: underline dotted var(--muted); text-underline-offset: 4px; }
/* Gaps: TK and [[notes]] to come back to, as sticky notes. */
#editor .ProseMirror .gap { background: rgba(243, 182, 58, 0.2); color: var(--gold); border-radius: 3px; padding: 0 2px; }`;
const cssRest = `
html, body { margin: 0; padding: 0; background: var(--page); -webkit-text-size-adjust: 100%; }
body { color: var(--text); }
#editor .ProseMirror {
  outline: none; min-height: 100vh; box-sizing: border-box;
  max-width: var(--width); margin: 0 auto; padding: 12px var(--pad) 50vh;
  font-family: var(--font); font-size: var(--size); line-height: var(--line); color: var(--text);
  caret-color: var(--gold); white-space: pre-wrap; word-wrap: break-word; tab-size: 4; -moz-tab-size: 4;
}
#editor .ProseMirror p { margin: 0 0 var(--para); }
#editor .ProseMirror h1, #editor .ProseMirror h2, #editor .ProseMirror h3 {
  font-family: var(--heading); color: var(--gold); font-weight: 400; line-height: 1.3; margin: 1.2em 0 0.6em;
}
#editor .ProseMirror h1 { font-size: 1.6em; } #editor .ProseMirror h2 { font-size: 1.35em; } #editor .ProseMirror h3 { font-size: 1.15em; }
#editor .ProseMirror blockquote { margin: 0 0 var(--para); padding-left: 1em; border-left: 3px solid var(--gold); color: #E2E8F0; }
#editor .ProseMirror ul, #editor .ProseMirror ol { padding-left: 1.4em; margin: 0 0 var(--para); }
#editor .ProseMirror li p { margin: 0 0 0.3em; }
#editor .ProseMirror hr { border: none; border-top: 1px solid #272E40; margin: 1.5em 0; }
#editor .ProseMirror .entity-link { text-decoration: underline dotted var(--gold); text-underline-offset: 3px; }
#editor .ProseMirror .find-match { background: rgba(56, 189, 248, 0.25); border-radius: 2px; }
#editor .ProseMirror .find-current { background: rgba(243, 182, 58, 0.5); border-radius: 2px; }
#editor .ProseMirror ::selection { background: rgba(243, 182, 58, 0.35); }
#editor .ProseMirror[contenteditable="false"] { caret-color: transparent; }
#editor { position: relative; z-index: 1; }
/* Today's ink: a stroke in the margin beside each paragraph written or changed today. */
#editor .ProseMirror .fresh-ink { position: relative; }
#editor .ProseMirror .fresh-ink::before {
  content: ''; position: absolute; left: calc(-1 * var(--pad) + 6px); top: 0.25em; bottom: 0.25em; width: 3px;
  border-radius: 2px; background: var(--sky); opacity: 0.75;
}
/* The chapter's end: the printer's mark, the author's name, and what comes next. */
html:not(.typewriter) body.has-end #editor .ProseMirror { min-height: 60vh; padding-bottom: 24px; }
.chapter-end { position: relative; z-index: 1; max-width: 480px; margin: 0 auto; padding: 24px var(--pad) 45vh; text-align: center; font-family: var(--font); color: var(--text); }
.chapter-end .end-slip { margin: 0 0 28px; padding: 12px 14px; border-left: 3px solid var(--gold); background: rgba(243, 182, 58, 0.08); border-radius: 4px; text-align: left; }
.chapter-end .end-slip.offer { border: none; background: none; padding: 0; text-align: center; }
.chapter-end .slip-label { font-family: 'Outfit', sans-serif; font-size: 11px; letter-spacing: 2px; color: var(--gold); }
.chapter-end .slip-text { margin-top: 4px; font-style: italic; font-size: 16px; line-height: 1.5; }
.chapter-end .slip-buttons { display: flex; gap: 8px; margin-top: 8px; }
.chapter-end .end-slip button { min-height: 40px; padding: 8px 14px; border: 1px solid var(--gold); border-radius: 10px; background: none; color: var(--gold); font-family: 'Outfit', sans-serif; font-size: 14px; }
.chapter-end .end-mark { display: flex; align-items: center; gap: 12px; color: var(--gold); font-size: 10px; letter-spacing: 4px; }
.chapter-end .end-mark span { flex: 1; height: 1px; background: var(--gold); opacity: 0.5; }
.chapter-end .end-author { margin-top: 20px; font-style: italic; font-size: 28px; }
.chapter-end .end-kicker { margin-top: 28px; font-family: 'Outfit', sans-serif; font-size: 12px; letter-spacing: 2px; color: var(--gold); text-transform: uppercase; }
.chapter-end .end-title { margin-top: 6px; font-size: 22px; line-height: 1.3; }
.chapter-end .end-note { margin-top: 4px; font-size: 15px; font-style: italic; color: var(--muted); }
.chapter-end .end-button {
  margin-top: 16px; min-height: 44px; padding: 10px 20px; border: none; border-radius: 10px; background: var(--gold);
  color: #0A0B0E; font-family: 'Outfit', sans-serif; font-size: 15px;
}
`;

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>${css}${cssRest}</style><style id="dynamic-style"></style></head>
<body><div id="editor"></div><script>${script}</script></body></html>`;

const out = `// GENERATED by tool/build-editor.mjs from editor-web/: do not edit. Rebuild with \`npm run build:editor\`.
// The chapter editor page (TipTap with the manuscript schema), ${Math.round(html.length / 1024)} KB.
export const editorPageHtml: string = ${JSON.stringify(html)};
`;
writeFileSync(join(root, 'src', 'editor', 'editorPage.generated.ts'), out);
console.log(`Built src/editor/editorPage.generated.ts (${Math.round(html.length / 1024)} KB)`);
