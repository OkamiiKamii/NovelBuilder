// EVERY CONNECTION (FEATURES.md #219–#220): on an entry, a chapter, an event or a thread, every connection it has both
// ways, read from wherever each is kept, each opening the record at the other end when it has a page. A connection the
// author recorded shows its status and can be changed or removed; the rest are facts of other records. "Add a
// connection": its kind (24 that read correctly from each end, or the author's own words), the other end, each side's
// words, notes and status. A port of flutter_app/lib/features/codex/widgets/connections_panel.dart; the logic is
// src/domain/codex/screens/connections.ts.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  type ConnectionForm,
  type ConnectionLine,
  type ConnectionStatus,
  connectionDialog,
  connectionForm,
  connectionsPanel,
  openRecord,
  removeConnection,
  removeConnectionDialog,
  saveConnection,
} from '../../domain/codex/screens/connections';
import type { EntityRef } from '../../domain/model/entityRef';
import type { Link } from '../../domain/records/link';
import { ConfirmDelete, Sheet } from '../dialogs';
import { Chip, GoldButton, Icon, IconButton, type IconName, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, radius, space } from '../theme';
import { threadPath } from '../../domain/plot/plotService';
import { lastNodeSetting } from '../write/WriteScreen';
import { ChooserField } from './parts';
import type { OpenCast } from './useCast';

/** The status signs (Material's names in the Flutter app, Material Community's here): never told by colour alone. */
const statusIcon: Readonly<Record<ConnectionStatus, IconName>> = {
  confirmed: 'check-circle-outline',
  provisional: 'clock-outline',
  disputed: 'help-circle-outline',
  invalid: 'block-helper',
};

