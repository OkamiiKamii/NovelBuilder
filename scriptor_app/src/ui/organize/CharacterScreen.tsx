// THE CHARACTER PROFILE, "the Vault" (FEATURES.md #166–#168, #171, #174, #187, #188): who they are (portrait, name,
// epithet, roles, status, summary, aliases, tags, read or edited in place), where they are in the book, previous and
// next, the tabs, the More menu (layouts, templates, archive) and delete with a restore point and Undo. A port of
// flutter_app/lib/features/characters/character_page.dart; the logic is src/domain/characters/screens/profile.ts.

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
  profilePageLabel,
  profilePageTabs,
  hasSystems,
  portraitTools,
  focalAt,
  focalWords,
  roleChoices,
  saveTemplatePrompt,
  shownProfilePage,
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
import { Chip, Field, GoldButton, Icon, IconButton, Muted, OutlineButton, Panel } from '../kit';
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

export function CharacterScreen() {
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const open = useCast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const lib = useLibrary();
  const { width } = useWindowDimensions();
  const phone = sizeClassOf(width) === 'compact';
  const [tab, setTab] = useState<ProfilePage | null>(null);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [layouts, setLayouts] = useState(false);
  const [template, setTemplate] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [finding, setFinding] = useState(false);
  const [removePortrait, setRemovePortrait] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [aid, setAid] = useState<'interview' | 'thisOrThat' | 'face' | 'journal' | 'writeIn' | 'card' | null>(null);

  const listed = open && params.id ? open.cast.listed(params.id) : null;
  useEffect(() => setTab(null), [params.id]);
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
  const shown = tab ?? shownProfilePage(params.tab, { systems });
  const tabs = profilePageTabs({ systems });
  const idv = identityView(entry, profile);
  const tools = portraitTools(entry);
  const known = acquaintance(entry, profile, cast.templates);
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
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled">
        {profile.archived && (
          <View style={styles.banner}>
            <Icon name="archive-outline" size={20} color={colors.sky} />
            <Text style={[styles.text, styles.flex]}>{vaultWords.archivedBanner}</Text>
            <OutlineButton label={vaultWords.restore} compact onPress={() => open.now((c) => c.setArchived(entry.id, false))} />
          </View>
        )}
        <Panel style={[styles.header, !phone && styles.headerWide]}>
          <View style={styles.portraitCol}>
            <View style={[styles.portrait, { backgroundColor: castTone(entry.id) }]} accessibilityLabel={tools.label}>
              {tools.uploaded ? (
                <FocalImage uri={entry.image ?? ''} focal={profile.focal} style={StyleSheet.absoluteFill} />
              ) : (
                <Cameo entry={entry} profile={profile} width={150} height={180} bare />
              )}
            </View>
            <View style={styles.row}>
              <IconButton icon="image-plus" label={tools.upload} onPress={() => void upload()} />
              {tools.adjust && <IconButton icon="crop" label={tools.adjust} onPress={() => setCropping(true)} />}
              {tools.remove && <IconButton icon="image-remove" label={tools.remove} onPress={() => setRemovePortrait(true)} />}
            </View>
            {tools.draw && <OutlineButton label={tools.draw} icon="draw" compact tone="muted" onPress={() => setAid('face')} />}
            {tools.webNote && <Muted style={styles.small}>{tools.webNote}</Muted>}
          </View>
          <View style={styles.identity}>
            {editing ? (
              <IdentityForm open={open} entryId={entry.id} onDone={() => setEditing(false)} />
            ) : (
              <>
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
                <Text style={[styles.summary, idv.noSummary && { color: colors.muted }]}>{idv.summary}</Text>
                {idv.aliases && <Muted>{idv.aliases}</Muted>}
                {idv.tags && <Muted>{idv.tags}</Muted>}
                <OutlineButton label={idv.edit} icon="pencil-outline" compact onPress={() => setEditing(true)} style={styles.start} />
              </>
            )}
            <View style={styles.aids}>
              <OutlineButton label={vaultWords.writeIn(entry.name)} icon="feather" compact onPress={() => setAid('writeIn')} />
              <OutlineButton label={`${known.known === known.of ? 'Known well' : `Known ${known.known} of ${known.of}`} · Interview`} icon="comment-question-outline" compact tone="muted" onPress={() => setAid('interview')} />
              <OutlineButton label="This or that" icon="swap-horizontal-variant" compact tone="muted" onPress={() => setAid('thisOrThat')} />
              <OutlineButton label="In their hand" icon="notebook-edit-outline" compact tone="muted" onPress={() => setAid('journal')} />
              <OutlineButton label="Share their card" icon="card-account-details-outline" compact tone="muted" onPress={() => setAid('card')} />
            </View>
            <View style={styles.stats}>
              {headerStats(listed, mentions).map((s) => (
                <View key={s.label} style={styles.stat} accessible accessibilityLabel={s.said}>
                  <Text style={styles.statValue}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </Panel>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {tabs.map((t) => (
            <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: t === shown }} onPress={() => setTab(t)} style={[styles.tab, t === shown && styles.tabOn]}>
              <Text style={[styles.tabText, t === shown && { color: colors.onGold }]}>{profilePageLabel[t]}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <ProfileTab page={shown} open={open} listed={listed} onTab={setTab} />
      </ScrollView>

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
  page: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg },
  centerText: { textAlign: 'center' },
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs },
  barTitle: { flex: 1, fontFamily: fonts.ui, fontSize: 13, letterSpacing: 1.6, color: colors.gold },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text, textAlign: 'center' },
  body: { padding: space.md, gap: space.md, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.panel, borderWidth: 1, borderColor: colors.sky, backgroundColor: colors.surface },
  header: { gap: space.md },
  headerWide: { flexDirection: 'row' },
  portraitCol: { alignItems: 'center', gap: 4 },
  portrait: { width: 150, height: 180, borderRadius: radius.panel, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.gold },
  monogram: { fontFamily: fonts.display, fontSize: 52, color: '#FFFFFF' },
  identity: { flex: 1, gap: space.xs },
  name: { fontFamily: fonts.display, fontSize: 28, color: colors.text },
  epithet: { fontFamily: fonts.bookItalic, fontSize: 16, color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  tag: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.chip, borderWidth: 1, borderColor: colors.gold },
  statusTag: { borderColor: colors.sky },
  tagText: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1, color: colors.gold },
  summary: { fontFamily: fonts.book, fontSize: 15, lineHeight: 23, color: colors.text, marginTop: space.xs },
  aids: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.sm },
  stat: { minWidth: 90, padding: space.sm, borderRadius: radius.field, backgroundColor: colors.elevated },
  statValue: { fontFamily: fonts.numbers, fontSize: 15, color: colors.gold },
  statLabel: { fontFamily: fonts.ui, fontSize: 11, color: colors.muted },
  tabs: { gap: space.sm },
  tab: { minHeight: 40, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.chip, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tabOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  tabText: { fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  text: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 22, color: colors.text },
  small: { fontSize: 11, maxWidth: 160, textAlign: 'center' },
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
