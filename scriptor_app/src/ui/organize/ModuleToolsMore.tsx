// Six of a module's tools (FEATURES.md #225): the LOG (lines through the story, with the arc chart of their values),
// the CALCULATOR, the RANKS and the INVENTORY (from the progression snapshots), the LINEAGE (the family tree drawn
// from Relationships) and a PAGE link. The matching parts of flutter_app/lib/features/modules/module_tools.dart; what
// each shows and changes is src/domain/modules/screens/tools.ts (its header gives the sizes followed here).

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, G, Line, Polyline } from 'react-native-svg';

import { characterPath } from '../../domain/characters/screens/create';
import { worldEntryPath } from '../../domain/codex/screens/entryPage';
import { str } from '../../domain/json';
import type { Entry } from '../../domain/records/entry';
import {
  type ToolAt,
  type ToolEmpty,
  arcColours,
  arcPoint,
  calculatorStart,
  calculatorTool,
  eventName,
  inventoryTool,
  lineageTool,
  logChanges,
  logTool,
  pageTool,
  ranksTool,
} from '../../domain/modules/screens/tools';
import { Chip, GoldButton, Icon, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, radius, space } from '../theme';
import { useToast } from '../toast';
import { lastNodeSetting } from '../write/WriteScreen';
import { ChooserField, SavedText } from './parts';
import type { OpenModules } from './useModules';

type ToolProps = { mods: OpenModules; at: ToolAt };

/** The pages a module may point at, as Scriptor has them (corePagePath gives the Flutter app's paths): every one now
 * exists; Relationships is the map, and Plan, Visualize and Review live under Organize. Null for anything unknown. */
function scriptorPath(path: string): string | null {
  switch (path) {
    case '/visualize':
      return '/organize/ties';
    default:
      return /^\/(organize|write|plan|visualize|review)(\/|$)/.test(path) ? path : null;
  }
}

const laterWords = 'Not in this app';

function useEntryLink() {
  const router = useRouter();
  return (e: Entry) => router.navigate((e.category === 'character' ? characterPath(e.id) : worldEntryPath(e.id)) as never);
}

function useOpenChapter(novelId: string) {
  const lib = useLibrary();
  const router = useRouter();
  return (nodeId: string) => {
    lib.saves.saveNow(`setting:${lastNodeSetting(novelId)}`, () => lib.settings.write(lastNodeSetting(novelId), nodeId));
    router.navigate('/write');
  };
}

/** An entry's name, pressed to open it. */
function EntryLink({ entry, big = false }: { entry: Entry; big?: boolean }) {
  const open = useEntryLink();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`Open ${entry.name}`} onPress={() => open(entry)} hitSlop={6}>
      <Text style={[big ? styles.cardTitle : styles.link]}>{entry.name.length === 0 ? 'Untitled' : entry.name}</Text>
    </Pressable>
  );
}

/** Where a tool has nothing yet: the line, and where to go (disabled when that page is not built yet). */
function Empty({ empty }: { empty: ToolEmpty }) {
  const router = useRouter();
  const path = scriptorPath(empty.path);
  return (
    <Panel style={styles.gap}>
      <Muted>{empty.text}</Muted>
      <OutlineButton
        label={path === null ? `${empty.action} · ${laterWords}` : empty.action}
        compact
        disabled={path === null}
        onPress={() => path && router.navigate(path as never)}
        style={styles.start}
      />
    </Panel>
  );
}

// -------------------------------------------------------------------------------------------------------- log

