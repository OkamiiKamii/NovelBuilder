// EXPORTING DATA: one view (a picture of it, the picture on a page, or its records), or records of the kinds the author
// picks. Made on this device, shared only where the author chooses. Private notes and secrets are left out unless
// ticked in. Never a backup, and every file says so. A port of flutter_app/lib/features/exchange/data_export_dialog.dart.

import { File } from 'expo-file-system';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { shareBytesFile } from '../../data/files';
import { ChartFilter, analyticsCharts } from '../../domain/analytics/charts';
import { picturePdf } from '../../domain/exchange/picturePdf';
import {
  type ExportedRecords,
  exportFileName,
  exportRecords,
  filterWords,
  namesJson,
  notABackup,
  privateFields,
  recordKindWords,
  recordKinds,
  recordsCsv,
  recordsJson,
  viewData,
} from '../../domain/exchange/recordsExport';
import { type JsonMap, mapOrNull } from '../../domain/json';
import type { StoryModel } from '../../domain/model/storyModel';
import { whenWords } from '../../domain/progression/track';
import type { NovelSnapshot } from '../../domain/snapshot/novelSnapshot';
import { viewOf } from '../../domain/visualize/views';
import { plural } from '../../domain/desk/format';
import { Sheet } from '../dialogs';
import { GoldButton, Icon, Muted, OutlineButton } from '../kit';
import { colors, fonts, space } from '../theme';

type Format = 'png' | 'pdf' | 'json' | 'csv';
const formatWords: Readonly<Record<Format, readonly [string, string]>> = {
  png: ['Picture (PNG)', 'The view as it is shown, with its title, the novel, the filters and the date above it.'],
  pdf: ['PDF', 'The same picture on a page, ready to print or keep.'],
  json: [
    'Records (JSON)',
    'The records, as the app keeps them (every field, with stable ids), narrowed by the filters, with the names of what they point at.',
  ],
  csv: ['Table (CSV)', 'The same records as tables for a spreadsheet: one table per kind, ids shown as names.'],
};

/** The view an export was opened from. `capture` makes a picture of it with `heading` drawn above it, and returns
 * the picture's file. */
export type ExportedView = {
  key: string;
  filter: JsonMap;
  config: JsonMap;
  keep: (id: string) => boolean;
  capture: (heading: readonly string[], format: 'png' | 'jpg') => Promise<string>;
};

