// BOOK DETAILS (FEATURES.md #131, #132): the pages around the story, which the reader and publishing print:
// dedication, epigraph, copyright, the cast list, acknowledgements, about the author, and the mark between scenes.
// Each field saves as it is typed, on its own, applied to the row as stored at the moment it is written, so quick
// edits to several fields never undo each other. A port of flutter_app/lib/features/reader/book_details_page.dart.

import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readMatter, writeMatterField } from '../../data/readerData';
import { sceneBreaks } from '../../domain/reader/book';
import { openNovelSettingKey } from '../../data/settingsStore';
import { Chip, Field, IconButton, Muted, OutlineButton } from '../kit';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { SavePill } from '../SavePill';
import { colors, fonts, space } from '../theme';

const fields: { field: string; label: string; hint: string; lines: number }[] = [
  { field: 'dedication', label: 'Dedication', hint: 'For …', lines: 2 },
  { field: 'epigraph', label: 'Epigraph', hint: 'A quotation that opens the book.', lines: 3 },
  { field: 'epigraphSource', label: 'Epigraph source', hint: 'Who said or wrote it.', lines: 1 },
  { field: 'copyright', label: 'Copyright page', hint: 'Copyright © 2026 …. All rights reserved.', lines: 3 },
  { field: 'castTitle', label: 'Cast list title', hint: 'Dramatis Personae', lines: 1 },
  {
    field: 'castList',
    label: 'Cast list, before the story',
    hint: 'One a line: Name — who they are. A line ending in ":" heads a group. Characters can make it for you.',
    lines: 6,
  },
  { field: 'acknowledgements', label: 'Acknowledgements', hint: 'Thanks, at the back of the book.', lines: 4 },
  { field: 'aboutAuthor', label: 'About the author', hint: 'A few lines about you, at the very end.', lines: 4 },
];

function breakName(mark: string): string {
  if (mark === '') return 'A blank line';
  if (mark === '—') return '— (a dash)';
  if (mark === '#') return '# (as manuscripts mark it)';
  return mark;
}

export function BookDetailsScreen() {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const novelId = useMemo(() => {
    const id = lib.settings.read(openNovelSettingKey);
    return typeof id === 'string' && lib.novels.exists(id) ? id : null;
  }, [lib, revision]);

  // The fields as typed here: read once when the novel opens, then the typing is the truth (each saved as it goes).
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!novelId) return;
    const row = readMatter(lib, novelId);
    const next: Record<string, string> = {};
    for (const f of [...fields.map((x) => x.field), 'sceneBreak']) next[f] = typeof row?.[f] === 'string' ? (row[f] as string) : '';
    if (!row || typeof row['sceneBreak'] !== 'string') next['sceneBreak'] = '* * *';
    setValues(next);
  }, [lib, novelId]);

  if (!novelId) {
    return (
      <View style={[styles.page, { paddingTop: insets.top + space.lg }]}>
        <Muted>Open a novel from your Library first.</Muted>
      </View>
    );
  }

  const set = (field: string, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    writeMatterField(lib, novelId, field, value);
  };
  const mark = values['sceneBreak'] ?? '* * *';
  const custom = !sceneBreaks.includes(mark);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.body, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.head}>
        <IconButton icon="arrow-left" label="Back to writing" onPress={() => router.navigate('/write')} />
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit>
          Book details
        </Text>
        <SavePill />
      </View>
      <Muted style={styles.intro}>The pages around the story, as the reader and an ebook print them. Each saves as you type.</Muted>
      <OutlineButton label="Read the book" icon="book-open-variant" compact onPress={() => router.navigate('/write/read')} style={styles.read} />
      {fields.map((f) => (
        <Field
          key={f.field}
          label={f.label}
          hint={f.lines > 2 || f.field === 'castList' ? f.hint : undefined}
          placeholder={f.lines <= 2 && f.field !== 'castList' ? f.hint : undefined}
          value={values[f.field] ?? ''}
          onChangeText={(v) => set(f.field, v)}
          multiline={f.lines > 1}
          numberOfLines={f.lines}
          style={f.lines > 1 ? { minHeight: 24 * f.lines + 20, textAlignVertical: 'top' } : undefined}
        />
      ))}
      <Text style={styles.label}>BETWEEN SCENES</Text>
      <View style={styles.chips}>
        {sceneBreaks.map((m) => (
          <Chip key={m || 'blank'} label={breakName(m)} selected={mark === m} onPress={() => set('sceneBreak', m)} />
        ))}
      </View>
      <Muted style={styles.helper}>{custom ? `Your own mark: ${mark}` : 'Printed where one scene ends and the next begins.'}</Muted>
      <Field
        label="Or your own mark"
        placeholder="Up to 12 characters, like ~ or ◆"
        value={custom ? mark : ''}
        maxLength={12}
        onChangeText={(v) => {
          if (v.trim()) set('sceneBreak', v.slice(0, 12));
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: space.lg, gap: space.sm, maxWidth: 760, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 24, color: colors.gold },
  intro: { marginBottom: space.xs },
  read: { alignSelf: 'flex-start', marginBottom: space.md },
  label: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold, marginTop: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  helper: { marginBottom: space.sm },
});