export function ConnectionsPanel({ open, self }: { open: OpenCast; self: EntityRef }) {
  const lib = useLibrary();
  const router = useRouter();
  const [dialog, setDialog] = useState<{ editing: Link | null } | null>(null);
  const [removing, setRemoving] = useState<ConnectionLine | null>(null);
  const panel = connectionsPanel(open.cast, self);

  const go = (ref: EntityRef) => {
    // A plot thread has its page here (the Flutter panel opens none; Scriptor's thread page is /plan/thread/<id>).
    if (ref.type === 'thread') {
      router.navigate(threadPath(ref.id) as never);
      return;
    }
    const where = openRecord(open.cast, ref);
    if (!where) return;
    if (where.kind === 'path') {
      router.navigate(where.path as never);
      return;
    }
    // A chapter or scene opens in Write, where the place it is remembered is Write's own.
    lib.saves.saveNow(`setting:${lastNodeSetting(open.novelId)}`, () => lib.settings.write(lastNodeSetting(open.novelId), where.nodeId));
    router.navigate('/write');
  };

  return (
    <Panel style={styles.panel}>
      <View style={styles.headRow}>
        <Text style={[styles.kicker, styles.flex]}>{panel.title.toUpperCase()}</Text>
        <OutlineButton label={panel.add} icon="link-plus" compact onPress={() => setDialog({ editing: null })} />
      </View>
      {panel.empty && <Muted>{panel.empty}</Muted>}
      {panel.lines.map((line, i) => {
        const other = line.other.opens || line.other.ref.type === 'thread' ? (
          <Text key="o" style={styles.link} onPress={() => go(line.other.ref)} accessibilityRole="link">
            {line.other.name}
          </Text>
        ) : (
          <Text key="o" style={styles.otherText}>
            {line.other.name}
          </Text>
        );
        const words = (
          <Text key="w" style={styles.text}>
            {line.words}
          </Text>
        );
        return (
          <View key={`${line.connection.source.collection}:${line.connection.source.id}:${i}`} style={styles.line}>
            <View style={styles.wrap}>
              {line.outgoing ? [words, other] : [other, words]}
              {line.status && (
                <View style={styles.status}>
                  <Icon name={statusIcon[line.status.status]} size={16} color={colors.text} />
                  <Text style={styles.statusText}>{line.status.label}</Text>
                </View>
              )}
              <Text style={styles.kept}>{line.keptIn}</Text>
            </View>
            {line.link && (
              <View style={styles.lineActions}>
                <IconButton icon="pencil-outline" label={removeConnectionDialog.changeTooltip} onPress={() => setDialog({ editing: line.link })} />
                <IconButton icon="link-off" label={removeConnectionDialog.removeTooltip} onPress={() => setRemoving(line)} />
              </View>
            )}
          </View>
        );
      })}
      {dialog && <ConnectionSheet open={open} from={self} editing={dialog.editing} onClose={() => setDialog(null)} />}
      {removing && (
        <ConfirmDelete
          visible
          title={removeConnectionDialog.title}
          message={removeConnectionDialog.message}
          confirmLabel={removeConnectionDialog.confirm}
          onConfirm={() => {
            const id = removing.connection.source.id;
            setRemoving(null);
            open.now(removeConnection(id));
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </Panel>
  );
}

/** "Add a connection" / "Change the connection". */
function ConnectionSheet({ open, from, editing, onClose }: { open: OpenCast; from: EntityRef; editing: Link | null; onClose: () => void }) {
  const [form, setForm] = useState<ConnectionForm>(() => connectionForm(editing));
  const view = connectionDialog(open.cast, from, editing, form);
  const set = (patch: Partial<ConnectionForm>) => setForm({ ...form, ...patch });
  const save = () => {
    if (!view.ready) return;
    const done = open.now(saveConnection(from, editing, form));
    if (done) onClose();
  };
  return (
    <Sheet
      visible
      onClose={onClose}
      title={view.title}
      footer={
        <View style={styles.footer}>
          <OutlineButton label="Cancel" compact tone="muted" onPress={onClose} />
          <GoldButton label={view.confirm} compact disabled={!view.ready} onPress={save} />
        </View>
      }
    >
      <Muted>{view.fromLine}</Muted>
      <ChooserField label="Kind of connection" value={form.kind} choices={view.kinds} onChoose={(kind) => set({ kind })} />
      {view.ownLabel && <Input label={view.ownLabel} value={form.own} placeholder={view.ownHint} onChange={(own) => set({ own })} />}
      <Muted>{view.reads}</Muted>
      {view.otherKinds && (
        <>
          <Text style={styles.label}>CONNECT TO</Text>
          <View style={styles.chips}>
            {view.otherKinds.map((k) => (
              <Chip key={k.type} label={k.label} selected={form.otherType === k.type} onPress={() => set({ otherType: k.type, to: null })} />
            ))}
          </View>
        </>
      )}
      {view.options && view.options.length > 0 && (
        <ChooserField
          label="Which one"
          value={form.to?.key ?? ''}
          choices={[{ value: '', label: 'Choose…' }, ...view.options.map((o) => ({ value: o.ref.key, label: o.label }))]}
          onChoose={(key) => set({ to: view.options!.find((o) => o.ref.key === key)?.ref ?? null })}
        />
      )}
      {view.nothingOfThatKind && <Muted>{view.nothingOfThatKind}</Muted>}
      <Input label={view.labelLabel} value={form.label} placeholder={view.labelHint} onChange={(label) => set({ label })} />
      <Input label={view.reverseLabel} value={form.reverse} onChange={(reverse) => set({ reverse })} helper={view.reverseHelper} />
      <Input label={view.notesLabel} value={form.notes} onChange={(notes) => set({ notes })} multiline />
      <ChooserField label="Status" value={form.canon} choices={view.statuses} onChoose={(canon) => set({ canon })} />
    </Sheet>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  helper,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  helper?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        selectionColor={colors.gold}
        cursorColor={colors.gold}
        accessibilityLabel={label}
        multiline={multiline}
        style={[styles.input, multiline && styles.inputMulti]}
      />
      {helper && <Muted>{helper}</Muted>}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  panel: { gap: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  kicker: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.6, color: colors.gold },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: 2 },
  wrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 2 },
  text: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  otherText: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.text },
  link: { fontFamily: fonts.ui, fontSize: 15, color: colors.gold, textDecorationLine: 'underline', paddingVertical: 6 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.chip, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated },
  statusText: { fontFamily: fonts.ui, fontSize: 12.5, color: colors.text },
  kept: { fontFamily: fonts.ui, fontSize: 12.5, color: colors.muted },
  lineActions: { flexDirection: 'row' },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
  label: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.4, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  field: { gap: 4 },
  input: {
    minHeight: 48,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 15,
  },
  inputMulti: { minHeight: 88, paddingTop: space.sm, textAlignVertical: 'top' },
});