export function LogTool({ mods, at }: ToolProps) {
  const toast = useToast();
  const router = useRouter();
  const openEntry = useEntryLink();
  const openChapter = useOpenChapter(mods.novelId);
  const view = useMemo(() => logTool(at), [at]);
  const [title, setTitle] = useState('');
  const [chapter, setChapter] = useState('');
  const chapterChoices = (none: string) => [
    { value: '', label: none },
    ...view.chapters.ids.map((id) => ({ value: id, label: view.chapters.name(id) })),
  ];
  const add = (text: string, node: string | null) => {
    const change = logChanges.add(at, text, node);
    if (change && mods.now(change) !== undefined) setTitle('');
  };
  const update = (id: string, key: string, changes: Record<string, unknown>) => mods.later(`log:${id}:${key}`, logChanges.update(id, changes));
  const updateNow = (id: string, changes: Record<string, unknown>) => mods.now(logChanges.update(id, changes));
  const entryName = (id: string) => view.candidates.find((e) => e.id === id)?.name ?? id;

  return (
    <View style={styles.gap}>
      {view.chart && view.range && <ArcChart chart={view.chart} range={view.range} />}
      {view.add && (
        <Panel style={styles.gap}>
          <Text style={styles.label}>{view.add.label.toUpperCase()}</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={view.add.hint}
            placeholderTextColor={colors.muted}
            selectionColor={colors.gold}
            onSubmitEditing={() => add(title, chapter || null)}
            accessibilityLabel={view.add.label}
            style={styles.input}
          />
          <ChooserField label={view.add.chapter} value={chapter} choices={chapterChoices(view.add.none)} onChoose={setChapter} />
          <GoldButton label={view.add.add} icon="plus" compact disabled={title.trim().length === 0} onPress={() => add(title, chapter || null)} style={styles.start} />
        </Panel>
      )}
      {view.suggestions.length > 0 && (
        <View style={styles.wrap}>
          {view.suggestions.map((s) => (
            <Chip key={s} label={`+ ${s}`} selected={false} onPress={() => add(s, null)} />
          ))}
        </View>
      )}
      {view.empty && <Muted>{view.empty}</Muted>}
      {view.lines.map((l) =>
        !at.writes ? (
          <Panel key={l.id} style={styles.gapSm}>
            <Text style={styles.cardTitle}>{l.read.heading}</Text>
            {l.read.chapter !== null && <Muted>{l.read.chapter}</Muted>}
            {l.read.note !== null && <Text style={styles.body}>{l.read.note}</Text>}
          </Panel>
        ) : (
          <Panel key={l.id} style={styles.gapSm}>
            <View style={styles.lineHead}>
              {l.done && (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: l.done.value }}
                  accessibilityLabel={l.done.label}
                  onPress={() => updateNow(l.id, { done: !l.done!.value })}
                  hitSlop={8}
                >
                  <Icon name={l.done.value ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={l.done.value ? colors.gold : colors.muted} />
                </Pressable>
              )}
              <View style={styles.flex}>
                <SavedText label={l.titleLabel} value={l.title} onSave={(v) => update(l.id, 'title', { title: v })} />
              </View>
              <IconButton
                icon="delete-outline"
                label={l.removeLabel}
                color={colors.danger}
                onPress={() => {
                  if (mods.now(logChanges.remove(l.id)) !== undefined) toast(`Removed ${l.title}.`);
                }}
              />
            </View>
            {l.state && (
              <ChooserField
                label={l.state.label}
                value={l.state.value}
                choices={[...new Set([...(l.state.value.length > 0 && !l.state.options.includes(l.state.value) ? [l.state.value] : []), ...l.state.options])].map((o) => ({ value: o, label: o }))}
                onChoose={(v) => updateNow(l.id, { state: v })}
              />
            )}
            {l.value && <SavedText label={l.value.label} value={l.value.text} onSave={(v) => update(l.id, 'value', logChanges.value(v))} />}
            <ChooserField label={l.chapter.label} value={l.chapter.value ?? ''} choices={chapterChoices(l.chapter.none)} onChoose={(v) => updateNow(l.id, { nodeId: v || null })} />
            {l.second && (
              <ChooserField label={l.second.label} value={l.second.value ?? ''} choices={chapterChoices(l.second.none)} onChoose={(v) => updateNow(l.id, { endNodeId: v || null })} />
            )}
            {l.about && (
              <ChooserField
                label={l.about.label}
                value={l.about.value}
                choices={[{ value: '', label: l.about.none }, ...l.about.options.map((id) => ({ value: id, label: entryName(id) }))]}
                onChoose={(v) => updateNow(l.id, logChanges.about(v))}
              />
            )}
            {l.event && (
              <ChooserField
                label={l.event.label}
                value={l.event.value}
                choices={[{ value: '', label: l.event.none }, ...l.event.options.map((id) => ({ value: id, label: eventName(view.placed, id) }))]}
                onChoose={(v) => updateNow(l.id, logChanges.event(v))}
              />
            )}
            <SavedText label={l.notes.label} placeholder={l.notes.hint} value={l.notes.value} multiline minLines={2} onSave={(v) => update(l.id, 'note', { note: v })} />
            {l.links.length > 0 && (
              <View style={styles.wrap}>
                {l.links.map((k) => (
                  <Chip
                    key={`${k.kind}:${k.id}`}
                    label={k.label}
                    icon={k.kind === 'chapter' ? 'book-open-page-variant-outline' : k.kind === 'event' ? 'timeline-outline' : 'link-variant'}
                    selected={false}
                    onPress={() => {
                      if (k.kind === 'chapter') openChapter(k.id);
                      else if (k.kind === 'entry') {
                        const e = at.data.model.entries.get(k.id);
                        if (e) openEntry(e);
                      } else router.navigate(`/plan/event/${encodeURIComponent(k.id)}` as never);
                    }}
                  />
                ))}
              </View>
            )}
          </Panel>
        ),
      )}
    </View>
  );
}

