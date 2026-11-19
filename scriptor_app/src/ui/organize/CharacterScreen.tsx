// THE CHARACTER PROFILE, "the Vault" (FEATURES.md #166–#168, #171, #174, #187, #188): who they are (portrait, name,
// epithet, roles, status, summary, aliases, tags, read or edited in place), where they are in the book, previous and
// next, the tabs, the More menu (layouts, templates, archive) and delete with a restore point and Undo. A port of
// flutter_app/lib/features/characters/character_page.dart; the logic is src/domain/characters/screens/profile.ts.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pickCoverPicture } from '../../data/files';
import { countMentions } from '../../domain/characters/cast';
import { characterPath } from '../../domain/characters/screens/create';
import { castTone } from '../../domain/characters/screens/library';
import {
  commaList,
  deleteDialog,
  deletedWords,
  headerNames,
  headerStats,
  identityFormWords,
  identityView,
  layoutChoices,
  nameCanBeSaved,
  notFound,
  ownStatusValue,
  type ProfileMenuItem,
  profileMenu,
  type ProfilePage,
  type ProfileView,
  profileViewLabel,
  profileViewTabs,
  hasSystems,
  portraitTools,
  focalAt,
  focalWords,
  roleChoices,
  saveTemplatePrompt,
  shownProfileView,
  statusChoices,
  toggledRoles,
  vaultMatches,
  vaultOrder,
  vaultStep,
  vaultWords,
  withOwnRole,
} from '../../domain/characters/screens/profile';
import { docBlocks } from '../../domain/prose';
import { ActionSheet, ConfirmDelete, PromptSheet, Sheet } from '../dialogs';
import { Chip, Field, GoldButton, Icon, type IconName, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, radius, sizeClassOf, space } from '../theme';
import { useToast } from '../toast';
import { ProfileTab } from './ProfileTabs';
import { SavedText } from './parts';
import { Cameo } from './Cameo';
import { FocalImage, type FocalPoint, pictureSize } from './FocalImage';
import { FaceSketchSheet, InterviewSheet, ThisOrThatSheet } from './AidsSheets';
import { CharacterCardSheet, JournalSheet, WriteThemInSheet } from './AidsPages';
import { cardLine, cardLineInput } from '../../domain/characters/aids/characterCard';
import { spokenJob } from '../../domain/characters/voice';
import { acquaintance } from '../../domain/characters/aids/interview';
import { type OpenCast, useCast } from './useCast';

const viewIcons: Record<ProfileView, IconName> = {
  status: 'pulse',
  overview: 'information-outline',
  relationships: 'account-multiple-outline',
  details: 'card-text-outline',
  story: 'timeline-text-outline',
  notes: 'note-text-outline',
};