const two = (n: number) => String(n).padStart(2, '0');
const dateWords = (at: Date) =>
  `${at.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}, ${two(at.getHours())}:${two(at.getMinutes())}`;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function DataExportSheet({
  snapshot,
  model,
  view,
  onClose,
}: {
  snapshot: NovelSnapshot;
  model: StoryModel;
  view: ExportedView | null;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<Format>(view === null ? 'json' : 'png');
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set(['characters', 'places', 'events', 'threads']));
  const [withPrivate, setPrivate] = useState(false);
  const [withSecrets, setSecrets] = useState(false);
  const [working, setWorking] = useState(false);
  const [said, setSaid] = useState<{ text: string; error: boolean } | null>(null);

  const title = model.novel.title;
  const info = view === null ? null : viewOf(view.key);
  const kinds = view === null ? recordKinds.filter((k) => chosen.has(k)) : [...(viewData[view.key] ?? [])];
  const filters = (): string[] => {
    if (view === null) return [];
    const words = filterWords(view.filter, model, (at) => whenWords(at, model));
    if (view.config['mode'] === 'list') words.push('Shown as a list');
    return words;
  };
  const words = filters();
  const formats: readonly Format[] = view === null ? ['json', 'csv'] : ['png', 'pdf', 'json', 'csv'];
  const hasPrivate = kinds.some((k) => k in privateFields);
  const hasSecrets = kinds.includes('secrets');
  const records = (): ExportedRecords => {
    let charts: JsonMap[] | null = null;
    if (view?.key === 'charts') {
      charts = analyticsCharts(model, ChartFilter.of(mapOrNull(view.config['layout']) ?? {}, model)).map((c) => ({
        key: c.key,
        title: c.title,
        uses: c.uses,
        empty: c.empty,
        notes: c.notes,
        table: { columns: c.columns, rows: c.rows },
      }));
    }
    return exportRecords(model, kinds, {
      keep: view?.keep,
      includePrivate: withPrivate,
      secrets: hasSecrets && withSecrets ? [...snapshot.rows('characterSecrets')] : null,
      charts,
    });
  };

  const run = async () => {
    setWorking(true);
    setSaid(null);
    const at = new Date();
    const file = (ext: string) => exportFileName(title, view?.key ?? 'records', at, ext);
    try {
      let result: string;
      switch (format) {
        case 'png':
        case 'pdf': {
          const heading = [
            `${info?.label ?? 'View'}: ${title}`,
            `${words.length === 0 ? 'No filters' : words.join(' · ')} · exported ${dateWords(at)}`,
          ];
          const uri = await view!.capture(heading, format === 'png' ? 'png' : 'jpg');
          const bytes = await new File(uri).bytes();
          const name = file(format);
          if (format === 'png') await shareBytesFile(name, bytes, 'image/png');
          else await shareBytesFile(name, picturePdf(bytes, { title: `${info?.label ?? ''}: ${title}` }), 'application/pdf');
          result = `Shared “${name}”`;
          break;
        }
        case 'json': {
          const data = records();
          const envelope: JsonMap = {
            format: view === null ? 'novel-builder/records-export' : 'novel-builder/view-export',
            version: 1,
            exportedAt: at.toISOString(),
            novel: { id: model.novel.id, title },
            ...(view !== null
              ? { view: { key: view.key, label: info?.label ?? null, description: info?.description ?? null, shownAs: view.config['mode'] === 'list' ? 'list' : 'drawing' } }
              : { kinds }),
            filters: words,
            notABackup,
            leftOut: [
              'The text of chapters and scenes, and everything not of the kinds exported.',
              ...(!withPrivate && hasPrivate ? ['Private notes on codex entries, chapters and scenes.'] : []),
              ...(hasSecrets && !withSecrets ? ['Secrets: they are included only when you choose to.'] : []),
              ...(words.length > 0 ? ['Records the page’s filters leave out.'] : []),
            ],
            names: namesJson(data),
            records: recordsJson(data),
          };
          const name = file('json');
          await shareBytesFile(name, new TextEncoder().encode(JSON.stringify(envelope, null, 2)), 'application/json');
          result = `Shared “${name}”: ${plural(data.count, 'record')}`;
          break;
        }
        case 'csv': {
          const data = records();
          const heading = [
            view === null ? `Records of ${title}` : `${info?.label ?? view.key}: ${title}`,
            `Exported ${at.toISOString()}`,
            words.length === 0 ? 'No filters' : `Filters: ${words.join('; ')}`,
            notABackup,
          ];
          const name = file('csv');
          await shareBytesFile(name, new TextEncoder().encode(recordsCsv(data, heading)), 'text/csv');
          result = `Shared “${name}”: ${plural(data.count, 'record')}`;
          break;
        }
      }
      setSaid({ text: `${result}.`, error: false });
    } catch (e) {
      setSaid({ text: `The export could not be made: ${message(e)}. Nothing has changed.`, error: true });
    } finally {
      setWorking(false);
    }
  };

  const tick = (on: boolean, label: string, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} style={styles.tick} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}>
      <Icon name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} color={on ? colors.gold : colors.muted} />
      <Text style={[styles.body, styles.flex]}>{label}</Text>
    </Pressable>
  );
  const records_ = format === 'json' || format === 'csv';

  return (
    <Sheet
      visible
      onClose={onClose}
      title={view === null ? 'Export records' : `Export “${info?.label ?? view.key}”`}
      footer={
        <View style={styles.footerRow}>
          <OutlineButton label="Close" tone="muted" onPress={onClose} style={styles.flex} />
          <GoldButton label={working ? 'Exporting…' : 'Export'} icon="export-variant" disabled={working || kinds.length === 0} onPress={() => void run()} style={styles.flex} />
        </View>
      }
    >
      {view === null && (
        <>
          <Text style={styles.label}>WHICH RECORDS</Text>
          {recordKinds
            .filter((k) => k !== 'charts' && k !== 'abilities')
            .map((k) =>
              tick(chosen.has(k), recordKindWords[k]![1], () => {
                const next = new Set(chosen);
                if (next.has(k)) next.delete(k);
                else next.add(k);
                setChosen(next);
              }),
            )}
        </>
      )}
      <Text style={styles.label}>AS</Text>
      {formats.map((f) => (
        <Pressable
          key={f}
          onPress={() => (setFormat(f), setSaid(null))}
          style={styles.tick}
          accessibilityRole="radio"
          accessibilityState={{ selected: f === format }}
          accessibilityLabel={formatWords[f][0]}
        >
          <Icon name={f === format ? 'radiobox-marked' : 'radiobox-blank'} color={f === format ? colors.gold : colors.muted} />
          <View style={styles.flex}>
            <Text style={styles.body}>{formatWords[f][0]}</Text>
            <Muted>{formatWords[f][1]}</Muted>
          </View>
        </Pressable>
      ))}
      {view !== null && (
        <Text style={styles.body}>
          {words.length === 0
            ? 'With it: the view’s title, the novel, the date, and no filters (everything the view shows).'
            : `With it: the view’s title, the novel, the date, and these filters and settings: ${words.join('; ')}.`}
        </Text>
      )}
      {records_ && hasPrivate && tick(withPrivate, 'Include private notes (on codex entries, chapters and scenes)', () => setPrivate(!withPrivate))}
      {records_ && hasSecrets && tick(withSecrets, 'Include the secrets themselves', () => setSecrets(!withSecrets))}
      {view?.key === 'knowledge' && !records_ && <Text style={styles.body}>This view shows secrets: a picture holds what is on screen.</Text>}
      <Muted>This is not a backup. To keep or move the whole novel, use Library → Export backup.</Muted>
      {said && (
        <Text style={said.error ? styles.error : styles.body} accessibilityLiveRegion="polite">
          {said.text}
        </Text>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // The sheet's footer is a row already: this one takes its whole width, or the buttons in it shrink to nothing.
  footerRow: { flex: 1, flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: space.sm },
  label: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.gold, marginTop: space.sm },
  body: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  error: { fontFamily: fonts.ui, fontSize: 14, color: colors.danger },
  tick: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingVertical: 4 },
});
