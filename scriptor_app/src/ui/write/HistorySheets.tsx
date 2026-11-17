// VERSION HISTORY (FEATURES.md #116) and ALTERNATE DRAFTS (#117) of a chapter or scene. Ports of
// flutter_app/lib/features/write/version_history.dart and drafts_dialog.dart.

import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DraftRefused } from '../../data/manuscriptService';
import { type JsonMap, numOrNull, str } from '../../domain/json';
import { blockTexts, measureDoc } from '../../domain/prose';
import { ConfirmDelete, PromptSheet, Sheet } from '../dialogs';
import { Chip, Field, GoldButton, Icon, IconButton, Muted, OutlineButton } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, radius, space } from '../theme';
import { useToast } from '../toast';
import { formatDate } from '../library/NovelCard';
import { VersionCompare } from './VersionCompare';

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Each version's label, by why it was kept (as the Flutter app names them). */
export function versionLabel(r: JsonMap): string {
  const label = str(r['label']);
  switch (r['reason']) {
    case 'auto':
      return 'Automatic';
    case 'manual':
      return label || 'Saved version';
    case 'restore':
      return label || 'Before restoring an earlier version';
    case 'recovery':
      return label || 'Unsaved writing from an earlier session';
    case 'conflict':
      return label || 'Set aside in a conflict';
    default:
      return label || 'Version';
  }
}

const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

export function VersionHistorySheet({
  visible,
  novelId,
  nodeId,
  currentDoc,
  onBeforeChange,
  onRestored,
  onClose,
}: {
  visible: boolean;
  novelId: string;
  nodeId: string;
  /** The text in the editor now, to compare against. */
  currentDoc: () => JsonMap | null;
  /** Saves what is typed before history changes the text. Resolves to the saved revision. */
  onBeforeChange: () => Promise<number>;
  /** The text was replaced: the editor opens the chapter again. */
  onRestored: () => void;
  onClose: () => void;
}) {
  const lib = useLibrary();
  const toast = useToast();
  const [chosen, setChosen] = useState<JsonMap | null>(null);
  const [naming, setNaming] = useState(false);
  const [tick, setTick] = useState(0);
  const versions = useMemo(
    () => (visible ? lib.manuscript.revisions(novelId, nodeId) : []),
    [lib, novelId, nodeId, visible, tick],
  );
  useEffect(() => {
    if (!visible) setChosen(null);
  }, [visible]);

  const restore = async (r: JsonMap) => {
    try {
      const rev = await onBeforeChange();
      lib.manuscript.restoreRevision(novelId, nodeId, str(r['id']), rev);
      toast('Restored. The text it replaced is kept in history.');
      setChosen(null);
      onRestored();
      onClose();
    } catch (e) {
      toast(`It could not be restored (${message(e)}).`, { error: true });
    }
  };

  return (
    <>
      <Sheet
        visible={visible && !naming}
        onClose={onClose}
        title={chosen ? versionLabel(chosen) : 'Version history'}
        wide
        footer={
          chosen ? (
            <>
              <OutlineButton label="All versions" icon="arrow-left" onPress={() => setChosen(null)} style={styles.flex} />
              <GoldButton label="Restore" accessibilityLabel="Restore this version" icon="restore" onPress={() => restore(chosen)} style={styles.flex} />
            </>
          ) : (
            <OutlineButton label="Save a version…" icon="content-save-outline" onPress={() => setNaming(true)} style={styles.flex} />
          )
        }
      >
        {chosen ? (
          <VersionCompare before={chosen['doc']} after={currentDoc()} />
        ) : versions.length === 0 ? (
          <Muted>No versions yet. One is kept automatically every few minutes while you write, and whenever you save one.</Muted>
        ) : (
          versions.map((r) => {
            const at = numOrNull(r['capturedAt']) ?? 0;
            return (
              <Pressable
                key={str(r['id'])}
                accessibilityRole="button"
                onPress={() => setChosen(r)}
                style={({ pressed }) => [styles.version, pressed && { backgroundColor: colors.elevated }]}
              >
                <Icon name={r['reason'] === 'auto' ? 'history' : 'bookmark-outline'} size={20} color={r['reason'] === 'auto' ? colors.muted : colors.gold} />
                <View style={styles.flex}>
                  <Text style={styles.versionTitle}>{versionLabel(r)}</Text>
                  <Muted>
                    {formatDate(at)} · {time.format(new Date(at))} · {(numOrNull(r['wordCount']) ?? measureDoc(r['doc']).words).toLocaleString('en-US')} words
                  </Muted>
                </View>
                <Icon name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            );
          })
        )}
      </Sheet>
      <PromptSheet
        visible={naming}
        title="Save a version"
        label="Name (optional)"
        confirmLabel="Save"
        onSubmit={async (name) => {
          setNaming(false);
          try {
            await onBeforeChange();
            lib.manuscript.saveVersion(novelId, nodeId, name);
            setTick((t) => t + 1);
            toast('Version saved');
          } catch (e) {
            toast(`It could not be saved (${message(e)}).`, { error: true });
          }
        }}
        onClose={() => setNaming(false)}
        allowEmpty
      />
    </>
  );
}