function ArcChart({
  chart,
  range,
}: {
  chart: NonNullable<ReturnType<typeof logTool>['chart']>;
  range: { min: number; max: number; label: string };
}) {
  const [width, setWidth] = useState(0);
  if ('note' in chart) return <Muted>{chart.note}</Muted>;
  const height = 180;
  const box = { width, height, last: chart.last, min: range.min, max: range.max };
  return (
    <Panel style={styles.gapSm}>
      <View onLayout={(e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width))} accessibilityLabel={chart.semanticsLabel} style={{ height }}>
        {width > 0 && (
          <Svg width={width} height={height}>
            <Line x1={16} y1={16} x2={16} y2={height - 16} stroke={colors.border} strokeWidth={1} />
            <Line x1={16} y1={height - 16} x2={width - 16} y2={height - 16} stroke={colors.border} strokeWidth={1} />
            {chart.lines.map((line, i) => {
              const colour = arcColours[i % arcColours.length];
              const points = line.map((p) => arcPoint(p, box));
              return (
                <G key={i}>
                  <Polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={colour} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {points.map((p, j) => (
                    <Circle key={j} cx={p.x} cy={p.y} r={4} fill={colour} />
                  ))}
                </G>
              );
            })}
          </Svg>
        )}
      </View>
      <Muted>{chart.caption}</Muted>
      {chart.legend && (
        <View style={styles.wrap}>
          {chart.legend.map((g) => (
            <View key={g.name} style={styles.legend}>
              <View style={[styles.swatch, { backgroundColor: g.colour }]} />
              <Text style={styles.small}>{g.name}</Text>
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------- calculator

export function CalculatorTool({ at }: ToolProps) {
  const [values, setValues] = useState(() => calculatorStart(at.tool));
  const view = calculatorTool(at.tool, values);
  return (
    <Panel style={styles.gap}>
      <View style={styles.wrap}>
        {view.inputs.map((i) => (
          <View key={i.key} style={styles.calcInput}>
            <Text style={styles.label}>{i.label.toUpperCase()}</Text>
            <TextInput
              value={i.value}
              onChangeText={(v) => setValues(new Map(values).set(i.key, v))}
              keyboardType="numeric"
              selectionColor={colors.gold}
              accessibilityLabel={i.label}
              style={styles.input}
            />
          </View>
        ))}
      </View>
      <Text style={styles.heading}>{view.resultsLabel}</Text>
      {view.outputs.map((o) => (
        <View key={o.label} style={styles.resultRow}>
          <Text style={[styles.body, styles.flex]}>{o.label}</Text>
          <Text style={styles.result}>{o.value}</Text>
        </View>
      ))}
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------------ ranks

export function RanksTool({ at }: ToolProps) {
  const view = ranksTool(at.data);
  if ('empty' in view) return <Empty empty={view.empty} />;
  return (
    <View style={styles.gap}>
      {view.people.map((p) => (
        <Panel key={p.entry.id} style={styles.gapSm}>
          <EntryLink entry={p.entry} big />
          {p.lines.map((line, i) => (
            <Text key={i} style={styles.body}>
              {line}
            </Text>
          ))}
        </Panel>
      ))}
    </View>
  );
}

// -------------------------------------------------------------------------------------------------- inventory

export function InventoryTool({ at }: ToolProps) {
  const [who, setWho] = useState('');
  const [when, setWhen] = useState('');
  const view = inventoryTool(at.data, who, when);
  if ('empty' in view) return <Empty empty={view.empty} />;
  return (
    <View style={styles.gap}>
      <ChooserField label={view.who.label} value={view.who.value} choices={view.who.options.map((id) => ({ value: id, label: view.who.names(id) }))} onChoose={setWho} />
      <ChooserField
        label={view.when.label}
        value={view.when.value}
        choices={[{ value: '', label: view.when.none }, ...view.when.options.map((id) => ({ value: id, label: view.when.names(id) }))]}
        onChoose={setWhen}
      />
      <Panel style={styles.gapSm}>
        <EntryLink entry={view.entry} big />
        {view.note !== null && <Muted>{view.note}</Muted>}
        {view.gear.map((g, i) => (
          <View key={i} style={styles.gear}>
            <View style={styles.gearHead}>
              {g.entry ? <EntryLink entry={g.entry} /> : <Text style={styles.bodyBold}>{g.name}</Text>}
              {g.kind !== null && <Text style={styles.kind}>{g.kind}</Text>}
            </View>
            {g.note !== null && <Muted>{g.note}</Muted>}
          </View>
        ))}
      </Panel>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- lineage

export function LineageTool({ at }: ToolProps) {
  const view = lineageTool(at.data);
  if ('empty' in view) return <Empty empty={view.empty} />;
  return (
    <View style={styles.gap}>
      {view.generations.map((g) => (
        <View key={g.heading} style={styles.gapSm}>
          <Text style={styles.heading}>{g.heading}</Text>
          <View style={styles.wrapWide}>
            {g.people.map((p) => (
              <Panel key={p.entry.id} style={[styles.kinCard, styles.gapXs]}>
                <EntryLink entry={p.entry} big />
                {p.lines.map((line, i) => (
                  <Text key={i} style={styles.small}>
                    {line}
                  </Text>
                ))}
              </Panel>
            ))}
          </View>
        </View>
      ))}
      <Muted>{view.note}</Muted>
    </View>
  );
}

// ------------------------------------------------------------------------------------------------------- page

export function PageTool({ at }: ToolProps) {
  const router = useRouter();
  const view = pageTool(at.tool);
  if ('missing' in view) return <Muted>{view.missing}</Muted>;
  const path = scriptorPath(view.path);
  return (
    <View style={styles.gapSm}>
      <GoldButton
        label={view.label}
        icon="open-in-app"
        disabled={path === null}
        onPress={() => path && router.navigate(path as never)}
        style={styles.start}
      />
      {path === null && <Muted>{`${str(at.tool['title'])} is not in Scriptor.`}</Muted>}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  gapXs: { gap: space.xs },
  start: { alignSelf: 'flex-start' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  wrapWide: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  label: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.4, color: colors.gold },
  heading: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  cardTitle: { fontFamily: fonts.ui, fontSize: 16, fontWeight: '700', color: colors.gold },
  link: { fontFamily: fonts.ui, fontSize: 14, color: colors.gold, textDecorationLine: 'underline' },
  body: { fontFamily: fonts.ui, fontSize: 14, lineHeight: 20, color: colors.text },
  bodyBold: { fontFamily: fonts.ui, fontSize: 14, fontWeight: '700', color: colors.text },
  small: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 18, color: colors.muted },
  input: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 15,
  },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: space.sm },
  swatch: { width: 12, height: 3, borderRadius: 2 },
  calcInput: { width: 240, maxWidth: '100%', gap: 4 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  result: { fontFamily: fonts.numbers, fontSize: 15, fontWeight: '700', color: colors.text },
  gear: { gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  gearHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  kind: { fontFamily: fonts.ui, fontSize: 12, color: colors.gold, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  kinCard: { width: 260, maxWidth: '100%' },
});
