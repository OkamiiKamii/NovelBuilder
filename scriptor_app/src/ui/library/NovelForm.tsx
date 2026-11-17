// New novel and Edit details (FEATURES.md #54–57). A new novel starts as a title page: a live cover, the title, the
// author (remembered from the last novel) and its colour; "Begin chapter one" makes the novel and its first chapter.
// "More details" opens the full form: subtitle, status, genres, tags, target, deadline, synopsis, cover picture and,
// for a new novel, another novel's setup to start from.

import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { pickCoverPicture } from '../../data/files';
import type { JsonMap } from '../../domain/json';
import { genreSuggestions, Novel, novelAccents, novelStatuses, splitList } from '../../domain/novel';
import { Sheet } from '../dialogs';
import { Chip, Field, GoldButton, Icon, OutlineButton } from '../kit';
import { colors, fonts, radius, sizeClassOf, space } from '../theme';
import { useToast } from '../toast';
import { NovelCover } from './NovelCover';

export type NovelFormResult = { details: JsonMap; setupFrom: string | null; begin: boolean };

export function NovelForm({
  visible,
  editing,
  defaultAuthor,
  setupFrom: initialSetup = null,
  otherNovels,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  /** The novel being edited; null for a new novel. */
  editing: Novel | null;
  defaultAuthor: string;
  setupFrom?: string | null;
  otherNovels: Novel[];
  onSubmit: (result: NovelFormResult) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const { width } = useWindowDimensions();
  const phone = sizeClassOf(width) === 'compact';
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [author, setAuthor] = useState('');
  const [status, setStatus] = useState<string>('planning');
  const [genre, setGenre] = useState('');
  const [otherGenres, setOtherGenres] = useState('');
  const [tags, setTags] = useState('');
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [cover, setCover] = useState<string | null>(null);
  const [accent, setAccent] = useState<string>(novelAccents[0].hex);
  const [setupFrom, setSetupFrom] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const n = editing;
    setTitle(n?.title ?? '');
    setSubtitle(n?.subtitle ?? '');
    setAuthor(n ? n.author : defaultAuthor);
    setStatus(n?.status ?? 'planning');
    setGenre(n?.primaryGenre ?? '');
    setOtherGenres(n?.secondaryGenres.join(', ') ?? '');
    setTags(n?.tags.join(', ') ?? '');
    setTarget(n?.targetWordCount ? String(n.targetWordCount) : '');
    setDeadline(n?.deadline ?? '');
    setSynopsis(n?.synopsis ?? '');
    setCover(n?.cover ?? null);
    setAccent(n?.accent ?? novelAccents[0].hex);
    setSetupFrom(initialSetup);
    setMore(n !== null || initialSetup !== null);
  }, [visible, editing, defaultAuthor, initialSetup]);

  const details: JsonMap = useMemo(
    () => ({
      ...(editing?.raw ?? {}),
      title,
      subtitle,
      author,
      status,
      primaryGenre: genre,
      secondaryGenres: splitList(otherGenres),
      tags: splitList(tags),
      targetWordCount: target,
      deadline,
      synopsis,
      cover,
      accent,
    }),
    [editing, title, subtitle, author, status, genre, otherGenres, tags, target, deadline, synopsis, cover, accent],
  );
  const preview = useMemo(() => new Novel(details), [details]);
  const deadlineProblem = deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline) ? 'Write it as yyyy-mm-dd, e.g. 2027-03-01.' : null;
  const targetProblem = target && !/^\d+$/.test(target) ? 'Digits only.' : null;
  const canSave = title.trim().length > 0 && title.trim().length <= 200 && !deadlineProblem && !targetProblem;

  const chooseCover = async () => {
    try {
      const picked = await pickCoverPicture();
      if (picked) setCover(picked);
    } catch (e) {
      toast(`The picture could not be used (${e instanceof Error ? e.message : String(e)}).`, { error: true });
    }
  };

  const submit = (begin: boolean) => {
    if (!canSave) return;
    onSubmit({ details, setupFrom, begin });
  };

  const footer = editing ? (
    <>
      <OutlineButton label="Cancel" onPress={onClose} tone="muted" style={styles.flex} />
      <GoldButton label="Save" icon="check" onPress={() => submit(false)} disabled={!canSave} style={styles.flex} />
    </>
  ) : (
    <>
      <OutlineButton label="Create only" onPress={() => submit(false)} disabled={!canSave} style={styles.flex} />
      <GoldButton label="Begin chapter one" icon="feather" onPress={() => submit(true)} disabled={!canSave} style={styles.flex} />
    </>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title={editing ? 'Edit details' : 'New novel'} footer={footer} wide>
      <View style={[styles.top, phone && styles.topPhone]}>
        <View style={[styles.preview, phone && styles.previewPhone]}>
          <NovelCover novel={preview} height={phone ? 170 : 230} />
        </View>
        <View style={styles.flex}>
          <Field
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="The name of your novel"
            maxLength={200}
            autoFocus={!editing}
            returnKeyType="done"
            onSubmitEditing={() => submit(!editing)}
            style={styles.titleInput}
          />
          <Field label="Author" value={author} onChangeText={setAuthor} placeholder="Your name or pen name" />
          <Text style={styles.label}>COLOUR</Text>
          <View style={styles.swatches}>
            {novelAccents.map((a) => (
              <Pressable
                key={a.hex}
                accessibilityRole="radio"
                accessibilityState={{ checked: accent === a.hex }}
                accessibilityLabel={a.name}
                onPress={() => setAccent(a.hex)}
                style={[styles.swatch, { backgroundColor: a.hex }, accent === a.hex && styles.swatchOn]}
              >
                {accent === a.hex && <Icon name="check" size={18} color={colors.text} />}
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {!more ? (
        <OutlineButton label="More details" icon="chevron-down" onPress={() => setMore(true)} tone="sky" compact style={styles.more} />
      ) : (
        <View style={styles.moreBody}>
          <Field label="Subtitle" value={subtitle} onChangeText={setSubtitle} />
          <Text style={styles.label}>STATUS</Text>
          <View style={styles.chips}>
            {novelStatuses.map((s) => (
              <Chip key={s.key} label={s.label} selected={status === s.key} onPress={() => setStatus(s.key)} />
            ))}
          </View>
          <Field label="Main genre" value={genre} onChangeText={setGenre} placeholder="Fantasy" />
          <View style={[styles.chips, styles.suggestions]}>
            {genreSuggestions
              .filter((g) => !genre || (g.toLowerCase().includes(genre.toLowerCase()) && g !== genre))
              .slice(0, 8)
              .map((g) => (
                <Chip key={g} label={g} selected={false} onPress={() => setGenre(g)} />
              ))}
          </View>
          <Field label="Other genres" value={otherGenres} onChangeText={setOtherGenres} hint="Separated by commas" />
          <Field label="Tags" value={tags} onChangeText={setTags} hint="Separated by commas" />
          <Field
            label="Target word count"
            value={target}
            onChangeText={(t) => setTarget(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            hint={targetProblem ?? 'The progress bar on its card measures against this.'}
          />
          <Field
            label="Deadline"
            value={deadline}
            onChangeText={setDeadline}
            placeholder="yyyy-mm-dd"
            hint={deadlineProblem ?? undefined}
          />
          <Field label="Synopsis" value={synopsis} onChangeText={setSynopsis} multiline />
          <Text style={styles.label}>COVER PICTURE</Text>
          <View style={styles.coverRow}>
            <OutlineButton label={cover ? 'Change picture' : 'Choose a picture'} icon="image-outline" onPress={chooseCover} compact />
            {cover && <OutlineButton label="Remove" icon="close" onPress={() => setCover(null)} tone="muted" compact />}
          </View>
          {cover && !cover.startsWith('data:') && (
            <Text style={styles.note}>This cover is a web address. Scriptor never goes online, so it shows the designed cover.</Text>
          )}
          {!editing && otherNovels.length > 0 && (
            <>
              <Text style={[styles.label, styles.gap]}>START ORGANISED LIKE</Text>
              <Text style={styles.note}>
                Copies another novel’s kinds of record and fields, relationship types, calendar, progress tracking and
                systems. None of its story.
              </Text>
              <View style={styles.chips}>
                <Chip label="Nothing" selected={setupFrom === null} onPress={() => setSetupFrom(null)} />
                {otherNovels.map((n) => (
                  <Chip key={n.id} label={n.title || 'Untitled novel'} selected={setupFrom === n.id} onPress={() => setSetupFrom(n.id)} />
                ))}
              </View>
            </>
          )}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', gap: space.lg },
  topPhone: { flexDirection: 'column' },
  preview: { width: 170, borderRadius: radius.field, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  previewPhone: { width: 130, alignSelf: 'center' },
  titleInput: { fontFamily: fonts.display, fontSize: 20 },
  label: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.4, color: colors.gold, marginBottom: 6 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchOn: { borderColor: colors.gold },
  more: { marginTop: space.lg, alignSelf: 'flex-start' },
  moreBody: { marginTop: space.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  suggestions: { marginTop: -space.sm },
  coverRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  note: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 19, color: colors.muted, marginBottom: space.sm },
  gap: { marginTop: space.lg },
});
