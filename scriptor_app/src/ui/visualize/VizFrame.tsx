// THE VISUALIZE FRAME (FEATURES.md #274–#279): every view of Visualize sits in the same page — a back arrow to
// Organize's Visualize tab, the view's title, the atlas of views (a sheet of plates by subject), the shared filters (by
// name; involving a character), saved views (save, save changes, rename, duplicate, restore default, delete), a picture
// of the view to share, turning views on or off, and the details of what is selected (a panel below the view on a wide
// screen, a sheet on a phone) with "Open". The filters and the selection carry across views while the app runs. A port
// of flutter_app/lib/features/visualize/viz_frame.dart and view_atlas.dart; the logic is
// src/domain/visualize/screens/frame.ts. Canon and continuity marks are Review's (src/ui/review/CanonMarks.tsx).

import { useRouter } from 'expo-router';
import { type ComponentRef, createContext, type ReactNode, useContext, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { characterPath } from '../../domain/characters/screens/create';
import { worldEntryPath } from '../../domain/codex/screens/entryPage';
import { type JsonMap, jsonEquals, str } from '../../domain/json';
import { type EntityRef, type EntityType, entityTypes } from '../../domain/model/entityRef';
import { detailsOf } from '../../domain/model/navigate';
import { strings } from '../../domain/records/jsonRecord';
import { SavedView } from '../../domain/records/savedView';
import { relationshipPath } from '../../domain/relationships/screens/relationshipPage';
import { eventPath } from '../../domain/timeline/timelineService';
import { isViewOn, turnOff, turnOn } from '../../domain/visualize/modules';
import { activeFilters, cleanConfig, cleanFilter, defaultViewConfig, openSaved } from '../../domain/visualize/savedViews';
import {
  atlasOf,
  atlasWords,
  frameWords,
  manageWords,
  matchingKeys,
  offeredViews,
  openLabel,
  plateTarget,
  savedWords,
  viewIcon,
  viewsOffOf,
} from '../../domain/visualize/screens/frame';
import { isBuilt, viewLabel, viewOf, visualViews } from '../../domain/visualize/views';
import { VisualizeService } from '../../domain/visualize/visualizeService';
import { DataExportSheet, type ExportedView } from '../exchange/DataExportSheet';
import { ActionSheet, ConfirmDelete, PromptSheet, Sheet } from '../dialogs';
import { GoldButton, Icon, IconButton, type IconName, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { useLockableScroll } from '../scrollLock';
import { colors, fonts, radius, sizeClassOf, space } from '../theme';
import { useToast } from '../toast';
import { rememberOrganizeTab } from '../organize/OrganizeScreen';
import { type OpenCast, useCast } from '../organize/useCast';
import { ChooserField } from '../organize/parts';
import { lastNodeSetting } from '../write/WriteScreen';
import { MarksBar, SelectionMarks } from '../review/CanonMarks';

// ------------------------------------------------------------------------------------------- filters and selection

export type VizFilters = { query: string; involving: string | null };

/** The shared filter (in the original's shape: `text`, `characters`, and whatever a saved view holds), the selection,
 * and the saved view open in each view: kept while the app runs, so they carry from one view to the next. */
const kept: { filter: JsonMap; selected: EntityRef | null; openSaved: Map<string, string>; missing: number } = {
  filter: {},
  selected: null,
  openSaved: new Map(),
  missing: 0,
};

type VizContext = {
  filter: JsonMap;
  setFilter: (f: JsonMap) => void;
  selected: EntityRef | null;
  select: (ref: EntityRef | null) => void;
};

const Context = createContext<VizContext>({ filter: {}, setFilter: () => {}, selected: null, select: () => {} });

const filtersOf = (filter: JsonMap): VizFilters => ({ query: str(filter['text']), involving: strings(filter['characters'])[0] ?? null });

/** The shared filters: a name to match, and the character the view is narrowed to (null: everyone). */
export function useVizFilters(): VizFilters {
  return filtersOf(useContext(Context).filter);
}

/** The shared filter whole, in the original's shape (for `matchingKeys`). */
export function useVizFilter(): JsonMap {
  return useContext(Context).filter;
}

/** The records the shared filters leave, of the given kinds, by key (`entry:<id>`); null when nothing is filtered. */
export function useVizMatching(open: OpenCast | null, types: readonly EntityType[]): Set<string> | null {
  const filter = useContext(Context).filter;
  const key = types.join(',');
  return useMemo(
    () => (open === null ? null : matchingKeys(open.cast.model, filter, types)),
    [open?.cast, filter, key], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

/** Sets the shared filter (a view's "Clear the filters" sets it to {}). */
export function useVizSetFilter(): (f: JsonMap) => void {
  return useContext(Context).setFilter;
}

/** What is selected in the views (the details panel shows it); the selection carries across views. */
export function useVizSelection(): { selected: EntityRef | null; select: (ref: EntityRef | null) => void } {
  const c = useContext(Context);
  return { selected: c.selected, select: c.select };
}

// ---------------------------------------------------------------------------------------------------------- frame

export function VizFrame({
  view,
  title,
  subtitle,
  filters: offersFilters = true,
  actions,
  config,
  onApply,
  children,
}: {
  /** The view's key, as saved views and the novel's `viewsOff` name it. */
  view: string;
  title: string;
  subtitle?: string;
  /** Whether the shared filters narrow this view. */
  filters?: boolean;
  /** The view's own buttons, beside the frame's. */
  actions?: ReactNode;
  /** What the view shows now besides the shared filters (its mode, layers, layout), for saved views. */
  config?: () => JsonMap;
  /** Shows what a saved view keeps (its mode, layers, layout). */
  onApply?: (config: JsonMap) => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lib = useLibrary();
  const toast = useToast();
  const open = useCast();
  const wide = sizeClassOf(useWindowDimensions().width) !== 'compact';
  const service = useMemo(() => new VisualizeService(lib.novels), [lib]);
  const [filter, setFilterState] = useState<JsonMap>(kept.filter);
  const [selected, setSelected] = useState<EntityRef | null>(kept.selected);
  const [sheet, setSheet] = useState<'atlas' | 'saved' | 'manage' | 'details' | 'export' | null>(null);
  const [heading, setHeading] = useState<readonly string[] | null>(null);
  const picture = useRef<ComponentRef<typeof View>>(null);
  // The view's scroll, held still while a drawing in it is pinched or dragged (scrollLock.tsx).
  const scroll = useLockableScroll();
  const context = useMemo<VizContext>(
    () => ({
      filter,
      setFilter: (f) => {
        kept.filter = cleanFilter(f);
        kept.missing = 0;
        setFilterState(kept.filter);
      },
      selected,
      select: (ref) => {
        kept.selected = ref;
        setSelected(ref);
      },
    }),
    [filter, selected],
  );
  const back = () => {
    rememberOrganizeTab('visualize');
    if (router.canGoBack()) router.back();
    else router.navigate('/organize');
  };

  if (open === null) {
    return (
      <View style={[styles.page, styles.center, { paddingTop: insets.top }]}>
        <Panel style={styles.empty}>
          <Text style={styles.emptyTitle}>{frameWords.noNovel.title}</Text>
          <Muted style={styles.centerText}>{frameWords.noNovel.message}</Muted>
          <GoldButton label={frameWords.noNovel.go} icon="book-open-page-variant-outline" onPress={() => router.navigate('/')} />
        </Panel>
      </View>
    );
  }
  const model = open.cast.model;
  const off = viewsOffOf(open.cast.snapshot.project);
  const setOff = (next: string[]) => {
    try {
      service.change(open.novelId, (c) => c.setViewsOff(next));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { error: true });
    }
  };
  const turnThisOn = () => {
    const r = turnOn(off, view);
    setOff(r.off);
    if (r.alsoOn.length > 0) toast(manageWords.turnedOn(viewLabel(view), r.alsoOn.map(viewLabel)));
  };
  // A picture of the view with what it is above it (the title, the novel, the filters and the date): the heading is
  // drawn into the view, two frames are let pass so it is on screen, and the view is captured with it.
  const capture = async (lines: readonly string[], format: 'png' | 'jpg'): Promise<string> => {
    if (picture.current === null) throw new Error('The view is not on screen to make a picture of.');
    setHeading(lines);
    try {
      await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
      return await captureRef(picture.current, { format, quality: format === 'jpg' ? 0.92 : 1, result: 'tmpfile' });
    } finally {
      setHeading(null);
    }
  };
  const exported = (): ExportedView => {
    const keys = offersFilters ? matchingKeys(model, filter, entityTypes) : null;
    const ids = keys === null ? null : new Set([...keys].map((k) => k.slice(k.indexOf(':') + 1)));
    return { key: view, filter: offersFilters ? filter : {}, config: config?.() ?? {}, keep: (id) => ids === null || ids.has(id), capture };
  };
  const characters = open.cast.list.filter((l) => !l.profile.archived);
  const { query, involving } = filtersOf(filter);
  const count = activeFilters(filter);
  const selectedLabel = selected === null ? null : (model.resolve(selected)?.label ?? null);

  return (
    <Context.Provider value={context}>
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <View style={styles.head}>
          <IconButton icon="arrow-left" label="Back to Visualize" onPress={back} />
          <View style={styles.flex}>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
              {title}
            </Text>
            {subtitle ? <Muted numberOfLines={1}>{subtitle}</Muted> : null}
          </View>
          <IconButton icon="share-variant-outline" label={frameWords.export} onPress={() => setSheet('export')} />
          <IconButton icon="tune-variant" label={frameWords.manage} onPress={() => setSheet('manage')} />
        </View>
        {!isViewOn(off, view) ? (
          <ScrollView contentContainerStyle={styles.body}>
            <ViewButton view={view} onPress={() => setSheet('atlas')} />
            <Panel style={styles.offPanel}>
              <Icon name="eye-off-outline" size={36} color={colors.muted} />
              <Text style={styles.emptyTitle}>{frameWords.off.title}</Text>
              <Muted style={styles.centerText}>{frameWords.off.message}</Muted>
              <GoldButton label={frameWords.off.turnOn} icon="eye-outline" onPress={turnThisOn} />
            </Panel>
          </ScrollView>
        ) : (
          <ScrollView {...scroll.scrollProps} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <scroll.Provider>
            <View style={styles.bar}>
              <ViewButton view={view} onPress={() => setSheet('atlas')} />
              <SavedButton view={view} open={open} onPress={() => setSheet('saved')} />
            </View>
            {offersFilters && (
              <View style={styles.filters}>
                <View style={styles.search}>
                  <Icon name="magnify" size={20} color={colors.muted} />
                  <TextInput
                    value={query}
                    onChangeText={(q) => context.setFilter({ ...filter, text: q })}
                    placeholder={frameWords.search}
                    placeholderTextColor={colors.muted}
                    selectionColor={colors.gold}
                    style={styles.searchInput}
                    accessibilityLabel={frameWords.search}
                  />
                  {query.length > 0 && <IconButton icon="close" label="Clear the search" onPress={() => context.setFilter({ ...filter, text: '' })} color={colors.muted} />}
                </View>
                {characters.length > 0 && (
                  <ChooserField
                    label={frameWords.involving}
                    value={involving !== null && characters.some((l) => l.entry.id === involving) ? involving : ''}
                    choices={[{ value: '', label: frameWords.anyone }, ...characters.map((l) => ({ value: l.entry.id, label: l.entry.name || 'Unnamed' }))]}
                    onChoose={(v) => context.setFilter({ ...filter, characters: v.length === 0 ? [] : [v] })}
                  />
                )}
                {count > 0 && <OutlineButton label={frameWords.clear(count)} compact tone="muted" onPress={() => context.setFilter({})} style={styles.start} />}
              </View>
            )}
            {kept.missing > 0 && <Muted>{frameWords.missing(kept.missing)}</Muted>}
            {actions ? <View style={styles.actions}>{actions}</View> : null}
            <MarksBar view={view} onSelect={context.select} />
            {!wide && selected !== null && (
              <View style={styles.selectedRow}>
                <Text style={styles.selectedText} numberOfLines={2}>
                  {frameWords.selected(selectedLabel)}
                </Text>
                <OutlineButton label={frameWords.details} compact onPress={() => setSheet('details')} />
                <OutlineButton label={frameWords.clearSelection} compact tone="muted" onPress={() => context.select(null)} />
              </View>
            )}
            <View ref={picture} collapsable={false} style={styles.picture}>
              {heading !== null && (
                <View style={styles.pictureHead}>
                  <Text style={styles.title}>{heading[0]}</Text>
                  {heading.slice(1).map((l, i) => (
                    <Muted key={i}>{l}</Muted>
                  ))}
                </View>
              )}
              {children}
            </View>
            {wide && selected !== null && <DetailsPanel open={open} selected={selected} select={context.select} />}
            {wide && selected !== null && <SelectionMarks selected={selected} />}
            </scroll.Provider>
          </ScrollView>
        )}
        {sheet === 'atlas' && <Atlas current={view} off={off} onClose={() => setSheet(null)} />}
        {sheet === 'export' && <DataExportSheet snapshot={open.cast.snapshot} model={model} view={exported()} onClose={() => setSheet(null)} />}
        {sheet === 'manage' && <ManageViews off={off} setOff={setOff} onClose={() => setSheet(null)} />}
        {sheet === 'details' && selected !== null && (
          <Sheet visible onClose={() => setSheet(null)} title={selectedLabel ?? frameWords.notFound.title} wide>
            <DetailsPanel open={open} selected={selected} select={context.select} bare />
            <SelectionMarks selected={selected} />
          </Sheet>
        )}
        {sheet === 'saved' && (
          <SavedViews
            view={view}
            open={open}
            service={service}
            filter={filter}
            config={config ?? (() => ({ mode: 'visual', layout: {} }))}
            onApply={(c, f) => {
              context.setFilter(f);
              onApply?.(c);
            }}
            onMissing={(n) => {
              kept.missing = n;
            }}
            onClose={() => setSheet(null)}
          />
        )}
      </View>
    </Context.Provider>
  );
}

// ---------------------------------------------------------------------------------------------- the view's button

function ViewButton({ view, onPress }: { view: string; onPress: () => void }) {
  const label = viewOf(view)?.label ?? null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={frameWords.viewMenu(label)} onPress={onPress} style={({ pressed }) => [styles.menu, pressed && { borderColor: colors.gold }]}>
      <Icon name={(viewIcon[view] ?? 'chart-box-outline') as IconName} size={20} />
      <View style={styles.flex}>
        <Text style={styles.menuLabel}>VIEW</Text>
        <Text style={styles.menuValue} numberOfLines={1}>
          {label ?? frameWords.choose}
        </Text>
      </View>
      <Icon name="apps" size={20} color={colors.muted} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------------- the atlas

/** THE ATLAS OF VIEWS: every view the novel offers as a plate, gathered by subject; the one shown now is framed in
 * the accent and says so. A press opens it. */
export function Atlas({ current, off, onClose }: { current: string | null; off: readonly string[]; onClose: () => void }) {
  const router = useRouter();
  const parts = offeredViews(off);
  return (
    <Sheet visible onClose={onClose} title={atlasWords.title} wide>
      <Text style={styles.atlasIntro}>{atlasWords.intro(parts.length)}</Text>
      {atlasOf(parts).map(([subject, views]) => (
        <View key={subject} style={styles.subject}>
          <Text style={styles.subjectTitle} accessibilityRole="header">
            {subject.toUpperCase()}
          </Text>
          {views.map((v) => (
            <Plate
              key={v.key}
              view={v.key}
              current={v.key === current}
              onPress={(to) => {
                onClose();
                if (v.key !== current && to !== null) {
                  if (current === null) router.navigate(to as never);
                  else router.replace(to as never);
                }
              }}
            />
          ))}
        </View>
      ))}
    </Sheet>
  );
}

/** One view as a plate: its emblem, its name, what it shows; marked when it is shown now, and when its page comes
 * later. */
export function Plate({ view, current, onPress }: { view: string; current: boolean; onPress: (to: string | null) => void }) {
  const v = viewOf(view)!;
  const to = plateTarget(v);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: current, disabled: to === null }}
      accessibilityLabel={atlasWords.plateLabel(v, current)}
      disabled={to === null}
      onPress={() => onPress(to)}
      style={({ pressed }) => [styles.plate, current && styles.plateCurrent, pressed && { borderColor: colors.gold }, to === null && styles.plateLater]}
    >
      <View style={[styles.emblem, current && styles.emblemCurrent]}>
        <Icon name={(viewIcon[view] ?? 'chart-box-outline') as IconName} size={22} color={current ? colors.onGold : colors.gold} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.plateName}>{v.label.toUpperCase()}</Text>
        {current && <Text style={styles.showing}>{atlasWords.showing}</Text>}
        {to === null && <Text style={styles.showing}>{atlasWords.later}</Text>}
        <Text style={styles.plateText} numberOfLines={3}>
          {v.description}
        </Text>
      </View>
    </Pressable>
  );
}

// ------------------------------------------------------------------------------------------------- saved views

function savedOf(open: OpenCast, view: string): SavedView[] {
  return open.cast.snapshot
    .rows('savedViews')
    .filter((r) => r['view'] === view)
    .map((r) => new SavedView(r))
    .sort((a, b) => {
      const x = a.name.toLowerCase();
      const y = b.name.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
}

function SavedButton({ view, open, onPress }: { view: string; open: OpenCast; onPress: () => void }) {
  const saved = savedOf(open, view);
  const id = kept.openSaved.get(view);
  const current = saved.find((s) => s.id === id) ?? null;
  return (
    <OutlineButton label={savedWords.menu(current?.name ?? null, saved.length)} icon="bookmark-multiple-outline" compact onPress={onPress} accessibilityLabel="Saved views" />
  );
}

function SavedViews({
  view,
  open,
  service,
  filter,
  config,
  onApply,
  onMissing,
  onClose,
}: {
  view: string;
  open: OpenCast;
  service: VisualizeService;
  filter: JsonMap;
  config: () => JsonMap;
  onApply: (config: JsonMap, filter: JsonMap) => void;
  onMissing: (n: number) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [ask, setAskState] = useState<'save-as' | 'rename' | 'delete' | null>(null);
  // The menu closes before its action runs: a prompt asked for by the action keeps the sheet open.
  const asking = useRef(false);
  const setAsk = (a: 'save-as' | 'rename' | 'delete') => {
    asking.current = true;
    setAskState(a);
  };
  const saved = savedOf(open, view);
  const current = saved.find((s) => s.id === kept.openSaved.get(view)) ?? null;
  const now = () => cleanConfig({ ...config(), filter });
  const changed = current !== null && !jsonEquals(now(), cleanConfig(current.raw));
  const run = <T,>(apply: Parameters<VisualizeService['change']>[1]): T | undefined => {
    try {
      return service.change(open.novelId, apply) as T;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { error: true });
      return undefined;
    }
  };
  const openView = (s: SavedView) => {
    const opened = openSaved(open.cast.model, s.filter);
    kept.openSaved.set(view, s.id);
    onApply(cleanConfig(s.raw), opened.filter);
    onMissing(opened.missing.length);
    onClose();
  };
  const plain = () => {
    kept.openSaved.delete(view);
    onApply(defaultViewConfig(), {});
    onClose();
  };
  if (ask === 'save-as' || ask === 'rename') {
    return (
      <PromptSheet
        visible
        title={ask === 'save-as' ? savedWords.saveTitle : savedWords.renameTitle}
        label={ask === 'save-as' ? savedWords.saveLabel : savedWords.renameLabel}
        initial={ask === 'rename' ? (current?.name ?? '') : ''}
        confirmLabel={ask === 'save-as' ? savedWords.saveConfirm : savedWords.renameConfirm}
        allowEmpty
        onClose={onClose}
        onSubmit={(name) => {
          if (ask === 'save-as') {
            const id = run<string>((x) => x.save(view, name, now()));
            if (id !== undefined) kept.openSaved.set(view, id);
          } else if (current !== null) run((x) => x.rename(current.id, name));
          onClose();
        }}
      />
    );
  }
  if (ask === 'delete' && current !== null) {
    return (
      <ConfirmDelete
        visible
        title={savedWords.deleteTitle(current.name)}
        message={savedWords.deleteMessage}
        confirmLabel="Delete"
        onClose={onClose}
        onConfirm={() => {
          run((x) => x.removeView(current.id));
          kept.openSaved.delete(view);
          onClose();
        }}
      />
    );
  }
  return (
    <ActionSheet
      visible
      title="Saved views"
      onClose={() =>
        setTimeout(() => {
          if (!asking.current) onClose();
        }, 0)
      }
      actions={[
        ...saved.map((s) => ({ label: s.name, icon: (s.id === current?.id ? 'radiobox-marked' : 'radiobox-blank') as IconName, onPress: () => openView(s) })),
        { label: savedWords.saveAs, icon: 'content-save-outline' as IconName, onPress: () => setAsk('save-as') },
        ...(current !== null
          ? [
              ...(changed ? [{ label: savedWords.save(current.name), icon: 'content-save-edit-outline' as IconName, onPress: () => run((x) => x.update(current.id, now())) }] : []),
              { label: savedWords.rename, icon: 'rename-box' as IconName, onPress: () => setAsk('rename') },
              {
                label: savedWords.duplicate,
                icon: 'content-copy' as IconName,
                onPress: () => {
                  const id = run<string>((x) => x.duplicate(current.id));
                  if (id !== undefined) kept.openSaved.set(view, id);
                },
              },
              {
                label: savedWords.restore,
                icon: 'restore' as IconName,
                onPress: () => {
                  run((x) => x.restoreDefault(current.id));
                  onApply(defaultViewConfig(), {});
                },
              },
              { label: savedWords.delete, icon: 'delete-outline' as IconName, tone: 'danger' as const, onPress: () => setAsk('delete') },
              { label: savedWords.close, icon: 'close' as IconName, onPress: plain },
            ]
          : []),
      ]}
    />
  );
}

// ---------------------------------------------------------------------------------------------- turning views off

function ManageViews({ off, setOff, onClose }: { off: readonly string[]; setOff: (next: string[]) => void; onClose: () => void }) {
  const [blocked, setBlocked] = useState<{ key: string; by: { key: string; why: string }[] } | null>(null);
  const built = visualViews.filter(isBuilt);
  if (blocked !== null) {
    const label = viewLabel(blocked.key);
    return (
      <Sheet visible onClose={() => setBlocked(null)} title={manageWords.stays(label)}>
        <Text style={styles.body2}>{manageWords.staysWhy(label, blocked.by.map((b) => ({ label: viewLabel(b.key), why: b.why })))}</Text>
        <View style={styles.actions}>
          <OutlineButton label={manageWords.keep(label)} compact tone="muted" onPress={() => setBlocked(null)} />
          <GoldButton
            label={manageWords.offAll([...blocked.by.map((b) => viewLabel(b.key)), label])}
            compact
            onPress={() => {
              setOff(turnOff(off, [blocked.key, ...blocked.by.map((b) => b.key)]).off);
              setBlocked(null);
            }}
          />
        </View>
      </Sheet>
    );
  }
  return (
    <Sheet visible onClose={onClose} title={manageWords.title} footer={<GoldButton label={manageWords.done} onPress={onClose} style={styles.flex} />}>
      <Muted>{manageWords.intro}</Muted>
      {built.map((v) => (
        <View key={v.key} style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={styles.switchTitle}>{v.label}</Text>
            <Muted numberOfLines={3}>{v.description}</Muted>
          </View>
          <Switch
            value={isViewOn(off, v.key)}
            onValueChange={(on) => {
              if (on) {
                setOff(turnOn(off, v.key).off);
                return;
              }
              const r = turnOff(off, [v.key]);
              if (r.blocked.length === 0) setOff(r.off);
              else setBlocked(r.blocked[0]);
            }}
            trackColor={{ true: colors.gold, false: colors.border }}
            thumbColor={colors.text}
            accessibilityLabel={v.label}
          />
        </View>
      ))}
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------- the details

/** The selected record's details, the same in every view: its facts, and everything it is connected to, each of which
 * can be selected in turn. It opens on the page where it is kept. */
function DetailsPanel({ open, selected, select, bare = false }: { open: OpenCast; selected: EntityRef; select: (r: EntityRef | null) => void; bare?: boolean }) {
  const router = useRouter();
  const lib = useLibrary();
  const model = open.cast.model;
  const details = detailsOf(model, selected);
  const go = () => {
    switch (selected.type) {
      case 'entry':
        router.navigate((model.entries.get(selected.id)?.category === 'character' ? characterPath(selected.id) : worldEntryPath(selected.id)) as never);
        return;
      case 'node':
        lib.saves.saveNow(`setting:${lastNodeSetting(open.novelId)}`, () => lib.settings.write(lastNodeSetting(open.novelId), selected.id));
        router.navigate('/write');
        return;
      case 'event':
        router.navigate(eventPath(selected.id) as never);
        return;
      case 'relation':
        router.navigate(relationshipPath(selected.id) as never);
        return;
      default:
        return;
    }
  };
  const Box = bare ? View : Panel;
  if (details === null) {
    return (
      <Box style={styles.details}>
        <Text style={styles.detailsTitle}>{frameWords.notFound.title}</Text>
        <Muted>{frameWords.notFound.message}</Muted>
        <OutlineButton label={frameWords.notFound.clear} compact onPress={() => select(null)} style={styles.start} />
      </Box>
    );
  }
  const label = openLabel(model, selected);
  return (
    <Box style={styles.details} accessibilityLabel={`Details of ${details.view.label}`}>
      <View style={styles.detailsHead}>
        {!bare && (
          <Text style={[styles.detailsTitle, styles.flex]} accessibilityRole="header">
            {details.view.label}
          </Text>
        )}
        {label !== null && <GoldButton label={label} compact onPress={go} />}
        {!bare && <IconButton icon="close" label={frameWords.closeDetails} onPress={() => select(null)} />}
      </View>
      {details.facts.map((f) => (
        <Text key={f.label} style={styles.fact}>
          <Text style={styles.bold}>{`${f.label}: `}</Text>
          {f.value}
        </Text>
      ))}
      {details.groups.map((g) => (
        <View key={g.title} style={styles.group}>
          <Text style={styles.groupTitle}>{g.title}</Text>
          <View style={styles.wrap}>
            {g.items.map((i) => (
              <Pressable key={`${i.ref.key}|${i.note}`} accessibilityRole="button" onPress={() => select(i.ref)} style={({ pressed }) => [styles.item, pressed && { borderColor: colors.gold }]}>
                <Text style={styles.itemText}>{i.note.length === 0 ? i.label : `${i.label} · ${i.note}`}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      {details.groups.length === 0 && <Muted>{frameWords.nothingConnected}</Muted>}
    </Box>
  );
}

// ------------------------------------------------------------------------------------------------------ the badge

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  start: { alignSelf: 'flex-start' },
  bold: { fontWeight: '700' },
  page: { flex: 1, backgroundColor: colors.background },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.sm },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  body: { padding: space.md, gap: space.md, width: '100%', paddingBottom: space.xxl },
  body2: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  empty: { alignItems: 'center', gap: space.md, margin: space.lg, maxWidth: 420 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text, textAlign: 'center' },
  offPanel: { alignItems: 'center', gap: space.md },
  bar: { gap: space.sm },
  menu: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52, paddingHorizontal: space.md, borderRadius: radius.field, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  menuLabel: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.4, color: colors.gold },
  menuValue: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  filters: { gap: space.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  selectedRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  selectedText: { fontFamily: fonts.ui, fontSize: 14, color: colors.text, flexShrink: 1 },
  picture: { backgroundColor: colors.background, gap: space.md },
  pictureHead: { padding: space.md, gap: 4 },
  atlasIntro: { fontFamily: fonts.bookItalic, fontSize: 15, lineHeight: 22, color: colors.muted },
  subject: { gap: space.sm, marginTop: space.md },
  subjectTitle: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.6, color: colors.gold },
  plate: { flexDirection: 'row', gap: 14, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  plateCurrent: { borderWidth: 2, borderColor: colors.gold, backgroundColor: 'rgba(243, 182, 58, 0.08)' },
  plateLater: { opacity: 0.6 },
  emblem: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  emblemCurrent: { backgroundColor: colors.gold },
  plateName: { fontFamily: fonts.display, fontSize: 13.5, fontWeight: '700', letterSpacing: 1, color: colors.text },
  showing: { fontFamily: fonts.bookItalic, fontSize: 14, color: colors.gold },
  plateText: { fontFamily: fonts.book, fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  switchTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.text },
  details: { gap: space.sm },
  detailsHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  detailsTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  fact: { fontFamily: fonts.ui, fontSize: 14, lineHeight: 20, color: colors.text },
  group: { gap: 6, marginTop: space.xs },
  groupTitle: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.gold },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  item: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  itemText: { fontFamily: fonts.ui, fontSize: 13.5, color: colors.text },
});
