// Exporting the manuscript (Word, PDF, Markdown, plain text or a web page; the clean text for readers, a complete bible
// with planning, notes and lore, or anything between; the whole book or one part) and importing one (.txt, .md, .docx
// or .rtf: what it becomes shown first, added only when confirmed, all or nothing). Ports of
// flutter_app/lib/features/exchange/{export_dialog,import_dialog}.dart. Made on the phone; files go only where the
// author chooses.

import { useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { ExchangeService, type ExportFormat, exportFormatLabel, exportFormatMime, exportFormatNoun, exportFormats } from '../../data/exchangeService';
import { pickBytesFile, shareBytesFile } from '../../data/files';
import { type Block, type Compiled, type ExportOptions, bibleExport, readerExport, sameSwitches } from '../../domain/exchange/compile';
import { type ImportBlock, ImportException } from '../../domain/exchange/importParse';
import { type ImportNode, buildStructure, metricsOf, summarise } from '../../domain/exchange/importStructure';
import { PdfCannotDraw, pdfMissing, pdfTextOf } from '../../domain/exchange/renderPdf';
import { OutlineError, kindLabel } from '../../domain/outline';
import { formatNumber, plural } from '../../domain/desk/format';
import { Sheet } from '../dialogs';
import { Chip, GoldButton, Muted, OutlineButton } from '../kit';
import { ChooserField } from '../organize/parts';
import { colors, fonts, space } from '../theme';

const switches: readonly [keyof Omit<ExportOptions, 'scopeId'>, string, string][] = [
  ['manuscript', 'Manuscript content', 'The text of chapters and scenes'],
  ['titles', 'Chapter titles & scene break dividers', 'Title page, volume and chapter headings, * * * between scenes'],
  ['notes', 'Author private notes', 'Your notes on chapters, scenes and World entries'],
  ['lore', 'Worldbuilding & lore profiles', 'World entries, as an appendix'],
  ['planning', 'Chapter/scene planning sheets', 'Objectives, summaries, beats, dynamics'],
  ['history', 'Draft revision history', 'The log of saved versions and the text of alternate drafts'],
];

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

// --------------------------------------------------------------------------------------------- export the manuscript

export function ExportManuscriptSheet({ exchange, novelId, title, onClose }: { exchange: ExchangeService; novelId: string; title: string; onClose: () => void }) {
  const [format, setFormat] = useState<ExportFormat>('docx');
  const [options, setOptions] = useState<ExportOptions>(readerExport);
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [said, setSaid] = useState<{ text: string; error: boolean } | null>(null);
  const scopes = useMemo(() => exchange.scopes(novelId), [exchange, novelId]);
  const scope = scopes.some((s) => s.node.id === scopeId) ? scopeId : null;
  const compiled = useMemo<Compiled | { error: string }>(() => {
    try {
      return exchange.compile(novelId, { ...options, scopeId: scope });
    } catch (e) {
      return { error: message(e) };
    }
  }, [exchange, novelId, options, scope]);
  if ('error' in compiled) {
    return (
      <Sheet visible onClose={onClose} title="Export manuscript">
        <Muted>{`The export could not be made: ${compiled.error}`}</Muted>
      </Sheet>
    );
  }
  const nothing = compiled.blocks.length === 0;
  const missing = format === 'pdf' ? pdfMissing(pdfTextOf(compiled)) : [];
  const part = scopes.find((s) => s.node.id === scope)?.node.displayTitle ?? null;

  const run = async () => {
    setWorking(true);
    setSaid(null);
    try {
      const bytes = exchange.render(compiled, format);
      const name = ExchangeService.fileName(title, format, part);
      await shareBytesFile(name, bytes, exportFormatMime[format]);
      setSaid({ text: `Shared “${name}”. Nothing in the novel changed.`, error: false });
    } catch (e) {
      setSaid({ text: e instanceof PdfCannotDraw ? e.message : `The export could not be made: ${message(e)}. Nothing has changed.`, error: true });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Export manuscript"
      wide
      footer={
        <View style={styles.footerRow}>
          <OutlineButton label="Close" tone="muted" onPress={onClose} style={styles.flex} />
          <GoldButton
            label={working ? 'Exporting…' : `Export ${exportFormatNoun[format]}`}
            icon="export-variant"
            disabled={nothing || working || missing.length > 0}
            onPress={() => void run()}
            style={styles.flex}
          />
        </View>
      }
    >
      <Text style={styles.label}>FORMAT</Text>
      <View style={styles.wrap}>
        {exportFormats.map((f) => (
          <Chip key={f} label={exportFormatLabel[f]} selected={f === format} onPress={() => (setFormat(f), setSaid(null))} />
        ))}
      </View>
      <Text style={styles.label}>START FROM A PRESET</Text>
      <View style={styles.wrap}>
        <Chip label="Clean reader manuscript" selected={sameSwitches(options, readerExport)} onPress={() => setOptions(readerExport)} />
        <Chip label="Complete bible" selected={sameSwitches(options, bibleExport)} onPress={() => setOptions(bibleExport)} />
      </View>
      <Text style={styles.label}>INCLUDE</Text>
      {switches.map(([key, label, hint]) => (
        <View key={key} style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={styles.body}>{label}</Text>
            <Muted>{hint}</Muted>
          </View>
          <Switch
            value={options[key]}
            onValueChange={(on) => setOptions({ ...options, [key]: on })}
            trackColor={{ true: colors.gold, false: colors.border }}
            thumbColor={colors.text}
            accessibilityLabel={label}
          />
        </View>
      ))}
      <ChooserField
        label="Which part"
        value={scope ?? ''}
        choices={[{ value: '', label: 'Whole manuscript' }, ...scopes.map((s) => ({ value: s.node.id, label: `${'   '.repeat(s.depth)}${s.node.displayTitle}` }))]}
        onChoose={(v) => setScopeId(v.length === 0 ? null : v)}
      />
      <Text style={styles.body} accessibilityLiveRegion="polite">
        {nothing
          ? 'Nothing is selected to export.'
          : `${plural(compiled.chapterCount, 'chapter')}${options.manuscript ? ` · ${plural(compiled.wordCount, 'word')} of manuscript` : ' · no manuscript text'}`}
      </Text>
      {!nothing && <ExportPreview compiled={compiled} />}
      {missing.length > 0 && (
        <Text style={styles.error}>
          {`⚠ The PDF fonts cannot draw some characters in this text (${missing.slice(0, 8).join(' ')}). Choose Word or a web page instead: they keep every character.`}
        </Text>
      )}
      <Muted>A manuscript export holds only what is ticked above. It is not a backup: to keep or move the whole novel, use Library → Backup.</Muted>
      {said && (
        <Text style={said.error ? styles.error : styles.body} accessibilityLiveRegion="polite">
          {said.text}
        </Text>
      )}
    </Sheet>
  );
}

/** The start of the export, as it will read, before anything is made. */
function ExportPreview({ compiled }: { compiled: Compiled }) {
  const [open, setOpen] = useState(false);
  const shown = 60;
  const line = (b: Block, i: number) => {
    switch (b.type) {
      case 'heading':
        return (
          <Text key={i} style={b.level <= 1 ? styles.previewTitle : styles.previewHeading}>
            {b.text}
          </Text>
        );
      case 'paragraph':
        return (
          <Text key={i} style={[styles.previewText, b.quote && styles.quote]}>
            {b.runs.map((r, k) => (
              <Text
                key={k}
                style={{
                  fontWeight: r.bold ? '700' : undefined,
                  fontStyle: r.italic ? 'italic' : undefined,
                  textDecorationLine: r.underline && r.strike ? 'underline line-through' : r.underline ? 'underline' : r.strike ? 'line-through' : undefined,
                }}
              >
                {r.text}
              </Text>
            ))}
          </Text>
        );
      case 'divider':
        return (
          <Text key={i} style={[styles.previewText, styles.center]}>
            * * *
          </Text>
        );
      case 'field':
        return <Text key={i} style={styles.previewText}>{`${b.label}: ${b.text}`}</Text>;
      case 'list':
        return (
          <Text key={i} style={styles.previewText}>
            {b.items.map((t, k) => `${b.ordered ? `${k + 1}.` : '•'} ${t}`).join('\n')}
          </Text>
        );
    }
  };
  return (
    <View style={styles.gapSm}>
      <OutlineButton
        label={open ? 'Hide the preview' : 'Preview'}
        icon={open ? 'chevron-up' : 'chevron-down'}
        compact
        tone="muted"
        onPress={() => setOpen(!open)}
        style={styles.start}
      />
      {open && (
        <>
          <Muted>{compiled.blocks.length > shown ? `The first ${shown} of ${compiled.blocks.length} blocks` : 'All of it'}</Muted>
          <View style={styles.preview}>{compiled.blocks.slice(0, shown).map(line)}</View>
        </>
      )}
    </View>
  );
}

// --------------------------------------------------------------------------------------------- import a manuscript

/** Picks a manuscript file and reads it. Says why when it cannot be read; nothing is added either way. */
export async function pickManuscript(exchange: ExchangeService): Promise<{ name: string; blocks: ImportBlock[] } | { name: string; refused: string } | null> {
  const picked = await pickBytesFile();
  if (picked === null) return null;
  try {
    return { name: picked.name, blocks: exchange.read(picked.name, picked.bytes) };
  } catch (e) {
    if (e instanceof ImportException) return { name: picked.name, refused: `“${picked.name}”: ${e.reason} Nothing was imported, and the manuscript is unchanged.` };
    throw e;
  }
}

export function ImportManuscriptSheet({
  exchange,
  novelId,
  fileName,
  blocks,
  onDone,
  onClose,
}: {
  exchange: ExchangeService;
  novelId: string;
  fileName: string;
  blocks: ImportBlock[];
  onDone: (created: string[]) => void;
  onClose: () => void;
}) {
  const [splitChapters, setSplitChapters] = useState(true);
  const [splitScenes, setSplitScenes] = useState(true);
  const [parentId, setParentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const fallback = fileName.replace(/\.[^.]+$/, '');
  const nodes = useMemo(() => buildStructure(blocks, { splitChapters, splitScenes, fallbackTitle: fallback }), [blocks, splitChapters, splitScenes, fallback]);
  const summary = summarise(nodes);
  const hasGroups = nodes.some((n) => n.kind === 'volume' || n.kind === 'act' || n.kind === 'arc');
  const groups = useMemo(() => exchange.groups(novelId), [exchange, novelId]);
  const parent = groups.some((g) => g.node.id === parentId) ? parentId : null;
  const found = [
    ...(summary.volumes > 0 ? [plural(summary.volumes, 'volume')] : []),
    plural(summary.chapters, 'chapter'),
    ...(summary.scenes > 0 ? [plural(summary.scenes, 'scene')] : []),
  ].join(', ');

  const rows: { node: ImportNode; depth: number }[] = [];
  const walk = (list: readonly ImportNode[], depth: number) => {
    for (const node of list) {
      rows.push({ node, depth });
      walk(node.children, depth + 1);
    }
  };
  walk(nodes, 0);

  const run = () => {
    setWorking(true);
    try {
      onDone(exchange.importNodes(novelId, hasGroups ? null : parent, nodes));
    } catch (e) {
      setError(e instanceof OutlineError ? `${e.message} Nothing was added.` : `The import failed, and nothing was added: ${message(e)}`);
      setWorking(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={`Import ${fileName}`}
      wide
      footer={
        <View style={styles.footerRow}>
          <OutlineButton label="Cancel" tone="muted" onPress={onClose} style={styles.flex} />
          <GoldButton label={working ? 'Importing…' : 'Import'} icon="file-import-outline" disabled={nodes.length === 0 || working} onPress={run} style={styles.flex} />
        </View>
      }
    >
      <Text style={styles.body} accessibilityLiveRegion="polite">
        {nodes.length === 0 ? 'No text was found in this file.' : `Found ${found} · ${plural(summary.words, 'word')}.`}
      </Text>
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text style={styles.body}>Split into chapters at headings</Text>
          <Muted>Recognises heading styles and lines such as “Chapter 12”, “Prologue”, “Part Two”</Muted>
        </View>
        <Switch value={splitChapters} onValueChange={setSplitChapters} trackColor={{ true: colors.gold, false: colors.border }} thumbColor={colors.text} accessibilityLabel="Split into chapters at headings" />
      </View>
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text style={styles.body}>Split scenes at scene breaks</Text>
          <Muted>Lines such as * * *, # or ---. Off keeps them as dividers inside the chapter</Muted>
        </View>
        <Switch value={splitScenes} onValueChange={setSplitScenes} trackColor={{ true: colors.gold, false: colors.border }} thumbColor={colors.text} accessibilityLabel="Split scenes at scene breaks" />
      </View>
      {!hasGroups && groups.length > 0 && (
        <ChooserField
          label="Add to"
          value={parent ?? ''}
          choices={[{ value: '', label: 'End of the manuscript' }, ...groups.map((g) => ({ value: g.node.id, label: `${'   '.repeat(g.depth)}${g.node.displayTitle}` }))]}
          onChoose={(v) => setParentId(v.length === 0 ? null : v)}
        />
      )}
      <View style={styles.preview} accessibilityLabel="What will be added">
        {rows.slice(0, 300).map(({ node, depth }, i) => {
          const words = metricsOf(node.blocks).words;
          return (
            <View key={i} style={[styles.treeRow, { paddingLeft: depth * 18 }]}>
              <Text style={styles.kind}>{kindLabel[node.kind]}</Text>
              <Text style={[styles.body, styles.flex]} numberOfLines={1}>
                {node.title}
              </Text>
              {words > 0 && <Muted>{formatNumber(words)}</Muted>}
            </View>
          );
        })}
        {rows.length > 300 && <Muted>{`…and ${rows.length - 300} more.`}</Muted>}
      </View>
      <Muted>The text is added exactly as it is in the file, after everything already in this manuscript. Nothing existing is changed.</Muted>
      {error && <Text style={styles.error}>{error}</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // The sheet's footer is a row already: this one takes its whole width, or the buttons in it shrink to nothing.
  footerRow: { flex: 1, flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  gapSm: { gap: space.sm },
  start: { alignSelf: 'flex-start' },
  center: { textAlign: 'center' },
  label: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.gold, marginTop: space.sm },
  body: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  error: { fontFamily: fonts.ui, fontSize: 14, color: colors.danger },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 4 },
  preview: { maxHeight: 320, padding: space.md, gap: 4, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  previewTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.text, marginTop: 6 },
  previewHeading: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 6 },
  previewText: { fontFamily: fonts.book, fontSize: 14, lineHeight: 21, color: colors.text },
  quote: { paddingLeft: space.md, fontStyle: 'italic' },
  treeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 28 },
  kind: { fontFamily: fonts.ui, fontSize: 11, color: colors.muted, borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 6 },
});