export function DraftsSheet({
  visible,
  novelId,
  nodeId,
  onBeforeChange,
  onTextReplaced,
  onClose,
}: {
  visible: boolean;
  novelId: string;
  nodeId: string;
  onBeforeChange: () => Promise<number>;
  onTextReplaced: () => void;
  onClose: () => void;
}) {
  const lib = useLibrary();
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const [newName, setNewName] = useState('');
  const [blank, setBlank] = useState(false);
  const [starting, setStarting] = useState(false);
  const [reading, setReading] = useState<JsonMap | null>(null);
  const [renaming, setRenaming] = useState<{ id: string | null; name: string } | null>(null);
  const [deleting, setDeleting] = useState<JsonMap | null>(null);

  const { active, others } = useMemo(() => {
    if (!visible) return { active: '', others: [] as JsonMap[] };
    return { active: lib.manuscript.activeDraft(novelId, nodeId), others: lib.manuscript.alternateDrafts(novelId, nodeId) };
  }, [lib, novelId, nodeId, visible, tick]);

  const run = async (what: () => void, done: string, replacesText: boolean) => {
    try {
      await onBeforeChange();
      what();
      setTick((t) => t + 1);
      toast(done);
      if (replacesText) onTextReplaced();
    } catch (e) {
      toast(e instanceof DraftRefused ? e.message : `It could not be done (${message(e)}).`, { error: true });
    }
  };

  const busy = starting || reading !== null || renaming !== null || deleting !== null;
  return (
    <>
      <Sheet visible={visible && !busy} onClose={onClose} title="Drafts" wide>
        <Muted>
          Only the draft in the manuscript is counted, searched, read and exported. The others are kept here, whole.
        </Muted>
        <Text style={styles.label}>IN THE MANUSCRIPT</Text>
        <View style={styles.draftRow}>
          <Icon name="feather" size={20} color={colors.gold} />
          <Text style={[styles.draftName, styles.flex]}>{active}</Text>
          <IconButton icon="pencil-outline" label="Rename this draft" onPress={() => setRenaming({ id: null, name: active })} />
        </View>
        <Text style={styles.label}>SET ASIDE</Text>
        {others.length === 0 ? (
          <Muted>None. Start a new draft to try this chapter another way; this one is kept.</Muted>
        ) : (
          others.map((d) => (
            <View key={str(d['id'])} style={styles.draftRow}>
              <View style={styles.flex}>
                <Text style={styles.draftName}>{str(d['name'])}</Text>
                <Muted>{(numOrNull(d['wordCount']) ?? 0).toLocaleString('en-US')} words</Muted>
              </View>
              <IconButton icon="book-open-variant" label={`Read ${str(d['name'])}`} onPress={() => setReading(d)} />
              <IconButton
                icon="swap-horizontal"
                label={`Put ${str(d['name'])} in the manuscript`}
                color={colors.gold}
                onPress={() => run(() => lib.manuscript.switchDraft(novelId, nodeId, str(d['id'])), `“${str(d['name'])}” is in the manuscript now`, true)}
              />
              <IconButton icon="pencil-outline" label={`Rename ${str(d['name'])}`} onPress={() => setRenaming({ id: str(d['id']), name: str(d['name']) })} />
              <IconButton icon="delete-outline" label={`Delete ${str(d['name'])}`} color={colors.danger} onPress={() => setDeleting(d)} />
            </View>
          ))
        )}
        <OutlineButton label="Start a new draft…" icon="plus" tone="sky" onPress={() => setStarting(true)} style={styles.start} />
      </Sheet>

      <Sheet
        visible={starting}
        onClose={() => setStarting(false)}
        title="Start a new draft"
        footer={
          <>
            <OutlineButton label="Cancel" tone="muted" onPress={() => setStarting(false)} style={styles.flex} />
            <GoldButton
              label="Start it"
              disabled={!newName.trim()}
              onPress={() => {
                setStarting(false);
                void run(() => lib.manuscript.createDraft(novelId, nodeId, newName, blank), `Writing “${newName.trim()}”. “${active}” is kept.`, blank);
                setNewName('');
              }}
              style={styles.flex}
            />
          </>
        }
      >
        <Field label="Name" value={newName} onChangeText={setNewName} placeholder="Second try" autoFocus />
        <View style={styles.chips}>
          <Chip label="From a copy of this one" selected={!blank} onPress={() => setBlank(false)} />
          <Chip label="From a blank page" selected={blank} onPress={() => setBlank(true)} />
        </View>
        <Muted>“{active}” is set aside as it is, under its own name.</Muted>
      </Sheet>

      <Sheet visible={reading !== null} onClose={() => setReading(null)} title={reading ? str(reading['name']) : ''} wide>
        <ScrollView style={styles.read}>
          {blockTexts(reading?.['doc']).map((t, i) => (
            <Text key={i} style={styles.readText}>
              {t}
            </Text>
          ))}
        </ScrollView>
      </Sheet>

      <PromptSheet
        visible={renaming !== null}
        title="Rename the draft"
        label="Name"
        initial={renaming?.name ?? ''}
        confirmLabel="Rename"
        onSubmit={(name) => {
          const r = renaming;
          setRenaming(null);
          if (r) void run(() => lib.manuscript.renameDraft(novelId, nodeId, r.id, name), 'Renamed', false);
        }}
        onClose={() => setRenaming(null)}
      />
      <ConfirmDelete
        visible={deleting !== null}
        title="Delete this draft?"
        message={`“${str(deleting?.['name'])}” will be deleted for good. The draft in the manuscript is not touched.`}
        confirmLabel="Delete"
        onConfirm={() => {
          const d = deleting;
          setDeleting(null);
          if (d) void run(() => lib.manuscript.deleteDraft(novelId, str(d['id'])), 'Draft deleted', false);
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  start: { alignSelf: 'flex-start', marginTop: space.lg },
  label: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.4, color: colors.gold, marginTop: space.lg, marginBottom: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  version: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingHorizontal: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  versionTitle: { fontFamily: fonts.ui, fontSize: 16, color: colors.text },
  draftRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 56, paddingLeft: space.sm, borderRadius: radius.field, borderWidth: 1, borderColor: colors.border, marginBottom: space.sm },
  draftName: { fontFamily: fonts.ui, fontSize: 16, color: colors.text },
  read: { maxHeight: 480 },
  readText: { fontFamily: fonts.book, fontSize: 16, lineHeight: 26, color: colors.text, marginBottom: space.md },
});
