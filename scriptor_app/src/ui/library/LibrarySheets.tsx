// The Library's sheets: importing a backup with a preview (FEATURES.md #66), saving and restoring backups ("Upload
// Backup" in the mock-ups: a file the writer keeps, never a cloud), starting from a template, and adding a novel to
// collections.

import { StyleSheet, Text, View } from 'react-native';

import type { ImportPreview } from '../../data/backupService';
import { roleLabel, roleSummary } from '../../domain/collab/access';
import { ReviewMark } from '../../domain/collab/reviewFiles';
import type { RestorePoint } from '../../data/draftStore';
import type { CustomCollection } from '../../domain/libraryView';
import type { Novel } from '../../domain/novel';
import { Sheet } from '../dialogs';
import { Chip, GoldButton, Icon, Muted, OutlineButton } from '../kit';
import { colors, fonts, radius, space } from '../theme';
import { formatDate } from './NovelCard';

/** Words for a collection's name in a file ("chapterPlans" → "chapter plans"). */
function humanize(name: string): string {
  return name.replace(/([A-Z])/g, ' $1').toLowerCase();
}

export function ImportSheet({
  preview,
  onAsCopy,
  onReplace,
  onOpenReview,
  onClose,
}: {
  preview: ImportPreview | null;
  onAsCopy: () => void;
  onReplace: () => void;
  /** A review copy someone sent: opened as one (a newer one in place of the one held). */
  onOpenReview: () => void;
  onClose: () => void;
}) {
  if (!preview) return null;
  const counts = [...preview.counts.entries()];
  const changes = [...preview.changes.entries()];
  const mark = ReviewMark.of(preview.snapshot.project);
  const reviewCopy = mark !== null;
  return (
    <Sheet
      visible
      onClose={onClose}
      title={mark !== null ? `A review copy of “${mark.title}”` : 'Import a backup'}
      wide
      footer={
        reviewCopy ? (
          <>
            <OutlineButton label="Cancel" onPress={onClose} tone="muted" style={styles.flex} />
            <GoldButton label={preview.existing ? 'Update it' : 'Open it'} icon="book-open-page-variant-outline" onPress={onOpenReview} style={styles.flex} />
          </>
        ) : preview.existing ? (
          <>
            <OutlineButton label="Import as a copy" onPress={onAsCopy} style={styles.flex} />
            <GoldButton label="Replace" icon="swap-horizontal" onPress={onReplace} style={styles.flex} />
          </>
        ) : (
          <>
            <OutlineButton label="Cancel" onPress={onClose} tone="muted" style={styles.flex} />
            <GoldButton label="Import" icon="download" onPress={onReplace} style={styles.flex} />
          </>
        )
      }
    >
      <Text style={styles.bookTitle}>{preview.title || 'Untitled novel'}</Text>
      {mark !== null ? (
        <Muted>
          {`From ${mark.ownerName}, for ${mark.memberName} as ${roleLabel[mark.role]}: ${roleSummary[mark.role]} You read it, comment and suggest; nothing you do changes the author’s book, and your feedback file goes back to them when you choose.${preview.existing ? ' It takes the place of the review copy you have, keeping your own changes not yet sent.' : ''}`}
        </Muted>
      ) : (
        <>
          {preview.fromVersion < 4 && (
            <Note icon="update">Made by an older version of the app: it is brought up to date as it is read.</Note>
          )}
          {preview.unknownCollections.length > 0 && (
            <Note icon="package-variant">
              {`It holds kinds of record this version does not use (${preview.unknownCollections.join(', ')}). They are kept unchanged.`}
            </Note>
          )}
          <Text style={styles.label}>WHAT IT HOLDS</Text>
          {counts.length === 0 ? (
            <Muted>Only the novel’s details.</Muted>
          ) : (
            <View style={styles.counts}>
              {counts.map(([name, n]) => (
                <Text key={name} style={styles.count}>
                  {n.toLocaleString('en-US')} {humanize(name)}
                </Text>
              ))}
            </View>
          )}
          {preview.existing && (
            <>
              <Text style={[styles.label, styles.gap]}>THIS NOVEL IS ALREADY IN YOUR LIBRARY</Text>
              <Muted>
                Import as a copy keeps both. Replace puts the file’s version in place of yours; yours is kept as a
                restore point first (Settings → Restore points), so it can be brought back.
              </Muted>
              {changes.length > 0 ? (
                <View style={styles.counts}>
                  {changes.map(([name, c]) => (
                    <Text key={name} style={styles.count}>
                      {humanize(name)}: {c.added} added, {c.changed} changed, {c.removed} removed
                    </Text>
                  ))}
                </View>
              ) : (
                <Muted style={styles.gapSmall}>The file and your version hold the same records.</Muted>
              )}
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

function Note({ icon, children }: { icon: 'update' | 'package-variant'; children: string }) {
  return (
    <View style={styles.note}>
      <Icon name={icon} size={18} color={colors.sky} />
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

export function BackupSheet({
  visible,
  novels,
  restorePoints,
  onSave,
  onImport,
  onRestore,
  onClose,
}: {
  visible: boolean;
  novels: Novel[];
  restorePoints: RestorePoint[];
  onSave: (novel: Novel) => void;
  onImport: () => void;
  onRestore: (point: RestorePoint) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Backups" wide>
      <Muted>
        A backup is the whole novel in one .novel.json file. Save it wherever you choose (Files, Drive, email); nothing
        is uploaded by Scriptor. Novel Builder opens the same files.
      </Muted>
      <Text style={[styles.label, styles.gap]}>SAVE A BACKUP</Text>
      {novels.length === 0 ? (
        <Muted>No novels yet.</Muted>
      ) : (
        novels.map((n) => (
          <View key={n.id} style={styles.line}>
            <Text style={styles.lineText} numberOfLines={1}>
              {n.title || 'Untitled novel'}
            </Text>
            <OutlineButton label="Save" icon="content-save-outline" onPress={() => onSave(n)} compact />
          </View>
        ))
      )}
      <Text style={[styles.label, styles.gap]}>RESTORE FROM A FILE</Text>
      <OutlineButton label="Choose a backup file" icon="folder-open-outline" onPress={onImport} tone="sky" style={styles.start} />
      <Text style={[styles.label, styles.gap]}>RESTORE POINTS</Text>
      <Muted>Copies kept on this phone before a novel was deleted, replaced or restored. The newest 20 of each novel.</Muted>
      {restorePoints.length === 0 ? (
        <Muted style={styles.gapSmall}>None yet.</Muted>
      ) : (
        restorePoints.map((p) => (
          <View key={p.id} style={styles.line}>
            <View style={styles.flex}>
              <Text style={styles.lineText} numberOfLines={1}>
                {p.title || 'Untitled novel'}
              </Text>
              <Muted>
                {p.reason} · {formatDate(p.createdAt)}
              </Muted>
            </View>
            <OutlineButton label="Restore" icon="restore" onPress={() => onRestore(p)} compact tone="sky" />
          </View>
        ))
      )}
    </Sheet>
  );
}

export function TemplatesSheet({
  visible,
  novels,
  onUse,
  onClose,
}: {
  visible: boolean;
  novels: Novel[];
  onUse: (novelId: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Templates">
      <Muted>
        Start a new novel organised like one you have: its kinds of record and fields, relationship types, calendar,
        progress tracking and systems. None of its story comes along.
      </Muted>
      <Muted style={styles.gapSmall}>
        The built-in worldbuilding templates (Progression Fantasy, Science Fiction, Detective Case, Urban Fantasy) come
        with Organize.
      </Muted>
      <Text style={[styles.label, styles.gap]}>START A NEW NOVEL LIKE</Text>
      {novels.length === 0 ? (
        <Muted>No novels yet.</Muted>
      ) : (
        novels.map((n) => (
          <View key={n.id} style={styles.line}>
            <Text style={styles.lineText} numberOfLines={1}>
              {n.title || 'Untitled novel'}
            </Text>
            <OutlineButton label="Use" icon="content-copy" onPress={() => onUse(n.id)} compact />
          </View>
        ))
      )}
    </Sheet>
  );
}

export function CollectionPicker({
  novel,
  collections,
  onToggle,
  onNew,
  onClose,
}: {
  novel: Novel | null;
  collections: CustomCollection[];
  onToggle: (collectionId: string, member: boolean) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  if (!novel) return null;
  return (
    <Sheet visible onClose={onClose} title="Add to collection">
      <Text style={styles.bookTitle}>{novel.title || 'Untitled novel'}</Text>
      {collections.length === 0 ? (
        <Muted>You have no collections of your own yet.</Muted>
      ) : (
        <View style={styles.chips}>
          {collections.map((c) => {
            const member = c.novelIds.includes(novel.id);
            return (
              <Chip
                key={c.id}
                label={c.name}
                icon={member ? 'check' : 'plus'}
                selected={member}
                onPress={() => onToggle(c.id, !member)}
              />
            );
          })}
        </View>
      )}
      <OutlineButton label="New collection" icon="folder-plus-outline" onPress={onNew} tone="sky" style={styles.start} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bookTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text, marginBottom: space.md },
  label: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.4, color: colors.gold, marginBottom: space.sm },
  gap: { marginTop: space.xl },
  gapSmall: { marginTop: space.sm },
  counts: { marginTop: space.xs, gap: 2 },
  count: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  note: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    marginBottom: space.md,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  noteText: { flex: 1, fontFamily: fonts.ui, fontSize: 14, lineHeight: 20, color: colors.text },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lineText: { flex: 1, fontFamily: fonts.ui, fontSize: 16, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  start: { alignSelf: 'flex-start' },
});
