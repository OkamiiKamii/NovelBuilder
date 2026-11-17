// THE CHARACTER LIBRARY (FEATURES.md #135–#139, #152, #154): every character in the novel, found by search (name,
// aliases, epithet, summary, roles, status, tags, factions and field values, ignoring case and accents), sorted,
// filtered and split by role, as portrait cards or rows; New character; the relationship map. A port of
// flutter_app/lib/features/characters/characters_page.dart; what it shows is src/domain/characters/screens/library.ts.

import { useRouter } from 'expo-router';
import { type ComponentRef, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { CastFilters, type CastSort, castSortLabel, castSorts, type Listed } from '../../domain/characters/cast';
import { isUploadedImage } from '../../domain/characters/screens/profile';
import {
  canReorder,
  cardLabel,
  cardRoles,
  cardWhere,
  castPage,
  castTone,
  filterMenus,
  filtersLabel,
  libraryView,
  libraryWords,
  listRow,
  monogram,
  moveInOrder,
  moveTooltips,
  noResults,
  presenceOf,
  roleTabs,
  showMoreLabel,
  whereNote,
} from '../../domain/characters/screens/library';
import { characterPath } from '../../domain/characters/screens/create';
import { Sheet } from '../dialogs';
import { Chip, GoldButton, Icon, IconButton, Muted, OutlineButton } from '../kit';
import { colors, fonts, radius, sizeClassOf, space } from '../theme';
import { NewCharacterSheet } from './NewCharacterSheet';
import { CastStage } from './CastStage';
import { DramatisSheet } from './DramatisSheet';
import { CompassView, NameBoardView, RollCallView, StakesView, TiesView } from './CastBoards';
import { ArcsView, EntrancesView, EyesView, OrbitView, TableReadView } from './CastViewsDrawn';
import { CastPagePanels } from './CastFound';
import { type CastView, castViewKey, castViewOf } from '../../domain/characters/castData';
import { castViewButton, castViewPicked, castViewSheet } from '../../domain/characters/views/viewChooser';
import type { IconName } from '../kit';
import { useLibrary } from '../LibraryContext';
import type { OpenCast } from './useCast';
import { ChooserField } from './parts';
import { useCast } from './useCast';
import type { OpenNovel } from './useNovel';

export function CastPane({ novel }: { novel: OpenNovel }) {
  void novel;
  const open = useCast();
  const router = useRouter();
  const [dramatis, setDramatis] = useState(false);
  const { width } = useWindowDimensions();
  const phone = sizeClassOf(width) === 'compact';
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<CastFilters>(CastFilters.none);
  const [sort, setSort] = useState<CastSort>('name');
  const lib = useLibrary();
  const castView = castViewOf(lib.settings.read(castViewKey));
  const [choosing, setChoosing] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const chooseView = (v: CastView) =>
    lib.saves.saveNow(`setting:${castViewKey}`, () => {
      lib.settings.write(castViewKey, v);
      lib.novels.touchSettings();
    });
  const [shown, setShown] = useState(castPage);
  const [arrange, setArrange] = useState(false);
  const [creating, setCreating] = useState(false);

  const view = useMemo(() => (open ? libraryView(open.cast, { query, filters, sort }) : null), [open, query, filters, sort]);
  if (!open || !view) return null;
  const { cast } = open;
  const tabs = roleTabs(filters, view);
  const menus = filterMenus(cast, view.facets, filters);
  const found = view.found.slice(0, shown);
  const reorderable = canReorder(sort, query);
  const go = (l: Listed) => router.navigate(characterPath(l.entry.id));
  const move = (l: Listed, by: number) => {
    const ids = moveInOrder(view.found, l, by);
    if (ids) open.now((c) => c.reorder(ids));
  };

  const columns = Math.max(2, Math.min(8, Math.floor((width - space.md * 2 + 12) / 172)));
  const cardWidth = (width - space.md * 2 - 12 * (columns - 1)) / columns;

  return (
    <View style={styles.flex}>
      <ScrollView ref={scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.actions}>
          <GoldButton label={libraryWords.newCharacter} icon="account-plus-outline" compact onPress={() => setCreating(true)} />
          <OutlineButton label="Relationship map" icon="graph-outline" compact onPress={() => router.navigate('/organize/ties')} />
          <OutlineButton label="Cast list for the book" icon="script-text-outline" compact onPress={() => setDramatis(true)} />
        </View>
        <View style={styles.searchRow}>
          <View style={styles.search}>
            <Icon name="magnify" size={20} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={(v) => {
                setQuery(v);
                setShown(castPage);
              }}
              placeholder={libraryWords.search}
              placeholderTextColor={colors.muted}
              selectionColor={colors.gold}
              style={styles.searchInput}
              accessibilityLabel={libraryWords.search}
            />
            {query.length > 0 && <IconButton icon="close" label={libraryWords.clearSearch} onPress={() => setQuery('')} color={colors.muted} />}
          </View>
          <IconButton
            icon={filters.active > 0 ? 'filter' : 'tune-variant'}
            label={filtersLabel(filters.active)}
            onPress={() => setArrange(true)}
            color={filters.active > 0 ? colors.gold : colors.text}
            bordered
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          <Chip label={castViewButton(castView).label} icon={viewIcon[castView]} selected={false} onPress={() => setChoosing(true)} />
          <Chip label={castSortLabel[sort]} icon="sort" selected={false} onPress={() => setArrange(true)} />
          {tabs.map((t) => (
            <Chip key={t.label} label={t.label} selected={t.selected} onPress={() => setFilters(t.filters)} />
          ))}
        </ScrollView>
        {!query && filters.active === 0 && !filters.archived && filters.role === '' && <CastStage open={open} onNew={() => setCreating(true)} />}
        <Muted>{view.count}</Muted>

        <CastPagePanels open={open} scrollTo={(y) => scroll.current?.scrollTo({ y, animated: true })}>
        {view.list.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="account-group-outline" size={40} />
            <Text style={styles.emptyTitle}>No characters yet</Text>
            <Muted style={styles.centerText}>Every character you make here is one record every part of the app uses.</Muted>
            <GoldButton label={libraryWords.newCharacter} icon="account-plus-outline" onPress={() => setCreating(true)} />
          </View>
        ) : view.found.length === 0 ? (
          (() => {
            const none = noResults(query, filters);
            return (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>{none.title}</Text>
                <Muted style={styles.centerText}>{none.message}</Muted>
                <OutlineButton
                  label={none.clearLabel}
                  compact
                  onPress={() => {
                    setQuery('');
                    setFilters(none.cleared);
                  }}
                />
              </View>
            );
          })()
        ) : castView !== 'cards' && castView !== 'list' ? (
          <OtherView view={castView} open={open} found={view.found} />
        ) : castView === 'cards' ? (
          <View style={styles.wall}>
            {found.map((l) => (
              <CastCard key={l.entry.id} l={l} width={cardWidth} short={phone} where={cardWhere(l, cast.model.order)} label={cardLabel(l, cast.model.order)} presence={presenceOf(l, cast.model.order).chapters} onPress={() => go(l)} />
            ))}
          </View>
        ) : (
          <View>
            {found.map((l) => {
              const row = listRow(l);
              const tips = moveTooltips(l);
              return (
                <Pressable key={l.entry.id} accessibilityRole="button" onPress={() => go(l)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.elevated }]}>
                  <Face l={l} size={40} />
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {row.title}
                    </Text>
                    <Muted numberOfLines={2}>{row.subtitle}</Muted>
                  </View>
                  {reorderable && (
                    <>
                      <IconButton icon="arrow-up" label={tips.up} onPress={() => move(l, -1)} />
                      <IconButton icon="arrow-down" label={tips.down} onPress={() => move(l, 1)} />
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
        {(castView === 'cards' || castView === 'list') && view.found.length > shown && <OutlineButton label={showMoreLabel(view.found.length, shown)} compact onPress={() => setShown(shown + castPage)} style={styles.more} />}
        </CastPagePanels>
        {view.list.length > 0 && <Muted style={styles.note}>{whereNote}</Muted>}
      </ScrollView>

      <Sheet visible={arrange} onClose={() => setArrange(false)} title="Arrange the cast" footer={<GoldButton label="Done" onPress={() => setArrange(false)} style={styles.flex} />}>
        <Text style={styles.label}>IN WHAT ORDER</Text>
        <View style={styles.chips}>
          {castSorts.map((s) => (
            <Chip key={s} label={castSortLabel[s]} selected={sort === s} onPress={() => setSort(s)} />
          ))}
        </View>
        <Text style={styles.label}>SHOW ONLY</Text>
        {menus.menus.map((m) => (
          <ChooserField
            key={m.label}
            label={m.label}
            value={m.value}
            choices={[{ value: '', label: menus.anyLabel }, ...m.choices.map((c) => ({ value: c, label: c }))]}
            onChoose={(v) => setFilters(m.pick(v))}
          />
        ))}
        {menus.firstBy && (
          <ChooserField
            label={menus.firstBy.label}
            value={menus.firstBy.value}
            choices={[{ value: null as number | null, label: menus.firstBy.anyLabel }, ...menus.firstBy.chapters]}
            onChoose={(v) => setFilters(filters.copyWith({ firstBy: { value: v } }))}
          />
        )}
        {menus.empty && <Muted>{menus.empty}</Muted>}
        {menus.clear && <OutlineButton label={menus.clear.label} compact tone="muted" onPress={() => setFilters(menus.clear!.filters)} style={styles.start} />}
      </Sheet>
      <NewCharacterSheet visible={creating} onClose={() => setCreating(false)} />
      {choosing && <ViewChooser current={castView} onPick={(v) => { setChoosing(false); const next = castViewPicked(castView, v); if (next) chooseView(next); }} />}
      {dramatis && <DramatisSheet open={open} onClose={() => setDramatis(false)} />}
    </View>
  );
}

/** A character's face: their portrait, or their monogram on their own colour. */
export function Face({ l, size, image, name, id }: { l?: Listed; size: number; image?: string; name?: string; id?: string }) {
  const img = image ?? l?.entry.image ?? '';
  const who = name ?? l?.entry.name ?? '';
  const key = id ?? l?.entry.id ?? '';
  if (isUploadedImage(img)) {
    return <Image source={{ uri: img }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: castTone(key), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: fonts.display, fontSize: size * 0.4, color: '#FFFFFF' }}>{monogram(who)}</Text>
    </View>
  );
}

/** THE CAST WALL: a portrait card (their picture, or their monogram on their own colour), name and epithet, roles,
 * and their thread through the book: a tick for every chapter, lit where they are in it. */
function CastCard({ l, width, short, where, label, presence, onPress }: { l: Listed; width: number; short: boolean; where: string | null; label: string; presence: boolean[]; onPress: () => void }) {
  const img = l.entry.image;
  const tone = castTone(l.entry.id);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.card, { width }, pressed && { borderColor: colors.gold }]}>
      <View style={[styles.portrait, short && styles.portraitShort, { backgroundColor: tone }]}>
        {isUploadedImage(img) ? (
          <Image source={{ uri: img ?? undefined }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Text style={styles.monogram}>{monogram(l.entry.name)}</Text>
        )}
        {l.profile.status.length > 0 && (
          <View style={styles.status}>
            <Text style={styles.statusText}>{l.profile.status}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={2}>
          {l.entry.name}
        </Text>
        {l.profile.epithet.length > 0 && (
          <Text style={styles.epithet} numberOfLines={1}>
            {l.profile.epithet}
          </Text>
        )}
        {l.profile.roles.length > 0 && (
          <Text style={styles.roles} numberOfLines={1}>
            {cardRoles(l)}
          </Text>
        )}
        {presence.length > 0 && (
          <View style={styles.thread}>
            {presence.map((on, i) => (
              <View key={i} style={[styles.tick, on && { backgroundColor: colors.gold }]} />
            ))}
          </View>
        )}
        {where && <Text style={styles.where}>{where}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: space.md, gap: space.sm, paddingBottom: space.xxl },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 46,
    paddingLeft: space.md,
    borderRadius: 23,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  tabs: { gap: space.sm, paddingVertical: 2 },
  empty: { alignItems: 'center', gap: space.md, padding: space.xl },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text, textAlign: 'center' },
  centerText: { textAlign: 'center' },
  wall: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { borderRadius: radius.panel, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  portrait: { aspectRatio: 0.85, alignItems: 'center', justifyContent: 'center' },
  portraitShort: { aspectRatio: 1.35 },
  monogram: { fontFamily: fonts.display, fontSize: 40, color: '#FFFFFF' },
  status: { position: 'absolute', left: 8, top: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.chip, backgroundColor: 'rgba(10,11,14,0.7)' },
  statusText: { fontFamily: fonts.ui, fontSize: 11, color: '#FFFFFF', letterSpacing: 0.6 },
  cardBody: { padding: space.sm, gap: 3 },
  cardName: { fontFamily: fonts.display, fontSize: 16, color: colors.text },
  epithet: { fontFamily: fonts.bookItalic, fontSize: 13, color: colors.muted },
  roles: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.2, color: colors.gold },
  thread: { flexDirection: 'row', gap: 2, marginTop: 4 },
  tick: { flex: 1, height: 4, maxWidth: 10, borderRadius: 1, backgroundColor: colors.border },
  where: { fontFamily: fonts.ui, fontSize: 11, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingHorizontal: space.sm, borderRadius: radius.field, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontFamily: fonts.ui, fontSize: 16, color: colors.text },
  more: { alignSelf: 'center', marginTop: space.sm },
  note: { marginTop: space.md, fontSize: 12 },
  label: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold, marginTop: space.sm, marginBottom: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.sm },
  start: { alignSelf: 'flex-start' },
});

/** The icons of the ways to see the cast (Material's names in the Flutter app, Material Community's here). */
const viewIcon: Record<CastView, IconName> = {
  cards: 'view-grid-outline',
  list: 'view-list-outline',
  roll: 'table-large',
  names: 'sort-alphabetical-ascending',
  ties: 'hubspot',
  stakes: 'flag-outline',
  compass: 'compass-outline',
  orbit: 'orbit',
  eyes: 'eye-outline',
  entrances: 'door',
  tableRead: 'drama-masks',
  arcs: 'chart-line',
};

function OtherView({ view, open, found }: { view: CastView; open: OpenCast; found: Listed[] }) {
  const props = { open, found };
  switch (view) {
    case 'roll':
      return <RollCallView {...props} />;
    case 'names':
      return <NameBoardView {...props} />;
    case 'ties':
      return <TiesView {...props} />;
    case 'stakes':
      return <StakesView {...props} />;
    case 'compass':
      return <CompassView {...props} />;
    case 'orbit':
      return <OrbitView {...props} />;
    case 'eyes':
      return <EyesView {...props} />;
    case 'entrances':
      return <EntrancesView {...props} />;
    case 'tableRead':
      return <TableReadView {...props} />;
    case 'arcs':
      return <ArcsView {...props} />;
    default:
      return null;
  }
}

/** **Ways to see your cast**: every view by name and what it shows, in its group, the one in use marked. */
function ViewChooser({ current, onPick }: { current: CastView; onPick: (v: CastView | null) => void }) {
  const sheet = castViewSheet(current);
  return (
    <Sheet visible onClose={() => onPick(null)} title={sheet.title}>
      <Muted>{sheet.caption}</Muted>
      {sheet.groups.map((g) => (
        <View key={g.group} style={chooser.group}>
          <Text style={chooser.heading}>{g.heading}</Text>
          {g.views.map((v) => (
            <Pressable
              key={v.key}
              accessibilityRole="radio"
              accessibilityState={{ checked: v.chosen }}
              accessibilityLabel={`${v.name}. ${v.about}`}
              onPress={() => onPick(v.view)}
              style={({ pressed }) => [chooser.tile, v.chosen && chooser.chosen, pressed && { backgroundColor: colors.elevated }]}
            >
              <Icon name={viewIcon[v.view]} size={24} color={v.chosen ? colors.gold : colors.text} />
              <View style={styles.flex}>
                <Text style={[chooser.name, v.chosen && { color: colors.gold }]}>{v.name}</Text>
                <Muted>{v.about}</Muted>
              </View>
              {v.chosen && <Icon name="check" size={20} />}
            </Pressable>
          ))}
        </View>
      ))}
    </Sheet>
  );
}

const chooser = StyleSheet.create({
  group: { gap: 6, marginTop: space.md },
  heading: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.muted },
  tile: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  chosen: { borderColor: colors.gold, backgroundColor: 'rgba(243, 182, 58, 0.08)' },
  name: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
});