export function CharacterScreen() {
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const open = useCast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const lib = useLibrary();
  const { width } = useWindowDimensions();
  const phone = sizeClassOf(width) === 'compact';
  const [tab, setTab] = useState<ProfileView | null>(null);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [layouts, setLayouts] = useState(false);
  const [template, setTemplate] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [finding, setFinding] = useState(false);
  const [portraitMenu, setPortraitMenu] = useState(false);
  const [removePortrait, setRemovePortrait] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [aid, setAid] = useState<'interview' | 'thisOrThat' | 'face' | 'journal' | 'writeIn' | 'card' | null>(null);

  const listed = open && params.id ? open.cast.listed(params.id) : null;
  // The page a deep link or "Go to" asked for; the screen scrolls to it once, when its tab has laid out.
  const wanted = useRef<string | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const tabTop = useRef(0);
  const [landed, setLanded] = useState<{ page: ProfilePage; y: number } | null>(null);
  useEffect(() => {
    setTab(null);
    wanted.current = params.tab ?? null;
  }, [params.id, params.tab]);
  useEffect(() => {
    if (!landed || wanted.current !== landed.page) return;
    wanted.current = null;
    scroll.current?.scrollTo({ y: tabTop.current + landed.y, animated: false });
  }, [landed]);
  // How often their names occur in the text: worked out from the saved chapters.
  const mentions = useMemo(() => {
    if (!open || !listed) return null;
    const texts = lib.novels.rowsIn(open.novelId, 'chapterContents').flatMap((c) => docBlocks(c['doc']).map((b) => b.text));
    return countMentions(texts, headerNames(listed).filter((n) => n.trim().length > 0));
  }, [open, listed, lib]);

  if (!open || !listed) {
    const nf = notFound(open?.cast ?? null);
    return (
      <View style={[styles.page, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.title}>{nf.title}</Text>
        <Muted style={styles.centerText}>{nf.message}</Muted>
        <OutlineButton label={nf.action} icon="arrow-left" onPress={() => router.navigate(nf.toLibrary ? '/' : '/organize')} />
      </View>
    );
  }
  const { cast } = open;
  const entry = listed.entry;
  const profile = listed.profile;
  const systems = hasSystems(cast);
  const shown = tab ?? shownProfileView(params.tab, { systems });
  const tabs = profileViewTabs({ systems });
  const idv = identityView(entry, profile);
  const tools = portraitTools(entry);
  const known = acquaintance(entry, profile, cast.templates);
  const onTab = (view: ProfileView, page: ProfilePage) => {
    wanted.current = page;
    setTab(view);
  };
  const go = (by: number) => {
    const next = vaultStep(cast, entry.id, by);
    if (next) router.replace(characterPath(next, { tab: shown }));
  };
  const remove = () => {
    setDeleting(false);
    try {
      const point = open.service.delete(open.novelId, entry.id, { name: entry.name });
      router.navigate('/organize');
      toast(deletedWords.deleted(entry.name), {
        action: { label: deletedWords.undo, run: () => open.service.undoDelete(point) },
      });
    } catch (e) {
      toast(deletedWords.failed(e instanceof Error ? e.message : e), { error: true });
    }
  };
  const menuPick = (item: ProfileMenuItem) => {
    if (item === 'layout') setLayouts(true);
    else if (item === 'template') setTemplate(true);
    else if (item === 'archive') open.now((c) => c.setArchived(entry.id, !profile.archived));
    else setDeleting(true);
  };
  const upload = async () => {
    try {
      const picture = await pickCoverPicture();
      if (picture) open.now((c) => c.identity(entry.id, { image: { value: picture } }));
    } catch (e) {
      toast(`The picture could not be read (${e instanceof Error ? e.message : String(e)}).`, { error: true });
    }
  };

  const pw = phone ? 112 : 150;
  const ph = phone ? 136 : 180;
  const quick = (
    <Panel style={styles.quick}>
      <Text style={styles.label}>QUICK ACTIONS</Text>
      <GoldButton label={vaultWords.writeIn(entry.name)} icon="feather" compact onPress={() => setAid('writeIn')} />
      <OutlineButton label={`${known.known === known.of ? 'Known well' : `Known ${known.known} of ${known.of}`} · Interview`} icon="comment-question-outline" compact tone="sky" onPress={() => setAid('interview')} />
      <OutlineButton label="This or that" icon="swap-horizontal-variant" compact tone="sky" onPress={() => setAid('thisOrThat')} />
      <OutlineButton label="In their hand" icon="notebook-edit-outline" compact tone="sky" onPress={() => setAid('journal')} />
      <OutlineButton label="Share their card" icon="card-account-details-outline" compact tone="sky" onPress={() => setAid('card')} />
    </Panel>
  );

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <IconButton icon="arrow-left" label={vaultWords.allCharacters} onPress={() => router.navigate('/organize')} />
        <Text style={styles.barTitle} numberOfLines={1}>
          {vaultWords.title}
        </Text>
        <IconButton icon="chevron-up" label={vaultWords.previous} onPress={() => go(-1)} />
        <IconButton icon="chevron-down" label={vaultWords.next} onPress={() => go(1)} />
        <IconButton icon="account-search-outline" label={vaultWords.find} onPress={() => setFinding(true)} />
        <IconButton icon="dots-vertical" label={vaultWords.moreOptions(entry.name)} onPress={() => setMenu(true)} />
      </View>
      <ScrollView ref={scroll} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled">
        {profile.archived && (
          <View style={styles.banner}>
            <Icon name="archive-outline" size={20} color={colors.sky} />
            <Text style={[styles.text, styles.flex]}>{vaultWords.archivedBanner}</Text>
            <OutlineButton label={vaultWords.restore} compact onPress={() => open.now((c) => c.setArchived(entry.id, false))} />
          </View>
        )}
        <Panel style={styles.header}>
          <View style={styles.top}>
            <Pressable accessibilityRole="button" accessibilityLabel={tools.label} onPress={() => setPortraitMenu(true)} style={[styles.portrait, { width: pw, height: ph, backgroundColor: castTone(entry.id) }]}>
              {tools.uploaded ? (
                <FocalImage uri={entry.image ?? ''} focal={profile.focal} style={StyleSheet.absoluteFill} />
              ) : (
                <Cameo entry={entry} profile={profile} width={pw} height={ph} />
              )}
            </Pressable>
            <View style={styles.identity}>
              <Text style={styles.name} accessibilityRole="header">
                {entry.name}
              </Text>
              {profile.epithet.length > 0 && <Text style={styles.epithet}>{profile.epithet}</Text>}
              <View style={styles.row}>
                {idv.roles.map((r) => (
                  <View key={r} style={styles.tag}>
                    <Text style={styles.tagText}>{r.toUpperCase()}</Text>
                  </View>
                ))}
                {idv.status && (
                  <View style={[styles.tag, styles.statusTag]}>
                    <Text style={[styles.tagText, { color: colors.sky }]}>{idv.status}</Text>
                  </View>
                )}
                {idv.archived && (
                  <View style={styles.tag}>
                    <Text style={[styles.tagText, { color: colors.muted }]}>{idv.archived}</Text>
                  </View>
                )}
              </View>
              {!editing && <OutlineButton label={idv.edit} icon="pencil-outline" compact onPress={() => setEditing(true)} style={styles.start} />}
            </View>
          </View>
          {tools.webNote && <Muted style={styles.small}>{tools.webNote}</Muted>}
          {editing ? (
            <IdentityForm open={open} entryId={entry.id} onDone={() => setEditing(false)} />
          ) : (
            <>
              <Text style={[styles.summary, idv.noSummary && { color: colors.muted }]}>{idv.summary}</Text>
              {idv.aliases && <Muted>{idv.aliases}</Muted>}
              {idv.tags && <Muted>{idv.tags}</Muted>}
            </>
          )}
          <View style={styles.stats}>
            {headerStats(listed, mentions).map((s, i) => (
              <View key={s.label} style={[styles.stat, i > 0 && styles.statDivider]} accessible accessibilityLabel={s.said}>
                <Text style={styles.statLabel}>{s.label.toUpperCase()}</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{s.value}</Text>
              </View>
            ))}
          </View>
        </Panel>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {tabs.map((t) => {
            const on = t === shown;
            return (
              <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => {
                  wanted.current = null;
                  setTab(t);
                }} style={[styles.tab, on && styles.tabOn]}>
                <Icon name={viewIcons[t]} size={18} color={on ? colors.gold : colors.muted} />
                <Text style={[styles.tabText, on && { color: colors.gold }]}>{profileViewLabel[t]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {shown === 'overview' || shown === 'status' ? (
          <View style={[styles.overview, !phone && styles.overviewWide]}>
            {phone && quick}
            <View style={styles.flex}>
              <ProfileTab view={shown} open={open} listed={listed} onTab={onTab} />
            </View>
            {!phone && <View style={styles.quickCol}>{quick}</View>}
          </View>
        ) : (
          <View onLayout={(e) => (tabTop.current = e.nativeEvent.layout.y)}>
            <ProfileTab view={shown} open={open} listed={listed} onTab={onTab} onPageY={(page, y) => setLanded({ page, y })} />
          </View>
        )}
      </ScrollView>

      <ActionSheet
        visible={portraitMenu}
        title={tools.label}
        onClose={() => setPortraitMenu(false)}
        actions={[
          { label: tools.upload, icon: 'image-plus', onPress: () => void upload() },
          { label: tools.adjust ?? '', icon: 'crop', hidden: !tools.adjust, onPress: () => setCropping(true) },
          { label: tools.remove ?? '', icon: 'image-remove', hidden: !tools.remove, onPress: () => setRemovePortrait(true) },
          { label: tools.draw ?? '', icon: 'draw', hidden: !tools.draw, onPress: () => setAid('face') },
        ]}
      />
      <ActionSheet
        visible={menu}
        title={entry.name}
        onClose={() => setMenu(false)}
        actions={profileMenu(profile).map((m) => ({
          label: m.label,
          icon: m.item === 'layout' ? 'view-dashboard-outline' : m.item === 'template' ? 'content-save-outline' : m.item === 'archive' ? 'archive-outline' : 'delete-outline',
          tone: m.item === 'delete' ? 'danger' : undefined,
          onPress: () => menuPick(m.item),
        }))}
      />
      {(() => {
        const lc = layoutChoices(cast);
        return (
          <Sheet visible={layouts} onClose={() => setLayouts(false)} title={lc.title}>
            <Muted>{lc.message}</Muted>
            {lc.layouts.map((l) => (
              <Pressable
                key={l.id}
                accessibilityRole="button"
                onPress={() => {
                  setLayouts(false);
                  open.now((c) => c.applyTemplate(entry.id, l.id));
                }}
                style={({ pressed }) => [styles.choice, pressed && { backgroundColor: colors.elevated }]}
              >
                <Text style={styles.text}>{l.name}</Text>
                <Muted>{l.description}</Muted>
              </Pressable>
            ))}
          </Sheet>
        );
      })()}
      {(() => {
        const tp = saveTemplatePrompt(entry);
        return (
          <PromptSheet
            visible={template}
            title={tp.title}
            label={tp.label}
            initial={tp.initial}
            confirmLabel={tp.confirm}
            onSubmit={(name) => {
              setTemplate(false);
              const saved = open.now((c) => c.saveTemplate(entry.id, name));
              if (saved) toast(tp.saved(saved.name));
            }}
            onClose={() => setTemplate(false)}
          />
        );
      })()}
      {deleting && <DeleteSheet open={open} entryId={entry.id} onDelete={remove} onArchive={() => {
        setDeleting(false);
        open.now((c) => c.setArchived(entry.id, true));
      }} onClose={() => setDeleting(false)} />}
      {tools.removeConfirm && (
        <ConfirmDelete
          visible={removePortrait}
          title={tools.removeConfirm.title}
          message={tools.removeConfirm.message}
          confirmLabel={tools.removeConfirm.confirm}
          onConfirm={() => {
            setRemovePortrait(false);
            open.now((c) => c.identity(entry.id, { image: { value: null } }));
          }}
          onClose={() => setRemovePortrait(false)}
        />
      )}
      {cropping && tools.uploaded && (
        <FocalSheet
          uri={entry.image ?? ''}
          name={entry.name}
          focal={profile.focal}
          onClose={() => setCropping(false)}
          onDone={(focal) => {
            setCropping(false);
            open.now((c) => c.identity(entry.id, { focal }));
          }}
        />
      )}
      {aid === 'interview' && <InterviewSheet open={open} entry={entry} profile={profile} onClose={() => setAid(null)} />}
      {aid === 'thisOrThat' && <ThisOrThatSheet open={open} entry={entry} onClose={() => setAid(null)} />}
      {aid === 'face' && <FaceSketchSheet open={open} entry={entry} profile={profile} onClose={() => setAid(null)} />}
      {aid === 'journal' && <JournalSheet open={open} entry={entry} onClose={() => setAid(null)} />}
      {aid === 'writeIn' && <WriteThemInSheet open={open} entry={entry} onClose={() => setAid(null)} />}
      {aid === 'card' && <CharacterCardSheet open={open} entry={entry} profile={profile} line={cardLineFor(open, entry.id)} onClose={() => setAid(null)} />}
      <FindSheet visible={finding} open={open} keep={entry.id} onPick={(id) => {
        setFinding(false);
        router.replace(characterPath(id));
      }} onClose={() => setFinding(false)} />
    </View>
  );
}

/** "Edit profile": the identity as fields, each saved as typed; roles and status at once. */
function IdentityForm({ open, entryId, onDone }: { open: OpenCast; entryId: string; onDone: () => void }) {
  const listed = open.cast.listed(entryId);
  const [ownRole, setOwnRole] = useState('');
  const [blank, setBlank] = useState(false);
  if (!listed) return null;
  const { entry, profile } = listed;
  const later = (what: string, changes: import('../../domain/characters/characterChanges').IdentityChanges) =>
    open.later(`identity:${entryId}:${what}`, (c) => c.identity(entryId, changes));
  return (
    <View>
      <SavedText
        label={identityFormWords.name}
        value={entry.name}
        onSave={(v) => {
          setBlank(!nameCanBeSaved(v));
          if (nameCanBeSaved(v)) later('name', { name: v });
        }}
      />
      {blank && <Text style={styles.error}>{identityFormWords.blankName}</Text>}
      <SavedText label={identityFormWords.epithet} placeholder={identityFormWords.epithetHint} value={profile.epithet} onSave={(v) => later('epithet', { epithet: v })} />
      <Text style={styles.label}>{identityFormWords.roles.toUpperCase()}</Text>
      <View style={styles.row}>
        {roleChoices(profile).map((r) => (
          <Chip key={r.role} label={r.role} selected={r.selected} onPress={() => open.now((c) => c.identity(entryId, { roles: toggledRoles(profile, r.role, !r.selected) }))} />
        ))}
      </View>
      <View style={styles.ownRow}>
        <TextInput
          value={ownRole}
          onChangeText={setOwnRole}
          placeholder={identityFormWords.ownRole}
          placeholderTextColor={colors.muted}
          style={styles.ownInput}
          onSubmitEditing={() => {
            const roles = withOwnRole(profile, ownRole);
            if (roles) open.now((c) => c.identity(entryId, { roles }));
            setOwnRole('');
          }}
          returnKeyType="done"
          accessibilityLabel={identityFormWords.ownRole}
        />
      </View>
      <SavedText label={identityFormWords.summary} value={entry.summary} multiline minLines={3} onSave={(v) => later('summary', { summary: v })} />
      <SavedText label={identityFormWords.aliases} value={profile.aliases.join(', ')} onSave={(v) => later('aliases', { aliases: commaList(v) })} />
      <Text style={styles.label}>{identityFormWords.status.toUpperCase()}</Text>
      <View style={styles.row}>
        {statusChoices(profile).map((s) => (
          <Chip key={s.status} label={s.status} selected={s.selected} onPress={() => open.now((c) => c.identity(entryId, { status: s.selected ? '' : s.status }))} />
        ))}
      </View>
      <SavedText label={identityFormWords.ownStatus} placeholder={identityFormWords.ownStatusHint} value={ownStatusValue(profile)} onSave={(v) => later('status', { status: v })} />
      <SavedText label={identityFormWords.tags} value={entry.tags.join(', ')} onSave={(v) => later('tags', { tags: commaList(v) })} />
      <GoldButton label={identityFormWords.done} onPress={onDone} />
    </View>
  );
}

function DeleteSheet({ open, entryId, onDelete, onArchive, onClose }: { open: OpenCast; entryId: string; onDelete: () => void; onArchive: () => void; onClose: () => void }) {
  const listed = open.cast.listed(entryId);
  const refs = useMemo(() => open.service.references(open.novelId, entryId), [open, entryId]);
  if (!listed) return null;
  const d = deleteDialog(listed.entry, listed.profile, refs);
  return (
    <Sheet
      visible
      onClose={onClose}
      title={d.title}
      footer={
        <>
          <OutlineButton label={d.cancel} onPress={onClose} tone="muted" style={styles.flex} />
          {d.archiveInstead && <OutlineButton label={d.archiveInstead} onPress={onArchive} style={styles.flex} />}
          <OutlineButton label={d.delete} icon="delete-outline" tone="danger" onPress={onDelete} style={styles.flex} />
        </>
      }
    >
      {d.lines.map((l, i) => (
        <Text key={i} style={styles.text}>
          {l}
        </Text>
      ))}
    </Sheet>
  );
}

/** Find a character: the cast's list with its search ready. */
function FindSheet({ visible, open, keep, onPick, onClose }: { visible: boolean; open: OpenCast; keep: string; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const people = vaultOrder(open.cast, { keep }).filter((l) => vaultMatches(l, q));
  return (
    <Sheet visible={visible} onClose={onClose} title={vaultWords.find}>
      <Field label="Search" value={q} onChangeText={setQ} autoFocus />
      {people.map((l) => (
        <Pressable key={l.entry.id} accessibilityRole="button" onPress={() => onPick(l.entry.id)} style={({ pressed }) => [styles.choice, pressed && { backgroundColor: colors.elevated }, l.entry.id === keep && { backgroundColor: '#3A2A08' }]}>
          <Text style={styles.text}>{l.entry.name}</Text>
          {l.profile.epithet.length > 0 && <Muted>{l.profile.epithet}</Muted>}
        </Pressable>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  cropFooter: { flex: 1, flexDirection: 'row', gap: space.sm },
  cropArea: { marginTop: space.sm, borderRadius: radius.field, overflow: 'hidden' },
  cropMark: { position: 'absolute', width: 28, height: 28 },
  cropSizes: { flexDirection: 'row', gap: space.md, alignItems: 'flex-end', marginTop: space.md },
  page: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg },
  centerText: { textAlign: 'center' },
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs },
  barTitle: { flex: 1, fontFamily: fonts.ui, fontSize: 13, letterSpacing: 1.6, color: colors.gold },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text, textAlign: 'center' },
  body: { padding: space.md, gap: space.md, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.panel, borderWidth: 1, borderColor: colors.sky, backgroundColor: colors.surface },
  header: { gap: space.md },
  top: { flexDirection: 'row', gap: space.md },
  portrait: { borderRadius: radius.panel, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.gold },
  identity: { flex: 1, gap: space.xs },
  small: { fontSize: 11 },
  stats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm },
  stat: { flex: 1, paddingHorizontal: space.sm },
  statDivider: { borderLeftWidth: 1, borderLeftColor: colors.border },
  statValue: { fontFamily: fonts.ui, fontSize: 18, fontWeight: '600', color: colors.text, marginTop: 2 },
  statLabel: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.2, color: colors.gold },
  tabs: { gap: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.gold },
  tabText: { fontFamily: fonts.ui, fontSize: 14, color: colors.muted },
  overview: { gap: space.md },
  overviewWide: { flexDirection: 'row', alignItems: 'flex-start' },
  quick: { gap: space.sm },
  quickCol: { width: 280 },
  monogram: { fontFamily: fonts.display, fontSize: 52, color: '#FFFFFF' },
  name: { fontFamily: fonts.display, fontSize: 28, color: colors.text },
  epithet: { fontFamily: fonts.bookItalic, fontSize: 16, color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  tag: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.chip, borderWidth: 1, borderColor: colors.gold },
  statusTag: { borderColor: colors.sky },
  tagText: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1, color: colors.gold },
  summary: { fontFamily: fonts.book, fontSize: 15, lineHeight: 23, color: colors.text, marginTop: space.xs },
  text: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  start: { alignSelf: 'flex-start', marginTop: space.sm },
  label: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold, marginBottom: space.xs },
  ownRow: { marginVertical: space.sm },
  ownInput: { minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.field, backgroundColor: colors.elevated, color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  error: { fontFamily: fonts.ui, fontSize: 13, color: colors.danger, marginTop: -space.sm, marginBottom: space.sm },
  choice: { minHeight: 52, justifyContent: 'center', paddingHorizontal: space.sm, borderRadius: radius.field, borderBottomWidth: 1, borderBottomColor: colors.border },
});

/** The card's line: the first good line they say in the book, read when the card is opened. */
function cardLineFor(open: OpenCast, entryId: string): string | null {
  const input = cardLineInput(open.cast, entryId);
  if (!input) return null;
  return cardLine(spokenJob(open.service.storedChapters(open.novelId), input.chapters, input.names)());
}

/** Choosing the point of the portrait to keep in view when it is cropped; the whole picture is kept (character_page.dart's
 * _FocalDialog): the picture at full width, a tap choosing the point, a mark on it, and the portrait at three sizes. */
function FocalSheet({ uri, name, focal, onClose, onDone }: { uri: string; name: string; focal: FocalPoint; onClose: () => void; onDone: (f: FocalPoint) => void }) {
  const [point, setPoint] = useState<FocalPoint>(focal);
  const [width, setWidth] = useState(0);
  const natural = pictureSize(uri);
  const height = width > 0 && natural !== null ? (width * natural.height) / natural.width : width;
  return (
    <Sheet
      visible
      onClose={onClose}
      title={focalWords.title}
      footer={
        <View style={styles.cropFooter}>
          <OutlineButton label={focalWords.cancel} tone="muted" onPress={onClose} style={styles.flex} />
          <GoldButton label={focalWords.done} onPress={() => onDone(point)} style={styles.flex} />
        </View>
      }
    >
      <Muted>{focalWords.message}</Muted>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.cropArea}>
        {width > 0 && (
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel={focalWords.label}
            onPress={(e) => setPoint(focalAt(e.nativeEvent.locationX, e.nativeEvent.locationY, width, height))}
            style={{ width, height }}
          >
            <Image source={{ uri }} style={{ width, height }} resizeMode="stretch" accessibilityIgnoresInvertColors />
            <View pointerEvents="none" style={[styles.cropMark, { left: (point.x / 100) * width - 14, top: (point.y / 100) * height - 14 }]}>
              <Icon name="crosshairs-gps" size={28} color="#FFFFFF" />
            </View>
          </Pressable>
        )}
      </View>
      <View style={styles.cropSizes}>
        {[96, 64, 40].map((size) => (
          <FocalImage key={size} uri={uri} focal={point} style={{ width: size, height: size, borderRadius: size * 0.18 }} />
        ))}
      </View>
      <Muted style={styles.small}>{name}</Muted>
    </Sheet>
  );
}
