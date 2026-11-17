// The reader's sheets: how the book looks (FEATURES.md #129, #130), its contents, and publishing it (#133, #134).
// Ports of the Flutter reader's AppearanceControls and _Contents (reader_page.dart) and PublishDialog
// (publish_dialog.dart). Publishing shows what the file will hold before anything is made, makes it on this device
// from the book as saved, and sends it only where the author chooses; nothing in the novel changes.

import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { shareBytesFile } from '../../data/files';
import { formatNumber, plural } from '../../domain/desk/format';
import {
  BookOutputError,
  epubIdentifier,
  renderEpub,
  renderSerialChapter,
  renderSerialZip,
  type SerialFormat,
  serialFileName,
  serialFormats,
  serialHeading,
} from '../../domain/exchange/renderBook';
import type { JsonMap } from '../../domain/json';
import { str } from '../../domain/json';
import { type Book, type BookSource, buildBook, type Section } from '../../domain/reader/book';
import {
  contrastOf,
  contrastVerdict,
  copyReaderPrefs,
  defaultReaderPrefs,
  paragraphStyles,
  type ReaderPrefs,
  readerDevices,
  readerFonts,
  readerIndentRange,
  readerLeadingRange,
  readerMeasureRange,
  readerSchemes,
  readerSizeRange,
  readerSpacingRange,
  resolveLook,
} from '../../domain/reader/readerPrefs';
import { Sheet } from '../dialogs';
import { Chip, GoldButton, Icon, Muted, OutlineButton } from '../kit';
import { colors, fonts, radius, space } from '../theme';
import { Stepper } from '../write/DeskSheets';

// ---------------------------------------------------------------------------------------------------- appearance

/** How the reader looks on this device: typeface, size, spacing, paragraphs and colours. Every change shows at once. */
export function AppearanceSheet({
  visible,
  prefs,
  showDevice,
  onChange,
  onClose,
}: {
  visible: boolean;
  prefs: ReaderPrefs;
  showDevice: boolean;
  onChange: (prefs: ReaderPrefs) => void;
  onClose: () => void;
}) {
  const look = resolveLook(prefs);
  const serial = prefs.format === 'serial';
  const contrast = contrastOf(look.background, look.text);
  const set = (changes: Partial<ReaderPrefs>) => onChange(copyReaderPrefs(prefs, changes));
  return (
    <Sheet visible={visible} onClose={onClose} title="Appearance">
      {serial ? (
        <Muted>A web serial always scrolls, as it does online.</Muted>
      ) : (
        <View style={styles.chips}>
          <Chip label="Pages" icon="book-open-page-variant-outline" selected={prefs.flow === 'paged'} onPress={() => set({ flow: 'paged' })} />
          <Chip label="Scroll" icon="swap-vertical" selected={prefs.flow === 'scroll'} onPress={() => set({ flow: 'scroll' })} />
        </View>
      )}
      <Text style={styles.label}>TYPEFACE</Text>
      <View style={styles.chips}>
        {readerFonts.map((f) => (
          <Chip key={f.key} label={f.label} selected={prefs.font === f.key} onPress={() => set({ font: f.key })} />
        ))}
      </View>
      <Stepper label="Text size" value={prefs.size} range={readerSizeRange} format={(v) => `${Math.round(v)} pt`} onChange={(v) => set({ size: v })} />
      <Stepper label="Line spacing" value={prefs.leading} range={readerLeadingRange} format={(v) => v.toFixed(2)} onChange={(v) => set({ leading: v })} />
      <Stepper
        label="Line length"
        value={prefs.measure}
        range={readerMeasureRange}
        format={(v) => `${Math.round(v)} characters`}
        onChange={(v) => set({ measure: v })}
      />
      <Text style={styles.label}>PARAGRAPHS</Text>
      <View style={styles.chips}>
        {paragraphStyles.map((p) => (
          <Chip key={p.key} label={p.label} selected={prefs.paragraphs === p.key} onPress={() => set({ paragraphs: p.key })} />
        ))}
      </View>
      {look.indented ? (
        <Stepper label="First-line indent" value={prefs.indent} range={readerIndentRange} format={(v) => `${v} em`} onChange={(v) => set({ indent: v })} />
      ) : (
        <Stepper
          label="Space between paragraphs"
          value={prefs.spacing}
          range={readerSpacingRange}
          format={(v) => `${v.toFixed(1)} lines`}
          onChange={(v) => set({ spacing: v })}
        />
      )}
      <View style={styles.toggle}>
        <View style={styles.flex}>
          <Text style={styles.toggleTitle}>Justified text</Text>
          {serial && <Muted>A web serial is set ragged-right, as browsers show it.</Muted>}
        </View>
        <Switch
          value={prefs.justify}
          onValueChange={(v) => set({ justify: v })}
          trackColor={{ true: colors.gold, false: colors.border }}
          thumbColor={colors.text}
          accessibilityLabel="Justified text"
        />
      </View>
      <Text style={styles.label}>COLOURS</Text>
      <View style={styles.chips}>
        {readerSchemes.map((s) => (
          <Chip key={s.key} label={s.label} selected={prefs.scheme === s.key} onPress={() => set({ scheme: s.key })} />
        ))}
      </View>
      {prefs.scheme === 'custom' && (
        <View style={styles.hexRow}>
          <HexField label="Page colour" value={prefs.customBg} onValid={(v) => set({ customBg: v })} />
          <HexField label="Text colour" value={prefs.customText} onValid={(v) => set({ customText: v })} />
        </View>
      )}
      <Text style={[styles.contrast, contrast < 4.5 && { color: colors.danger }]}>
        Contrast {contrast.toFixed(1)} to 1: {contrastVerdict(contrast)}.
      </Text>
      {showDevice && (
        <>
          <Text style={styles.label}>PREVIEW ON</Text>
          <View style={styles.chips}>
            {readerDevices.map((d) => (
              <Chip key={d.key} label={`${d.label} (${d.width} × ${d.height})`} selected={prefs.device === d.key} onPress={() => set({ device: d.key })} />
            ))}
          </View>
        </>
      )}
      <OutlineButton
        label="Back to the usual look"
        icon="restore"
        tone="muted"
        compact
        onPress={() => onChange(copyReaderPrefs(defaultReaderPrefs, { format: prefs.format }))}
        style={styles.reset}
      />
    </Sheet>
  );
}

