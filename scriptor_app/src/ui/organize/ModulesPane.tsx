// THE MODULE MANAGER (FEATURES.md #221–#224, #227): every genre module that can be switched on for this novel, where
// each stands (available, on, switched off, needing attention), what it shares, what turning it on would add to this
// book (the try-on), "Made for your story" at its head (the modules the book's own words call for), and the author's
// own modules: made from this novel, kept on this device, exported and imported as `.module.json`. Switching one on
// creates no records; switching one off deletes none. Ports of flutter_app/lib/features/modules/modules_page.dart,
// genre_shelf.dart and try_on_panel.dart; the logic is src/domain/modules/screens/{manager,shelf}.ts.

import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { pickTextFile, shareTextFile } from '../../data/files';
import { kindColor } from '../../domain/codex/screens/world';
import { newId } from '../../domain/ids';
import { str } from '../../domain/json';
import { ModuleChanges, type ModuleStatus, moduleFile, readModuleFile } from '../../domain/modules/moduleChanges';
import { type ModuleDefinition, builtinModules } from '../../domain/modules/moduleDefs';
import { type ModuleFit, modulesSuggestionJob } from '../../domain/modules/moduleMatch';
import { modulePath } from '../../domain/modules/moduleService';
import {
  type ShowModules,
  definitionToEnable,
  exportFileName,
  exportedMessage,
  fitsShown,
  forYourStory,
  importedMessage,
  keptMessage,
  managerColumns,
  managerView,
  managerWords,
  moduleCard,
  notAModuleMessage,
  removedMessage,
  savedMessage,
  showModules,
  showModulesLabel,
  suggestionKey,
  toggledMessage,
  updatedMessage,
  visibleUnder,
} from '../../domain/modules/screens/manager';
import { type ShelfVolume, shelfLayout, shelfTile, shelfWords, spineHeight, tryOnKey, tryOnShelf, tryOnView, tryOnWords } from '../../domain/modules/screens/shelf';
import { tryOnModule } from '../../domain/modules/tryOn';
import { Novel } from '../../domain/records/novel';
import { Chip, GoldButton, Icon, type IconName, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { colors, fonts, radius, sizeClassOf, space } from '../theme';
import { useToast } from '../toast';
import { ChooserField } from './parts';
import { type OpenModules, useModules } from './useModules';

// ------------------------------------------------------------------------------------------------------- icons

/** Material Icons' names (as the Flutter app gives them) in Material Community Icons. */
const iconOf: Record<string, IconName> = {
  check_circle_outline: 'check-circle-outline',
  warning_amber_outlined: 'alert-outline',
  pause_circle_outline: 'pause-circle-outline',
  add_circle_outline: 'plus-circle-outline',
  menu_book_outlined: 'book-open-outline',
  view_kanban_outlined: 'view-column-outline',
  table_chart_outlined: 'table',
  grid_on: 'grid',
  speed: 'speedometer',
  history_edu: 'feather',
  calculate_outlined: 'calculator-variant-outline',
  military_tech_outlined: 'medal-outline',
  backpack_outlined: 'bag-personal-outline',
  account_tree_outlined: 'family-tree',
  open_in_new: 'open-in-new',
};
const icon = (material: string): IconName => iconOf[material] ?? 'puzzle-outline';

const buttonIcon: Record<string, IconName> = {
  open: 'open-in-app',
  configure: 'cog-outline',
  update: 'update',
  disable: 'power',
  enable: 'power',
  export: 'export-variant',
  remove: 'delete-outline',
  keep: 'bookmark-plus-outline',
};

// -------------------------------------------------------------------------------------------------------- the pane

export function ModulesPane() {
  const mods = useModules();
  if (!mods) return null;
  return <Manager mods={mods} />;
}

function Manager({ mods }: { mods: OpenModules }) {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const phone = sizeClassOf(width) === 'compact';
  const writes = true;
  const [show, setShow] = useState<ShowModules>('all');
  const [opened, setOpened] = useState<string | null>(null);
  const { snapshot, novelId, library } = mods;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const available = useMemo(() => library.available(), [library, revision]);
  const view = useMemo(() => managerView(snapshot, available), [snapshot, available]);
  const tell = (message: string) => toast(message);

  // MADE FOR YOUR STORY: read away from the first render, again only when the book's chapters, details or the modules
  // on change (the Flutter app once froze reading a long book on every save).
  const novel = new Novel(snapshot.project);
  const genres = [novel.primaryGenre, ...novel.secondaryGenres];
  const key = suggestionKey({
    novelId,
    stamp: { count: lib.novels.versionOf(novelId, ['chapterContents']), latest: null },
    genres,
    tags: novel.tags,
    synopsis: novel.synopsis,
    on: view.onIds,
  });
  const [fits, setFits] = useState<{ key: string; novelId: string; fits: ModuleFit[] } | null>(null);
  useEffect(() => {
    if (fits?.key === key) return;
    const t = setTimeout(() => {
      try {
        const stored = lib.novels.rowsIn(novelId, 'chapterContents').map((r) => JSON.stringify(r));
        const found = modulesSuggestionJob({ genres, tags: novel.tags, synopsis: novel.synopsis, storedContents: stored, on: view.onIds })();
        setFits({ key, novelId, fits: found });
      } catch {
        setFits({ key, novelId, fits: [] });
      }
    }, 30);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const story = forYourStory(fitsShown(fits?.fits ?? [], fits?.novelId ?? null, novelId, view.onIds));

  const toggle = (module: ModuleDefinition) => {
    const turningOn = !view.isOn(module.id);
    const at = view.status.get(module.id) ?? null;
    const done = mods.now((m) => {
      if (turningOn) m.enable(definitionToEnable(module, view.mine, available));
      else m.disable(module.id);
      return true;
    });
    if (done === true) tell(toggledMessage(module, turningOn, at));
  };
  const update = (module: ModuleDefinition) => {
    const latest = available.find((d) => d.id === module.id) ?? module;
    if (mods.now((m) => m.enable(latest)) !== undefined) tell(updatedMessage(module));
  };
  const exportModule = async (module: ModuleDefinition) => {
    try {
      await shareTextFile(exportFileName(module), JSON.stringify(moduleFile(module), null, 2));
      tell(exportedMessage('Shared', module));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { error: true });
    }
  };
  const importModule = async () => {
    const picked = await pickTextFile();
    if (!picked) return;
    let definition: ModuleDefinition;
    try {
      definition = readModuleFile(JSON.parse(picked.text), { newId });
    } catch {
      tell(notAModuleMessage(picked.name));
      return;
    }
    library.save(definition);
    tell(importedMessage(definition));
  };

  const press = (kind: string, module: ModuleDefinition) => {
    switch (kind) {
      case 'open':
        router.navigate(modulePath(module.id) as never);
        return;
      case 'configure':
        router.navigate(`${modulePath(module.id)}?configure=1` as never);
        return;
      case 'update':
        update(module);
        return;
      case 'disable':
      case 'enable':
        toggle(module);
        return;
      case 'export':
        void exportModule(module);
        return;
      case 'remove':
        library.remove(module.id);
        tell(removedMessage(module));
        return;
      case 'keep':
        library.save(module);
        tell(keptMessage(module));
        return;
    }
  };

  const card = (listed: ModuleDefinition, owned: boolean) => (
    <ModuleCard
      key={listed.id}
      mods={mods}
      listed={listed}
      at={view.status.get(listed.id) ?? null}
      owned={owned}
      writes={writes}
      onPress={press}
    />
  );
  const columns = managerColumns(width - space.md * 2);
  const cellWidth = (width - space.md * 2 - 12 * (columns - 1)) / columns;
  const grid = (cards: ReactNode[]) => (
    <View style={styles.grid}>
      {cards.map((c, i) => (
        <View key={i} style={{ width: cellWidth }}>
          {c}
        </View>
      ))}
    </View>
  );
  const genreModules = builtinModules.filter((m) => visibleUnder(show, view.isOn(m.id)));
  const title = str(snapshot.project['title']);

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={styles.pageTitle} accessibilityRole="header">
        {managerWords.title}
      </Text>
      <Muted>{view.subtitle}</Muted>

      {writes && story.length > 0 && (
        <Panel style={styles.gap}>
          <Text style={styles.storyTitle} accessibilityRole="header">
            {managerWords.forStory}
          </Text>
          <Text style={styles.storyIntro}>{managerWords.forStoryIntro}</Text>
          <View style={styles.rule} />
          {story.map((s, i) => (
            <View key={s.module.id} style={styles.storyRow}>
              <View style={styles.ring}>
                <Text style={styles.ringSign} importantForAccessibility="no">
                  {asText(s.module.icon)}
                </Text>
              </View>
              <View style={[styles.flex, styles.gapXs]}>
                <Text style={styles.storyName}>{s.module.name}</Text>
                <Text style={styles.storySaid}>{s.said}</Text>
                {s.features.length > 0 && <Muted>{s.features}</Muted>}
                <GoldButton
                  label={managerWords.turnOn}
                  icon="power"
                  compact
                  accessibilityLabel={`Turn on ${s.module.name}`}
                  onPress={() => toggle(s.module)}
                  style={styles.start}
                />
                <TryOnPanel mods={mods} module={s.module} title={title} initiallyOpen={i === 0} />
              </View>
            </View>
          ))}
        </Panel>
      )}

      <Text style={styles.heading} accessibilityRole="header">
        {managerWords.genre}
      </Text>
      <View style={styles.chips}>
        {showModules.map((s) => (
          <Chip key={s} label={showModulesLabel[s]} selected={show === s} onPress={() => setShow(s)} />
        ))}
      </View>
      {phone ? (
        <GenreShelf
          modules={genreModules}
          stateOf={(m) => view.status.get(m.id)?.state ?? 'available'}
          opened={opened}
          writes={writes}
          card={(m) => card(m, false)}
          onOpen={(m) => setOpened(opened === m.id ? null : m.id)}
          onTurnOn={toggle}
          onGo={(m) => router.navigate(modulePath(m.id) as never)}
        />
      ) : (
        grid(genreModules.map((m) => card(m, false)))
      )}

      <Text style={styles.heading} accessibilityRole="header">
        {managerWords.yours}
      </Text>
      {view.mine.length === 0 && view.foreign.length === 0 ? (
        <Muted>{managerWords.none}</Muted>
      ) : (
        grid([...view.mine.map((m) => card(m, true)), ...view.foreign.map((m) => card(m, false))])
      )}
      <OutlineButton label={managerWords.importButton} icon="file-import-outline" compact onPress={() => void importModule()} style={styles.start} />

      {writes && <MakeModule mods={mods} packable={view.packable} systems={view.systems} onSaved={(m) => { library.save(m); tell(savedMessage(m)); }} />}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------------------------------------- a card

function ModuleCard({
  mods,
  listed,
  at,
  owned,
  writes,
  onPress,
}: {
  mods: OpenModules;
  listed: ModuleDefinition;
  at: ModuleStatus | null;
  owned: boolean;
  writes: boolean;
  onPress: (kind: string, module: ModuleDefinition) => void;
}) {
  const c = moduleCard(listed, at, { owned, writes });
  const [details, setDetails] = useState(false);
  return (
    <Panel style={styles.card}>
      <View style={styles.cardHead}>
        {c.icon && <Text style={styles.cardSign}>{asText(c.icon)}</Text>}
        <View style={styles.flex}>
          <Text style={styles.cardName}>{c.name}</Text>
          {c.genre && <Text style={styles.cardGenre}>{c.genre}</Text>}
        </View>
        {c.yours && <Text style={styles.yours}>{managerWords.yoursChip}</Text>}
      </View>
      <View style={styles.state} accessibilityLabel={c.stateLabel}>
        <Icon name={icon(c.stateIcon)} size={16} color={c.isEnabled ? colors.gold : colors.muted} />
        <Text style={[styles.stateText, c.isEnabled && { color: colors.gold }]}>{c.stateLabel}</Text>
      </View>
      {c.reasons.map((r) => (
        <Text key={r} style={styles.reason}>
          {r}
        </Text>
      ))}
      <Text style={styles.description}>{c.description}</Text>
      {c.features.length > 0 && (
        <View accessibilityLabel={c.featuresLabel} style={styles.gapXs}>
          {c.features.map((f) => (
            <View key={f} style={styles.feature}>
              <Icon name="circle-small" size={18} color={colors.gold} />
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>
      )}
      {c.tryOn && <TryOnPanel mods={mods} module={c.module} title={str(mods.snapshot.project['title'])} initiallyOpen={false} />}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} onPress={() => setDetails(!details)} style={styles.detailsToggle}>
        <Text style={styles.detailsText}>{managerWords.details}</Text>
        <Icon name={details ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>
      {details && (
        <View style={styles.gapXs}>
          {c.details.map((d) => (
            <Text key={d} style={styles.detail}>
              {d}
            </Text>
          ))}
          <Muted>{c.version}</Muted>
        </View>
      )}
      {c.usage && <Text style={styles.usage}>{c.usage}</Text>}
      {c.off && <Muted>{c.off}</Muted>}
      <View style={styles.buttons}>
        {c.buttons.map((b) =>
          b.kind === 'open' || b.kind === 'enable' ? (
            <GoldButton key={b.kind} label={b.label} icon={buttonIcon[b.kind]} compact accessibilityLabel={b.semanticsLabel} onPress={() => onPress(b.kind, c.module)} />
          ) : (
            <OutlineButton
              key={b.kind}
              label={b.label}
              icon={buttonIcon[b.kind]}
              compact
              tone={b.kind === 'remove' ? 'danger' : b.kind === 'keep' ? 'muted' : 'gold'}
              accessibilityLabel={b.semanticsLabel}
              onPress={() => onPress(b.kind, c.module)}
            />
          ),
        )}
      </View>
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------- the genre shelf

function GenreShelf({
  modules,
  stateOf,
  opened,
  writes,
  card,
  onOpen,
  onTurnOn,
  onGo,
}: {
  modules: ModuleDefinition[];
  stateOf: (m: ModuleDefinition) => ModuleStatus['state'];
  opened: string | null;
  writes: boolean;
  card: (m: ModuleDefinition) => ReactNode;
  onOpen: (m: ModuleDefinition) => void;
  onTurnOn: (m: ModuleDefinition) => void;
  onGo: (m: ModuleDefinition) => void;
}) {
  // Two by two; the open module's full card spans the row after the pair it is in.
  const rows: ModuleDefinition[][] = [];
  for (let i = 0; i < modules.length; i += 2) rows.push(modules.slice(i, i + 2));
  return (
    <View style={styles.gap}>
      {rows.map((row) => {
        const open = row.find((m) => m.id === opened) ?? null;
        return (
          <View key={row.map((m) => m.id).join('|')} style={styles.gap}>
            <View style={styles.shelfRow}>
              {row.map((m) => (
                <ShelfTile key={m.id} m={m} state={stateOf(m)} writes={writes} onOpen={() => onOpen(m)} onTurnOn={() => onTurnOn(m)} onGo={() => onGo(m)} />
              ))}
              {row.length === 1 && <View style={styles.flex} />}
            </View>
            {open && (
              <View style={styles.gapXs}>
                {card(open)}
                <OutlineButton label={shelfWords.back} icon="arrow-up" compact tone="muted" accessibilityLabel={shelfWords.close(open)} onPress={() => onOpen(open)} style={styles.start} />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function ShelfTile({
  m,
  state,
  writes,
  onOpen,
  onTurnOn,
  onGo,
}: {
  m: ModuleDefinition;
  state: ModuleStatus['state'];
  writes: boolean;
  onOpen: () => void;
  onTurnOn: () => void;
  onGo: () => void;
}) {
  const t = shelfTile(m, state, writes);
  const pressButton = t.button.kind === 'open' ? onGo : t.button.kind === 'turnOn' ? onTurnOn : onOpen;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.name}. ${t.line}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.tile, t.on ? styles.tileOn : styles.tileOff, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.band, { backgroundColor: t.tone }]}>
        <Text style={[styles.bandSign, { color: t.ink }]} importantForAccessibility="no">
          {asText(t.sign)}
        </Text>
        {t.badge && (
          <View style={styles.badge} accessibilityLabel={t.badge.label}>
            <Icon name={t.badge.icon === 'warning' ? 'alert-outline' : 'check-circle'} size={18} color={t.ink} />
          </View>
        )}
      </View>
      <View style={styles.tileBody}>
        <Text style={styles.tileName} numberOfLines={3}>
          {t.name}
        </Text>
        {t.genre && (
          <Text style={styles.tileGenre} numberOfLines={2}>
            {t.genre}
          </Text>
        )}
        <Text style={[styles.tileLine, t.on && { color: colors.gold }]}>{t.line}</Text>
        {t.button.kind === 'turnOn' ? (
          <GoldButton label={t.button.label} compact accessibilityLabel={t.button.semanticsLabel} onPress={pressButton} />
        ) : (
          <OutlineButton label={t.button.label} compact accessibilityLabel={t.button.semanticsLabel} onPress={pressButton} />
        )}
      </View>
    </Pressable>
  );
}

// --------------------------------------------------------------------------------------------------- the try-on

function TryOnPanel({ mods, module, title, initiallyOpen }: { mods: OpenModules; module: ModuleDefinition; title: string; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const { width } = useWindowDimensions();
  const [shelfWidth, setShelfWidth] = useState(0);
  const key = tryOnKey(mods.snapshot.project['updatedAt'], mods.snapshot.rows('categories').length, module.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useMemo(() => (open ? tryOnModule(mods.snapshot, module) : null), [open, key]);
  const v = t ? tryOnView(t, module, title, width) : null;
  const shelf = t ? tryOnShelf(t) : [];
  const layout = shelfWidth > 0 && shelf.length > 0 ? shelfLayout(shelf, shelfWidth) : null;
  return (
    <View style={styles.tryOn}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.tryOnToggle}>
        <Icon name={open ? 'eye-off-outline' : 'eye-outline'} size={18} />
        <Text style={styles.tryOnToggleText}>{open ? tryOnWords.hide : tryOnWords.see}</Text>
      </Pressable>
      {v && t && (
        <View style={styles.tryOnBody}>
          <Text style={styles.tryOnHeading}>{v.heading}</Text>
          {shelf.length > 0 && (
            <View accessibilityLabel={v.shelfLabel ?? undefined}>
              <View onLayout={(e) => setShelfWidth(e.nativeEvent.layout.width)} style={styles.shelfBox}>
                {layout &&
                  (layout.fits ? (
                    <Spines layout={layout} />
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <Spines layout={layout} />
                    </ScrollView>
                  ))}
              </View>
              <View style={styles.shelfBoard} />
              <Text style={styles.tryOnText}>{v.kinds}</Text>
            </View>
          )}
          {v.gains.map((g) => (
            <View key={g} style={styles.gain}>
              <Icon name="plus-circle-outline" size={16} />
              <Text style={[styles.tryOnText, styles.flex]}>{g}</Text>
            </View>
          ))}
          {v.toolsHeading && (
            <>
              <Text style={styles.toolsHeading}>{v.toolsHeading}</Text>
              <View style={styles.tools}>
                {v.tools.map((tool, i) => (
                  <View key={`${tool.title}-${i}`} style={styles.tool}>
                    <Icon name={icon(tool.icon)} size={16} />
                    <Text style={styles.toolText}>{tool.title}</Text>
                  </View>
                ))}
                {v.moreTools && <Text style={styles.moreTools}>{v.moreTools}</Text>}
              </View>
            </>
          )}
          {v.system && <Text style={styles.system}>{v.system}</Text>}
          <View style={styles.gain}>
            <Icon name="shield-check-outline" size={16} color={colors.muted} />
            <Muted style={styles.flex}>{v.promise}</Muted>
          </View>
        </View>
      )}
    </View>
  );
}

function Spines({ layout }: { layout: ReturnType<typeof shelfLayout> }) {
  return (
    <View style={[styles.spines, { gap: layout.gap }]}>
      {layout.order.map((s: ShelfVolume) => {
        const height = spineHeight(s.fresh);
        return (
          <View key={`${s.kind.key}-${s.fresh}`} style={{ width: layout.width, alignItems: 'center' }}>
            {s.fresh && (
              // One line however narrow the spine: a phone's wider text wrapped it to "NE / W" (seen 2026-11-17).
              <Text style={styles.newMark} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {tryOnWords.isNew}
              </Text>
            )}
            <View
              style={[
                styles.spine,
                { height, width: layout.width },
                s.fresh ? { backgroundColor: 'rgba(243, 182, 58, 0.18)', borderColor: colors.gold, borderWidth: 1.4 } : null,
              ]}
            >
              <View style={[styles.spineBand, { backgroundColor: kindColor(s.kind) }]}>{s.more && <Icon name="plus" size={9} color="#FFFFFF" />}</View>
              <View style={styles.spineTitleBox}>
                <Text
                  numberOfLines={1}
                  style={[styles.spineTitle, { width: height - 18, color: s.fresh ? colors.gold : colors.muted }]}
                >
                  {s.kind.name}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------------------------------- make a module of this

function MakeModule({
  mods,
  packable,
  systems,
  onSaved,
}: {
  mods: OpenModules;
  packable: ReturnType<typeof managerView>['packable'];
  systems: { id: string; name: string }[];
  onSaved: (m: ModuleDefinition) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [genre, setGenre] = useState('');
  const [description, setDescription] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [systemId, setSystemId] = useState<string>('');
  const save = () => {
    let built: ModuleDefinition;
    try {
      built = new ModuleChanges(mods.snapshot, { now: 0, createId: newId }).buildFrom({
        name,
        genre,
        description,
        categoryKeys: picked,
        systemId: systemId === '' ? null : systemId,
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { error: true });
      return;
    }
    onSaved(built);
    setName('');
    setGenre('');
    setDescription('');
    setPicked([]);
    setSystemId('');
  };
  const field = (label: string, value: string, set: (v: string) => void, hint?: string) => (
    <View style={styles.gapXs}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <TextInput
        value={value}
        onChangeText={set}
        placeholder={hint}
        placeholderTextColor={colors.muted}
        selectionColor={colors.gold}
        style={styles.input}
        accessibilityLabel={label}
      />
    </View>
  );
  return (
    <Panel style={[styles.gap, styles.make]}>
      <Text style={styles.makeTitle} accessibilityRole="header">
        {managerWords.make}
      </Text>
      {field(managerWords.name, name, setName, managerWords.nameHint)}
      {field(managerWords.genreLabel, genre, setGenre, managerWords.genreHint)}
      {field(managerWords.description, description, setDescription)}
      <Text style={styles.subheading}>{managerWords.categories}</Text>
      {packable.map((p) => {
        const on = picked.includes(p.category.key);
        return (
          <View key={p.category.key} style={styles.pick}>
            <Switch
              value={on}
              onValueChange={(v) => setPicked(v ? [...picked, p.category.key] : picked.filter((k) => k !== p.category.key))}
              trackColor={{ true: colors.gold, false: colors.border }}
              thumbColor={colors.text}
              accessibilityLabel={p.category.name}
            />
            <View style={styles.flex}>
              <Text style={styles.pickName}>{p.category.name}</Text>
              <Muted numberOfLines={2}>{p.fields}</Muted>
            </View>
          </View>
        );
      })}
      {systems.length > 0 && (
        <ChooserField
          label={managerWords.system}
          value={systemId}
          choices={[{ value: '', label: managerWords.noSystem }, ...systems.map((s) => ({ value: s.id, label: s.name }))]}
          onChoose={setSystemId}
        />
      )}
      <GoldButton label={managerWords.save} icon="content-save-outline" onPress={save} style={styles.start} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space.md },
  gapXs: { gap: space.xs },
  start: { alignSelf: 'flex-start' },
  body: { padding: space.md, paddingBottom: space.xxl * 2, gap: space.md },
  pageTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  heading: { fontFamily: fonts.display, fontSize: 18, color: colors.text, marginTop: space.md },
  subheading: { fontFamily: fonts.ui, fontSize: 14, fontWeight: '700', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  rule: { height: 1, backgroundColor: colors.gold, opacity: 0.4, marginVertical: space.xs },
  // made for your story
  storyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  storyIntro: { fontFamily: fonts.bookItalic, fontSize: 15, lineHeight: 22, color: colors.muted },
  storyRow: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  ring: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  ringSign: { fontSize: 20, color: colors.gold },
  storyName: { fontFamily: fonts.display, fontSize: 14, color: colors.text },
  storySaid: { fontFamily: fonts.book, fontSize: 15, lineHeight: 22, color: colors.muted },
  // a card
  card: { gap: space.sm },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  cardSign: { fontSize: 26, color: colors.gold, width: 34, textAlign: 'center' },
  cardName: { fontFamily: fonts.display, fontSize: 17, color: colors.text },
  cardGenre: { fontFamily: fonts.bookItalic, fontSize: 14, color: colors.muted },
  yours: { fontFamily: fonts.ui, fontSize: 12, color: colors.sky, borderWidth: 1, borderColor: colors.sky, borderRadius: radius.chip, paddingHorizontal: 8, paddingVertical: 2 },
  state: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stateText: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  reason: { fontFamily: fonts.ui, fontSize: 13, color: colors.danger },
  description: { fontFamily: fonts.ui, fontSize: 14.5, lineHeight: 21, color: colors.text },
  feature: { flexDirection: 'row', alignItems: 'flex-start' },
  featureText: { flex: 1, fontFamily: fonts.ui, fontSize: 13.5, lineHeight: 19, color: colors.text },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, alignSelf: 'flex-start' },
  detailsText: { fontFamily: fonts.ui, fontSize: 13.5, color: colors.muted },
  detail: { fontFamily: fonts.ui, fontSize: 13.5, lineHeight: 19, color: colors.text },
  usage: { fontFamily: fonts.ui, fontSize: 13.5, color: colors.text },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  // the shelf
  shelfRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  tile: { flex: 1, borderRadius: 12, backgroundColor: colors.surface, overflow: 'hidden' },
  tileOn: { borderWidth: 2, borderColor: colors.gold },
  tileOff: { borderWidth: 1, borderColor: 'rgba(39, 46, 64, 0.7)' },
  band: { height: 64, alignItems: 'center', justifyContent: 'center' },
  bandSign: { fontSize: 30 },
  badge: { position: 'absolute', top: 6, right: 6 },
  tileBody: { padding: space.sm, gap: 4, flex: 1, justifyContent: 'space-between' },
  tileName: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '700', color: colors.text },
  tileGenre: { fontFamily: fonts.bookItalic, fontSize: 14, color: colors.muted },
  tileLine: { fontFamily: fonts.ui, fontSize: 13.5, color: colors.muted, marginBottom: 4 },
  // the try-on
  tryOn: { gap: space.xs, marginTop: space.xs },
  tryOnToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, alignSelf: 'flex-start' },
  tryOnToggleText: { fontFamily: fonts.ui, fontSize: 14, color: colors.gold },
  tryOnBody: { gap: 6, padding: space.sm, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  tryOnHeading: { fontFamily: fonts.ui, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: colors.muted },
  tryOnText: { fontFamily: fonts.book, fontSize: 15, lineHeight: 21, color: colors.text },
  shelfBox: { minHeight: 120, justifyContent: 'flex-end' },
  shelfBoard: { height: 3, backgroundColor: 'rgba(148, 163, 184, 0.5)', marginBottom: 6 },
  spines: { flexDirection: 'row', alignItems: 'flex-end' },
  newMark: { fontFamily: fonts.ui, fontSize: 8, fontWeight: '700', color: colors.gold, marginBottom: 3, alignSelf: 'stretch', textAlign: 'center' },
  spine: { borderTopLeftRadius: 3, borderTopRightRadius: 3, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated, overflow: 'hidden' },
  spineBand: { height: 10, alignItems: 'center', justifyContent: 'center' },
  spineTitleBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  spineTitle: { fontFamily: fonts.ui, fontSize: 10, fontWeight: '600', textAlign: 'center', transform: [{ rotate: '-90deg' }] },
  gain: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  toolsHeading: { fontFamily: fonts.ui, fontSize: 12.5, color: colors.muted, marginTop: 4 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 8, paddingRight: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  toolText: { fontFamily: fonts.ui, fontSize: 12.5, color: colors.text },
  moreTools: { fontFamily: fonts.ui, fontSize: 12.5, color: colors.muted, paddingVertical: 5, paddingHorizontal: 4 },
  system: { fontFamily: fonts.bookItalic, fontSize: 14.5, color: colors.muted },
  // make a module
  make: { marginTop: space.md },
  makeTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.text },
  label: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.4, color: colors.gold },
  input: { minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated, paddingHorizontal: space.md, color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  pickName: { fontFamily: fonts.ui, fontSize: 14.5, color: colors.text },
});

/** A module's sign drawn as a symbol in the text's colour, never a colour emoji: the text form (U+FE0E) of ❤ ⚡ ⏳,
 * which a phone otherwise draws as emoji beside the plain ✦ ▲ ◎ ☾ (seen on the owner's phone, 2026-11-17). */
export function asText(sign: string): string {
  return sign.length === 0 || sign.endsWith('︎') ? sign : `${sign.replace(/️/g, '')}︎`;
}
