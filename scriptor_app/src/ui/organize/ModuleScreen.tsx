// ONE MODULE'S WORKSPACE (FEATURES.md #225–#226): its dashboard (how much of each kind of record, what was touched
// last, what is still empty; each number opening the list it counts) and its tools, chosen by chips; Configure (its
// name in the menus, which tools show, their names and order, a log's stages). Switched off, it says so and keeps its
// data; not installed, it says that. A port of flutter_app/lib/features/modules/module_page.dart and the first half of
// module_tools.dart (registry, board, table, matrix, meters); the other tools are ModuleToolsMore.tsx. The logic is
// src/domain/modules/screens/{workspace,tools}.ts. Every tool works on the novel's own records: what is made or
// changed here is the Codex's, seen everywhere else.

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { characterPath } from '../../domain/characters/screens/create';
import { splitChoices } from '../../domain/codex/fieldValues';
import { worldEntryPath } from '../../domain/codex/screens/entryPage';
import type { JsonMap } from '../../domain/json';
import { str } from '../../domain/json';
import type { ModuleDefinition } from '../../domain/modules/moduleDefs';
import { modulesPath } from '../../domain/modules/moduleService';
import {
  boardTool,
  cell,
  matrixTool,
  metersTool,
  newEntryChange,
  registryTool,
  tableTool,
  type ToolAt,
  unknownToolText,
} from '../../domain/modules/screens/tools';
import { configureChanges, configureView, dashboard, kindsPathFor, workspace, workspaceWords } from '../../domain/modules/screens/workspace';
import type { Category, FieldDef } from '../../domain/records/category';
import type { Entry } from '../../domain/records/entry';
import { ActionSheet, Sheet } from '../dialogs';
import { Chip, GoldButton, Icon, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { colors, fonts, radius, space } from '../theme';
import { CalculatorTool, InventoryTool, LineageTool, LogTool, PageTool, RanksTool } from './ModuleToolsMore';
import { ChooserField, SavedText } from './parts';
import { tiedNameSave } from './skillTieWords';
import { useSystems } from '../systems/useSystems';
import { type OpenModules, useModules } from './useModules';

/** An entry's own page: a character's profile, or the world's entry page. */
const entryPathOf = (e: Entry): string => (e.category === 'character' ? characterPath(e.id) : worldEntryPath(e.id));

/** The novel can always be changed here (Scriptor has no review copies yet, FEATURES.md section 33). */
const writes = true;

export function ModuleScreen({
  moduleId,
  toolId,
  recordId,
  configure = false,
}: {
  moduleId: string;
  toolId: string | null;
  recordId: string | null;
  /** Open with Configure showing (the manager's Configure button). */
  configure?: boolean;
}) {
  const mods = useModules();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [configuring, setConfiguring] = useState(configure);
  const allModules = () => router.navigate(modulesPath);

  if (!mods) {
    return (
      <Page top={insets.top} title="No novel open" onBack={() => router.navigate('/')}>
        <Muted>Modules work inside one novel. Open one from your Library.</Muted>
      </Page>
    );
  }
  const ws = workspace(mods.novelId, mods.snapshot, moduleId, toolId, writes);
  if (ws.kind === 'missing') {
    return (
      <Page top={insets.top} title={ws.title} onBack={allModules}>
        <Muted>{ws.text}</Muted>
        <OutlineButton label={workspaceWords.back} icon="arrow-left" compact onPress={allModules} style={styles.start} />
      </Page>
    );
  }
  if (ws.kind === 'off') {
    const module = ws.module;
    return (
      <Page top={insets.top} title={ws.title} onBack={allModules}>
        <Muted>{ws.text}</Muted>
        <View style={styles.row}>
          <GoldButton label={workspaceWords.turnOn} icon="power" compact onPress={() => mods.now((m) => m.enable(module))} />
          <OutlineButton label={workspaceWords.back} icon="arrow-left" compact onPress={allModules} />
        </View>
      </Page>
    );
  }
  const open = (path: string) => router.replace(path as never);
  const at: ToolAt | null = ws.tool ? { moduleId: ws.module.id, tool: ws.tool, data: ws.data, writes } : null;
  return (
    <Page top={insets.top} title={ws.title} subtitle={ws.subtitle} onBack={allModules}>
      <View style={styles.row}>
        <OutlineButton label={workspaceWords.configure} icon="tune-variant" compact onPress={() => setConfiguring(true)} />
        <OutlineButton label={workspaceWords.back} icon="arrow-left" compact tone="muted" onPress={allModules} />
      </View>
      {ws.starter && (
        <Panel style={styles.gapSm}>
          <Text style={styles.body}>{ws.starter}</Text>
          <OutlineButton
            label={workspaceWords.addSystem}
            compact
            onPress={() => mods.now((m) => m.addStarterSystem(ws.module.id))}
            style={styles.start}
          />
        </Panel>
      )}
      <View style={styles.chips} accessibilityLabel={ws.label}>
        {ws.chips.map((c) => (
          <Chip key={c.id ?? 'dashboard'} label={c.label} selected={c.selected} onPress={() => !c.selected && open(c.path)} />
        ))}
      </View>
      {ws.tool && at ? (
        <View style={styles.gap}>
          <Text style={styles.toolTitle} accessibilityRole="header">
            {str(ws.tool['title'])}
          </Text>
          {str(ws.tool['hint']).length > 0 && <Muted>{str(ws.tool['hint'])}</Muted>}
          <ToolView key={`${ws.module.id}:${str(ws.tool['id'])}`} mods={mods} at={at} recordId={recordId} />
        </View>
      ) : (
        <Dashboard module={ws.module} tools={ws.tools} at={{ moduleId: ws.module.id, tool: {}, data: ws.data, writes }} />
      )}
      {configuring && <Configure mods={mods} module={ws.module} onClose={() => setConfiguring(false)} />}
    </Page>
  );
}

function Page({ top, title, subtitle, onBack, children }: { top: number; title: string; subtitle?: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <View style={[styles.page, { paddingTop: top }]}>
      <View style={styles.head}>
        <IconButton icon="arrow-left" label="Back" onPress={onBack} />
        <View style={styles.flex}>
          <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={3}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body0} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

// ------------------------------------------------------------------------------------------------------ dashboard

function Dashboard({ module, tools, at }: { module: ModuleDefinition; tools: JsonMap[]; at: ToolAt }) {
  const router = useRouter();
  const d = dashboard(module, tools, at.data, entryPathOf);
  const go = (path: string, inPlace: boolean) => (inPlace ? router.replace(path as never) : router.navigate(path as never));
  const rowView = (r: (typeof d.recent)[number]) => (
    <Pressable
      key={r.entry.id}
      accessibilityRole="button"
      accessibilityLabel={`${r.title}, ${r.subtitle}`}
      onPress={() => go(r.path, r.inRegistry)}
      style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.elevated }]}
    >
      <Text style={styles.rowTitle} numberOfLines={1}>
        {r.title}
      </Text>
      <Muted>{r.subtitle}</Muted>
    </Pressable>
  );
  return (
    <View style={styles.gap}>
      {d.tiles.length > 0 && (
        <View style={styles.tiles}>
          {d.tiles.map((t) => (
            <Pressable
              key={t.label}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              onPress={() => go(t.path, true)}
              style={({ pressed }) => [styles.tile, pressed && { borderColor: colors.gold }]}
            >
              <Text style={styles.tileCount}>{t.count}</Text>
              <Text style={styles.tileName} numberOfLines={2}>
                {t.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {d.nothing && <Muted>{d.nothing}</Muted>}
      {d.recent.length > 0 && (
        <Panel style={styles.gapXs}>
          <Text style={styles.heading}>{workspaceWords.recent}</Text>
          {d.recent.map(rowView)}
        </Panel>
      )}
      {d.empty && (
        <Panel style={styles.gapXs}>
          <Text style={styles.heading}>{d.empty.heading}</Text>
          <Muted>{d.empty.note}</Muted>
          {d.empty.rows.map(rowView)}
        </Panel>
      )}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------------ configure

function Configure({ mods, module, onClose }: { mods: OpenModules; module: ModuleDefinition; onClose: () => void }) {
  const router = useRouter();
  const view = configureView(mods.snapshot, module.id);
  if (!view) return null;
  const key = (what: string) => `module:${mods.novelId}:${module.id}:configure:${what}`;
  const configure = (change: (s: JsonMap) => JsonMap) => (m: Parameters<Parameters<OpenModules['now']>[0]>[0]) => m.configure(module.id, change);
  const toolOf = (id: string): JsonMap => module.tools.find((t) => t['id'] === id) ?? { id, title: '' };
  const order = view.tools.map((t) => t.id);
  return (
    <Sheet visible onClose={onClose} title={view.title} wide footer={<GoldButton label={view.done} onPress={onClose} style={styles.flex} />}>
      <SavedText label={view.navLabel} value={view.nav} onSave={(v) => mods.later(key('nav'), configure(configureChanges.nav(module, v)))} />
      <Text style={styles.heading}>{view.toolsHeading.toUpperCase()}</Text>
      {view.tools.map((t) => (
        <Panel key={t.id} style={styles.gapSm}>
          <View style={styles.rowBetween}>
            <Text style={[styles.rowTitle, styles.flex]} numberOfLines={1}>
              {t.title}
            </Text>
            <Switch
              value={t.shown}
              onValueChange={(v) => mods.now(configure(configureChanges.shown(t.id, v)))}
              trackColor={{ true: colors.gold, false: colors.border }}
              thumbColor={colors.text}
              accessibilityLabel={t.showLabel}
            />
            <IconButton
              icon="arrow-up"
              label={t.up.label}
              onPress={() => {
                const change = configureChanges.move(order, t.id, -1);
                if (t.up.enabled && change) mods.now(configure(change));
              }}
              color={t.up.enabled ? colors.text : colors.border}
            />
            <IconButton
              icon="arrow-down"
              label={t.down.label}
              onPress={() => {
                const change = configureChanges.move(order, t.id, 1);
                if (t.down.enabled && change) mods.now(configure(change));
              }}
              color={t.down.enabled ? colors.text : colors.border}
            />
          </View>
          <SavedText label={t.nameLabel} value={t.name} onSave={(v) => mods.later(key(`title:${t.id}`), configure(configureChanges.title(toolOf(t.id), v)))} />
          {t.stages && (
            <SavedText
              label={t.stages.label}
              value={t.stages.value}
              hint={t.stages.hint}
              onSave={(v) => mods.later(key(`stages:${t.id}`), configure(configureChanges.stages(toolOf(t.id), v)))}
            />
          )}
        </Panel>
      ))}
      {view.categories.length > 0 && (
        <>
          <Text style={styles.heading}>{view.categoriesHeading.toUpperCase()}</Text>
          <View style={styles.chips}>
            {view.categories.map((c) => (
              <Chip
                key={c.key}
                label={c.name}
                icon="tune-variant"
                selected={false}
                onPress={() => {
                  onClose();
                  router.navigate(kindsPathFor(c.key) as never);
                }}
              />
            ))}
          </View>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------------------- tools

function ToolView({ mods, at, recordId }: { mods: OpenModules; at: ToolAt; recordId: string | null }) {
  switch (str(at.tool['type'])) {
    case 'registry':
      return <RegistryTool mods={mods} at={at} recordId={recordId} />;
    case 'board':
      return <BoardTool mods={mods} at={at} />;
    case 'table':
      return <TableTool mods={mods} at={at} />;
    case 'matrix':
      return <MatrixTool mods={mods} at={at} />;
    case 'meters':
      return <MetersTool mods={mods} at={at} />;
    case 'log':
      return <LogTool mods={mods} at={at} />;
    case 'calculator':
      return <CalculatorTool mods={mods} at={at} />;
    case 'ranks':
      return <RanksTool mods={mods} at={at} />;
    case 'inventory':
      return <InventoryTool mods={mods} at={at} />;
    case 'lineage':
      return <LineageTool mods={mods} at={at} />;
    case 'page':
      return <PageTool mods={mods} at={at} />;
    default:
      return <Muted>{unknownToolText}</Muted>;
  }
}

/** "New <singular>" and Add, adding an entry without leaving the tool. */
function NewEntry({ mods, category, words, preset }: { mods: OpenModules; category: Category; words: { label: string; hint: string; add: string }; preset?: { def: FieldDef; value: string } | null }) {
  const [name, setName] = useState('');
  const add = () => {
    const change = newEntryChange(category, name, preset ?? null);
    if (!change) return;
    if (mods.now(change)) setName('');
  };
  return (
    <View style={styles.newEntry}>
      <TextInput
        value={name}
        onChangeText={setName}
        onSubmitEditing={add}
        placeholder={words.hint}
        placeholderTextColor={colors.muted}
        selectionColor={colors.gold}
        returnKeyType="done"
        accessibilityLabel={words.label}
        style={[styles.input, styles.flex]}
      />
      <GoldButton label={words.add} icon="plus" compact disabled={name.trim().length === 0} onPress={add} />
    </View>
  );
}

/** An entry's name, a press from its own page. */
function EntryLink({ entry }: { entry: Entry }) {
  const router = useRouter();
  const name = entry.name.length === 0 ? 'Untitled' : entry.name;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`Open ${name}`} onPress={() => router.navigate(entryPathOf(entry) as never)}>
      <Text style={styles.link} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

/** A field's control in a tool: a choice is pressed (saved at once), anything typed is saved as typing stops. Compact
 * for a cell of a table; labelled for a record. */
function FieldCell({
  mods,
  data,
  entry,
  category,
  def,
  compact = true,
}: {
  mods: OpenModules;
  data: ToolAt['data'];
  entry: Entry;
  category: Category;
  def: FieldDef;
  compact?: boolean;
}) {
  const c = cell(data, entry, category, def);
  const [text, setText] = useState(c.value);
  // What is typed, as typed: a tags cell shows "a, b" for the stored "a\nb", and the comma being typed must stay.
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [choosing, setChoosing] = useState(false);
  useEffect(() => {
    if (!focused) setText(c.value);
  }, [c.value, focused]);
  const choose = (v: string) => mods.now(c.write(v));
  const type = def.type;
  const label = compact ? null : <Text style={styles.fieldLabel}>{def.name.toUpperCase()}</Text>;
  if (!writes) return <Text style={styles.cellText}>{c.shown}</Text>;
  if (type === 'toggle') {
    return (
      <View style={styles.gapXs}>
        {label}
        <View style={styles.row}>
          <Chip label="Yes" selected={c.value === 'yes'} onPress={() => choose(c.value === 'yes' ? '' : 'yes')} />
          <Chip label="No" selected={c.value === 'no'} onPress={() => choose(c.value === 'no' ? '' : 'no')} />
        </View>
      </View>
    );
  }
  if (type === 'select' || type === 'reference' || type === 'multiselect' || type === 'references') {
    const many = type === 'multiselect' || type === 'references';
    const items =
      type === 'select' || type === 'multiselect'
        ? [...def.options, ...(c.value && !many && !def.options.includes(c.value) ? [c.value] : [])].map((o) => ({ key: o, label: o }))
        : c.entries.map((e) => ({ key: e.id, label: e.name.length === 0 ? 'Untitled' : e.name }));
    const chosen = many ? splitChoices(c.value) : [c.value];
    return (
      <View style={styles.gapXs}>
        {label}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={c.semanticsLabel}
          onPress={() => setChoosing(true)}
          style={({ pressed }) => [styles.choice, pressed && { borderColor: colors.gold }]}
        >
          <Text style={[styles.cellText, styles.flex]} numberOfLines={compact ? 1 : 3}>
            {c.shown}
          </Text>
          <Icon name="chevron-down" size={18} color={colors.muted} />
        </Pressable>
        {choosing &&
          (many ? (
            <Sheet visible onClose={() => setChoosing(false)} title={c.label}>
              <View style={styles.chips}>
                {items.map((it) => {
                  const on = chosen.includes(it.key);
                  return (
                    <Chip
                      key={it.key}
                      label={it.label}
                      selected={on}
                      onPress={() => choose((on ? chosen.filter((x) => x !== it.key) : [...chosen.filter((x) => x.length > 0), it.key]).join('\n'))}
                    />
                  );
                })}
                {items.length === 0 && <Muted>—</Muted>}
              </View>
            </Sheet>
          ) : (
            <ActionSheet
              visible
              title={c.label}
              onClose={() => setChoosing(false)}
              actions={[{ key: '', label: '—' }, ...items].map((it) => ({
                label: it.label,
                icon: it.key === c.value ? 'radiobox-marked' : 'radiobox-blank',
                onPress: () => {
                  if (it.key !== c.value) choose(it.key);
                },
              }))}
            />
          ))}
      </View>
    );
  }
  const long = type === 'longtext' && !compact;
  return (
    <View style={styles.gapXs}>
      {label}
      <TextInput
        value={draft ?? (type === 'tags' ? text.split('\n').join(', ') : text)}
        onChangeText={(v) => {
          const stored = type === 'tags' ? v.split(',').map((x) => x.trim()).filter((x) => x.length > 0).join('\n') : v;
          setDraft(v);
          setText(stored);
          mods.later(`module:${mods.novelId}:cell:${c.key}`, c.write(stored));
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setDraft(null);
        }}
        placeholder="—"
        placeholderTextColor={colors.muted}
        selectionColor={colors.gold}
        keyboardType={type === 'number' ? 'numeric' : 'default'}
        multiline={long}
        accessibilityLabel={c.label}
        style={[styles.input, long && styles.longInput, compact && styles.cellInput]}
      />
    </View>
  );
}

// ------------------------------------------------------------------------------------------------------- registry

function RegistryTool({ mods, at, recordId }: { mods: OpenModules; at: ToolAt; recordId: string | null }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [only, setOnly] = useState('');
  const [recent, setRecent] = useState(false);
  const r = registryTool(at, { query, only, recent, record: recordId });
  if ('missing' in r) return <Muted>{r.missing}</Muted>;
  const wide = width >= 760;
  const list = (
    <View style={[styles.gap, wide && styles.flex]}>
      {at.writes && <NewEntry mods={mods} category={r.category} words={r.newEntry} preset={r.preset} />}
      <View style={styles.search}>
        <Icon name="magnify" size={20} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={r.searchLabel}
          placeholderTextColor={colors.muted}
          selectionColor={colors.gold}
          accessibilityLabel={r.searchLabel}
          style={[styles.flex, styles.searchInput]}
        />
        {query.length > 0 && <IconButton icon="close" label="Clear search" onPress={() => setQuery('')} color={colors.muted} />}
      </View>
      {r.filter && (
        <ChooserField
          label={r.filter.label}
          value={r.filter.value}
          choices={[{ value: '', label: r.filter.none }, ...r.filter.options.map((o) => ({ value: o, label: r.filter!.names(o) }))]}
          onChoose={setOnly}
        />
      )}
      <View style={styles.row}>
        <Chip label={r.order.byName} selected={!recent} onPress={() => setRecent(false)} />
        <Chip label={r.order.recent} selected={recent} onPress={() => setRecent(true)} />
      </View>
      {r.empty && <Muted>{r.empty}</Muted>}
      {r.rows.map((row) => (
        <Pressable
          key={row.entry.id}
          accessibilityRole="button"
          accessibilityState={{ selected: row.selected }}
          onPress={() => router.replace(row.path as never)}
          style={({ pressed }) => [styles.card, row.selected && styles.cardOn, pressed && { backgroundColor: colors.elevated }]}
        >
          <View style={styles.rowBetween}>
            <Text style={[styles.rowTitle, styles.flex]} numberOfLines={1}>
              {row.title}
            </Text>
            {row.chip && <Text style={styles.groupChip}>{row.chip}</Text>}
          </View>
          {row.line && <Muted numberOfLines={2}>{row.line}</Muted>}
        </Pressable>
      ))}
    </View>
  );
  const record = r.record ? <RegistryRecordView mods={mods} at={at} record={r.record} category={r.category} /> : null;
  if (wide) {
    return (
      <View style={styles.split}>
        {list}
        {record && <View style={styles.flex}>{record}</View>}
      </View>
    );
  }
  return record ?? list;
}

function RegistryRecordView({ mods, at, record, category }: { mods: OpenModules; at: ToolAt; record: NonNullable<Extract<ReturnType<typeof registryTool>, { category: Category }>['record']>; category: Category }) {
  const router = useRouter();
  const sys = useSystems();
  const key = (k: string) => `module:${mods.novelId}:record:${k}`;
  const e = record.entry;
  return (
    <Panel key={e.id} style={styles.gap}>
      <View style={styles.row}>
        <OutlineButton label={record.back.label} icon="arrow-left" compact tone="muted" onPress={() => router.replace(record.back.path as never)} />
        <OutlineButton label={record.codex} icon="open-in-new" compact onPress={() => router.navigate(entryPathOf(e) as never)} />
      </View>
      <SavedText
        label={record.nameLabel}
        value={e.name}
        onSave={(v) => {
          // A World skill tied to a system skill is renamed with it.
          const rename = tiedNameSave(e, v);
          if (rename && sys) return sys.later(key(record.keys.name), rename);
          const change = record.saveName(v);
          if (change) mods.later(key(record.keys.name), change);
        }}
      />
      <SavedText
        label={record.descriptionLabel}
        value={e.summary}
        hint={record.descriptionHint}
        multiline
        minLines={2}
        onSave={(v) => mods.later(key(record.keys.summary), record.saveSummary(v))}
      />
      {record.fields.map((f) => (
        <FieldCell key={f.key} mods={mods} data={at.data} entry={e} category={category} def={f.def} compact={false} />
      ))}
      <SavedText label={record.notesLabel} value={e.notes} multiline minLines={3} onSave={(v) => mods.later(key(record.keys.notes), record.saveNotes(v))} />
      <Muted>{record.note}</Muted>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------------------- board

function BoardTool({ mods, at }: { mods: OpenModules; at: ToolAt }) {
  const b = boardTool(at);
  if ('missing' in b) return <Muted>{b.missing}</Muted>;
  return (
    <View style={styles.gap}>
      {at.writes && <NewEntry mods={mods} category={b.category} words={b.newEntry} />}
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.columns}>
        {b.columns.map((col) => (
          <View key={col.label} style={styles.column}>
            <Text style={styles.columnTitle} numberOfLines={1}>
              {col.label}
            </Text>
            {col.cards.map((card) => (
              <View key={card.entry.id} style={styles.boardCard}>
                <EntryLink entry={card.entry} />
                {card.lines.map((l) => (
                  <Text key={l} style={styles.small} numberOfLines={2}>
                    {l}
                  </Text>
                ))}
                <FieldCell mods={mods} data={at.data} entry={card.entry} category={b.category} def={b.group} />
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------- table

function TableTool({ mods, at }: { mods: OpenModules; at: ToolAt }) {
  const t = tableTool(at);
  if ('missing' in t) return <Muted>{t.missing}</Muted>;
  return (
    <View style={styles.gap}>
      {at.writes && <NewEntry mods={mods} category={t.category} words={t.newEntry} />}
      {t.empty ? (
        <Muted>{t.empty}</Muted>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={styles.grid}>
            <View style={[styles.gridRow, styles.gridHead]}>
              {t.header.map((h, i) => (
                <Text key={i} style={[styles.headText, { width: i === 0 ? 170 : 160 }]} numberOfLines={2}>
                  {h}
                </Text>
              ))}
            </View>
            {t.rows.map((e) => (
              <View key={e.id} style={styles.gridRow}>
                <View style={{ width: 170 }}>
                  <EntryLink entry={e} />
                </View>
                {t.defs.map((d) => (
                  <View key={d.id} style={{ width: 160 }}>
                    <FieldCell mods={mods} data={at.data} entry={e} category={t.category} def={d} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// --------------------------------------------------------------------------------------------------------- matrix

function MatrixTool({ mods, at }: { mods: OpenModules; at: ToolAt }) {
  const m = matrixTool(at);
  if ('missing' in m) return <Muted>{m.missing}</Muted>;
  return (
    <View style={styles.gap}>
      {at.writes && m.newEntries.map((n) => <NewEntry key={n.category.key} mods={mods} category={n.category} words={n.words} />)}
      {m.empty ? (
        <Muted>{m.empty}</Muted>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={styles.grid}>
            <View style={[styles.gridRow, styles.gridHead]}>
              <View style={{ width: 150 }} />
              {m.columnEntries.map((c) => (
                <Text key={c.id} style={[styles.headText, { width: 170 }]} numberOfLines={2}>
                  {c.name}
                </Text>
              ))}
            </View>
            {m.rowEntries.map((r) => (
              <View key={r.id} style={styles.gridRow}>
                <View style={{ width: 150 }}>
                  <EntryLink entry={r} />
                </View>
                {m.columnEntries.map((c) => (
                  <View key={c.id} style={{ width: 170 }}>
                    <MatrixCell mods={mods} values={m.values} cell={m.cell(r, c)} set={(v) => m.set(r, c, v)} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function MatrixCell({
  mods,
  values,
  cell: c,
  set,
}: {
  mods: OpenModules;
  values: string[];
  cell: { value: string; label: string; shown: string; semanticsLabel: string };
  set: (value: string) => Parameters<OpenModules['now']>[0];
}) {
  const [text, setText] = useState(c.value);
  const [choosing, setChoosing] = useState(false);
  useEffect(() => setText(c.value), [c.value]);
  if (!writes) return <Text style={styles.cellText}>{c.shown}</Text>;
  if (values.length > 0) {
    return (
      <>
        <Pressable accessibilityRole="button" accessibilityLabel={c.semanticsLabel} onPress={() => setChoosing(true)} style={({ pressed }) => [styles.choice, pressed && { borderColor: colors.gold }]}>
          <Text style={[styles.cellText, styles.flex]} numberOfLines={1}>
            {c.shown}
          </Text>
          <Icon name="chevron-down" size={18} color={colors.muted} />
        </Pressable>
        {choosing && (
          <ActionSheet
            visible
            title={c.label}
            onClose={() => setChoosing(false)}
            actions={['', ...values, ...(c.value && !values.includes(c.value) ? [c.value] : [])].map((v) => ({
              label: v.length === 0 ? '—' : v,
              icon: v === c.value ? 'radiobox-marked' : 'radiobox-blank',
              onPress: () => {
                if (v !== c.value) mods.now(set(v));
              },
            }))}
          />
        )}
      </>
    );
  }
  // Typed text is committed when done (the field is left, or Enter).
  const commit = () => {
    if (text !== c.value) mods.now(set(text));
  };
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onEndEditing={commit}
      onSubmitEditing={commit}
      placeholder="—"
      placeholderTextColor={colors.muted}
      selectionColor={colors.gold}
      accessibilityLabel={c.label}
      style={[styles.input, styles.cellInput]}
    />
  );
}

// --------------------------------------------------------------------------------------------------------- meters

function MetersTool({ mods, at }: { mods: OpenModules; at: ToolAt }) {
  const m = metersTool(at);
  if ('missing' in m) return <Muted>{m.missing}</Muted>;
  return (
    <View style={styles.gap}>
      {at.writes && <NewEntry mods={mods} category={m.category} words={m.newEntry} />}
      {m.empty && <Muted>{m.empty}</Muted>}
      {m.cards.map((card) => (
        <Panel key={card.entry.id} style={styles.gapSm}>
          <EntryLink entry={card.entry} />
          {card.meters.map((meter) => (
            <View key={meter.def.id} style={styles.meterRow}>
              <Text style={styles.meterName} numberOfLines={1}>
                {meter.name}
              </Text>
              <View style={styles.meterTrack} accessibilityLabel={`${meter.label}: ${meter.value}`}>
                <View style={[styles.meterFill, { width: 160 * meter.share }]} />
              </View>
              <View style={{ width: 140 }}>
                <FieldCell mods={mods} data={at.data} entry={card.entry} category={m.category} def={meter.def} />
              </View>
              <Muted>{m.maxLabel}</Muted>
            </View>
          ))}
        </Panel>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  flex: { flex: 1 },
  start: { alignSelf: 'flex-start' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.sm },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  subtitle: { fontFamily: fonts.ui, fontSize: 13.5, lineHeight: 19, color: colors.muted, marginTop: 2 },
  body0: { padding: space.md, paddingBottom: space.xxl * 3, gap: space.md },
  body: { fontFamily: fonts.ui, fontSize: 14.5, lineHeight: 21, color: colors.text },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  gapXs: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, rowGap: 6 },
  toolTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  heading: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.gold },
  rowTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.text },
  listRow: { paddingVertical: space.sm, paddingHorizontal: space.xs, borderRadius: 8, gap: 2 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: 170, padding: space.md, borderRadius: radius.panel, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 4 },
  tileCount: { fontFamily: fonts.numbers, fontSize: 26, color: colors.gold },
  tileName: { fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  newEntry: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 15,
  },
  longInput: { minHeight: 96, paddingTop: space.sm, textAlignVertical: 'top' },
  cellInput: { minHeight: 38, paddingHorizontal: space.sm, fontSize: 14 },
  fieldLabel: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 38,
    paddingHorizontal: space.sm,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cellText: { fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  link: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.gold, textDecorationLine: 'underline' },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.md, minHeight: 48, borderRadius: radius.chip, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  searchInput: { color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  card: { padding: space.md, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 4 },
  cardOn: { borderColor: colors.gold },
  groupChip: { fontFamily: fonts.ui, fontSize: 12, color: colors.gold, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, borderWidth: 1, borderColor: colors.gold },
  split: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  columns: { gap: 12, paddingBottom: space.sm },
  column: { width: 260, padding: 8, borderRadius: 8, backgroundColor: colors.surface, gap: 8 },
  columnTitle: { fontFamily: fonts.ui, fontSize: 14, fontWeight: '700', color: colors.text },
  boardCard: { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, gap: 6 },
  small: { fontFamily: fonts.ui, fontSize: 12.5, color: colors.muted },
  grid: { borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  gridHead: { backgroundColor: colors.surface },
  headText: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '700', color: colors.text },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  meterName: { width: 120, fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  meterTrack: { width: 160, height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  meterFill: { height: 8, borderRadius: 4, backgroundColor: colors.gold },
});