/** A colour typed as #rrggbb. Only a whole colour is applied; until then the last one stays. */
function HexField({ label, value, onValid }: { label: string; value: string; onValid: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <View style={styles.hex}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={styles.hexInput}>
        <View style={[styles.swatch, { backgroundColor: /^#[0-9a-fA-F]{6}$/.test(text) ? text : value }]} />
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onValid(v.toLowerCase());
          }}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={7}
          style={styles.hexText}
          accessibilityLabel={label}
          selectionColor={colors.gold}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- contents

export function ContentsSheet({
  visible,
  book,
  current,
  onJump,
  onClose,
}: {
  visible: boolean;
  book: Book;
  current: number;
  onJump: (index: number) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Contents">
      {book.sections.map((s, i) =>
        s.kind === 'contents' ? null : (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            accessibilityState={{ selected: i === current }}
            onPress={() => onJump(i)}
            style={({ pressed }) => [styles.entry, { paddingLeft: space.sm + 16 * s.depth }, i === current && styles.entryOn, pressed && { backgroundColor: colors.elevated }]}
          >
            <Text style={[styles.entryTitle, i === current && { color: colors.gold }]} numberOfLines={2}>
              {s.showsLabel ? `${s.label}: ${s.title}` : s.title}
            </Text>
            {s.words > 0 && <Muted>{plural(s.words, 'word')}</Muted>}
          </Pressable>
        ),
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------------- publishing

type PublishKind = 'epub' | 'serialAll' | 'serialOne';
const publishKinds: { key: PublishKind; label: string; hint: string }[] = [
  { key: 'epub', label: 'Ebook (EPUB)', hint: 'One file for Apple Books, Kobo, Google Play Books, and Kindle through Send to Kindle.' },
  {
    key: 'serialAll',
    label: 'Web serial: every chapter',
    hint: 'Each chapter as its own file, with its heading and your notes before and after, in one zip.',
  },
  { key: 'serialOne', label: 'Web serial: one chapter', hint: 'One chapter, ready to paste into a serial site or save as a file.' },
];

const mimeOf: Record<SerialFormat, string> = { html: 'text/html', markdown: 'text/markdown', text: 'text/plain' };

function safe(s: string): string {
  return s
    .trim()
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ');
}

/** PREVIEW BEFORE EXPORT: what a publishing file will hold is shown in full (every page in order) before anything is
 * made; the reader shows the same book drawn. */
export function PublishSheet({
  visible,
  project,
  source,
  onClose,
}: {
  visible: boolean;
  project: JsonMap;
  source: BookSource;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<PublishKind>('epub');
  const [format, setFormat] = useState<SerialFormat>('html');
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => {
    if (visible) setMessage(null);
  }, [visible]);

  const book = buildBook(source, kind === 'epub' ? 'ebook' : 'serial');
  const chapters: Section[] = book.sections.filter((s) => s.kind === 'chapter');
  const chapter = chapters.find((c) => c.id === chapterId) ?? chapters[0] ?? null;
  const written = chapters.filter((c) => c.words > 0).length;
  const pages =
    kind === 'epub'
      ? book.sections.map((s) => (s.kind === 'contents' ? 'Contents' : s.showsLabel ? `${s.label}: ${s.title}` : s.title))
      : kind === 'serialAll'
        ? chapters.map((s, i) => serialFileName(s, i, format))
        : chapter
          ? [serialHeading(chapter)]
          : [];
  const empty = written === 0;
  const base = safe(book.title) === '' ? 'Untitled novel' : safe(book.title);

  const save = async () => {
    setWorking(true);
    setMessage(null);
    try {
      if (kind === 'epub') {
        const result = renderEpub(book, { identifier: epubIdentifier(project), language: str(project['language'], 'en'), modified: new Date() });
        await shareBytesFile(`${base}.epub`, result.bytes, 'application/epub+zip');
        setMessage({ text: ['The ebook was made. Nothing in the novel changed.', ...result.notes.map((n) => n.text)].join(' '), error: false });
      } else if (kind === 'serialAll') {
        await shareBytesFile(`${base} - web serial.zip`, renderSerialZip(book, format), 'application/zip');
        setMessage({ text: 'The chapters were made. Nothing in the novel changed.', error: false });
      } else if (chapter) {
        const text = renderSerialChapter(book, chapter, format);
        const bytes = new TextEncoder().encode(text);
        await shareBytesFile(`${base} - ${serialFileName(chapter, chapters.indexOf(chapter), format)}`, bytes, mimeOf[format]);
        setMessage({ text: 'The chapter was made. Nothing in the novel changed.', error: false });
      }
    } catch (e) {
      setMessage({
        text: e instanceof BookOutputError ? e.message : `The file could not be made: ${e instanceof Error ? e.message : String(e)}. Nothing has changed.`,
        error: true,
      });
    } finally {
      setWorking(false);
    }
  };

  const copy = async () => {
    if (!chapter) return;
    await Clipboard.setStringAsync(renderSerialChapter(book, chapter, format));
    const label = serialFormats.find((f) => f.key === format)!.label.toLowerCase();
    setMessage({ text: `Copied "${serialHeading(chapter)}" as ${label}. Nothing in the novel changed.`, error: false });
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Publish"
      wide
      footer={
        <>
          <OutlineButton label="Close" onPress={onClose} tone="muted" style={styles.flex} />
          {kind === 'serialOne' && <OutlineButton label="Copy" icon="content-copy" onPress={() => void copy()} disabled={empty || !chapter} style={styles.flex} />}
          <GoldButton label={working ? 'Making…' : 'Save…'} icon="share-variant" onPress={() => void save()} disabled={empty || working} style={styles.flex} />
        </>
      }
    >
      {publishKinds.map((k) => (
        <Pressable
          key={k.key}
          accessibilityRole="radio"
          accessibilityState={{ checked: kind === k.key }}
          onPress={() => !working && setKind(k.key)}
          style={styles.kind}
        >
          <Icon name={kind === k.key ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={kind === k.key ? colors.gold : colors.muted} />
          <View style={styles.flex}>
            <Text style={styles.kindLabel}>{k.label}</Text>
            <Muted>{k.hint}</Muted>
          </View>
        </Pressable>
      ))}
      {kind !== 'epub' && (
        <>
          <Text style={styles.label}>EACH CHAPTER AS</Text>
          <View style={styles.chips}>
            {serialFormats.map((f) => (
              <Chip key={f.key} label={`${f.label} (.${f.extension})`} selected={format === f.key} onPress={() => setFormat(f.key)} />
            ))}
          </View>
        </>
      )}
      {kind === 'serialOne' && chapters.length > 0 && (
        <>
          <Text style={styles.label}>CHAPTER</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {chapters.map((c) => (
              <Chip key={c.id} label={serialHeading(c)} selected={chapter?.id === c.id} onPress={() => setChapterId(c.id)} />
            ))}
          </ScrollView>
        </>
      )}
      <Text style={styles.holdTitle}>What it will hold</Text>
      <Muted>
        {empty
          ? 'No chapter has text yet: there is nothing to publish. Write a chapter first.'
          : `${pages.length} ${kind === 'epub' ? 'pages' : pages.length === 1 ? 'chapter' : 'chapters'}, ${formatNumber(book.words)} words of story. Your text goes out exactly as written; ${
              kind === 'epub' ? 'serial notes are left out of an ebook.' : 'your notes before and after each chapter are included.'
            }`}
      </Muted>
      {!empty && (
        <ScrollView style={styles.holds} nestedScrollEnabled>
          {pages.map((p, i) => (
            <View key={`${i}:${p}`} style={styles.hold}>
              <Text style={styles.holdNumber}>{i + 1}</Text>
              <Text style={styles.holdText} numberOfLines={1}>
                {p}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
      {kind === 'epub' && (book.cover?.startsWith('http') ?? false) && (
        <Muted>The cover is a web address, which this app never fetches, so the ebook opens on its title page instead.</Muted>
      )}
      <Muted style={styles.note}>The reader shows this book drawn, page by page: choose its format there to look before you save.</Muted>
      {message && <Text style={[styles.message, message.error && { color: colors.danger }]}>{message.text}</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold, marginTop: space.md, marginBottom: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md },
  toggleTitle: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  hexRow: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap' },
  hex: { flex: 1, minWidth: 140 },
  hexInput: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.field, backgroundColor: colors.elevated, paddingHorizontal: space.sm },
  swatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: colors.border },
  hexText: { flex: 1, minHeight: 44, color: colors.text, fontFamily: fonts.numbers, fontSize: 15 },
  contrast: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, marginTop: space.sm },
  reset: { alignSelf: 'flex-start', marginTop: space.md },
  entry: { minHeight: 52, justifyContent: 'center', paddingRight: space.sm, borderRadius: radius.field },
  entryOn: { backgroundColor: '#3A2A08' },
  entryTitle: { fontFamily: fonts.book, fontSize: 16, color: colors.text },
  kind: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm, alignItems: 'flex-start' },
  kindLabel: { fontFamily: fonts.ui, fontSize: 16, color: colors.text },
  holdTitle: { fontFamily: fonts.ui, fontSize: 15, color: colors.text, marginTop: space.md },
  holds: { marginTop: space.sm, maxHeight: 180, borderWidth: 1, borderColor: colors.border, borderRadius: radius.field, paddingVertical: 4, overflow: 'hidden' },
  hold: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.md, paddingVertical: 4 },
  holdNumber: { width: 24, fontFamily: fonts.numbers, fontSize: 12, color: colors.muted },
  holdText: { flex: 1, fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  note: { marginTop: space.md },
  message: { fontFamily: fonts.ui, fontSize: 14, color: colors.success, marginTop: space.sm },
});
