// THE NOTES TAB: loose notes about a character. A note is not part of what is established about them until the author
// copies it into the profile, and copying keeps the note. The pure parts of
// flutter_app/lib/features/characters/tabs/notes_tab.dart.
//
// What a press changes: "Add note", CharacterChanges.saveNote(entryId, null, { content }) (nothing for blank text); a
// card's title, text and tags as typed (autosave under `note:<noteId>:<what>`: saveNote(entryId, noteId, { title } /
// { content } / { tags: commaList(text) })); Pin and Unpin, saveNote(…, { pinned: !note.pinned }); its chapters,
// saveNote(…, { nodeIds }); deleting, removeNote(noteId); "Copy into the profile", promoteNote(noteId, sectionId,
// fieldName).

import { dartTrim } from '../../text/dartString';
import { type CastData } from '../castData';
import { type CharacterNote, type CharacterProfile } from '../characterRecords';
import { documentOptions, formatRelative, idPicker } from './parts';

export const notesWords = {
  intro: (name: string) =>
    `Ideas and loose ends about ${name}. A note changes nothing on the profile until you copy it there.`,
  newNote: 'A new note',
  add: 'Add note',
  empty: 'No notes yet.',
  title: 'Title',
  note: 'Note',
  tags: 'Tags (comma separated)',
  chapters: 'About these chapters',
  copy: 'Copy into the profile…',
  pinned: 'Pinned',
} as const;

/** One note's card, as data. */
export function noteCard(
  cast: CastData,
  note: CharacterNote,
  now: Date = new Date(),
): {
  pinLabel: string;
  deleteTooltip: string;
  deleteConfirm: { title: string; message: string; confirm: string };
  tags: string;
  chapters: ReturnType<typeof idPicker>;
  /** "Written 5 minutes ago · changed just now". */
  when: string;
} {
  return {
    pinLabel: note.pinned ? 'Unpin' : 'Pin',
    deleteTooltip: `Delete the note ${note.title}`,
    deleteConfirm: {
      title: `Delete the note “${note.title}”?`,
      message: 'Anything already copied from it into the profile stays there.',
      confirm: 'Delete note',
    },
    tags: note.tags.join(', '),
    chapters: idPicker({
      label: notesWords.chapters,
      chosen: note.nodeIds,
      options: documentOptions(cast),
      nameOf: (id) => cast.model.nodes.get(id)?.displayTitle ?? null,
    }),
    when: `Written ${formatRelative(note.createdAt, now)} · changed ${formatRelative(note.updatedAt, now)}`,
  };
}

/** "Copy into the profile…": the dialog's start (the first section; the note's title as the field's name when it is
 * 40 characters or fewer), or, when the profile has no section, what is said instead. */
export function copyDialog(
  profile: CharacterProfile,
  note: CharacterNote,
):
  | { noSection: string }
  | {
      title: string;
      message: string;
      sections: { value: string; label: string }[];
      section: string;
      field: string;
      fieldLabel: string;
      fieldHint: string;
      cancel: string;
      confirm: string;
      /** Whether Copy can be pressed for a field name typed. */
      canCopy: (field: string) => boolean;
      /** Said once copied (CharacterChanges.promoteNote). */
      copied: (sectionId: string, field: string) => string;
    } {
  if (profile.sections.length === 0) {
    return { noSection: 'The profile has no section to copy it into. Add a section first.' };
  }
  return {
    title: 'Copy the note into the profile',
    message: 'Its text becomes a field of the character’s record. The note itself is kept.',
    sections: profile.sections.map((s) => ({ value: s.id, label: s.name })),
    section: profile.sections[0].id,
    field: note.title.length > 40 ? '' : note.title,
    fieldLabel: 'Field name',
    fieldHint: 'Family',
    cancel: 'Cancel',
    confirm: 'Copy into the profile',
    canCopy: (field) => dartTrim(field).length > 0,
    copied: (sectionId, field) =>
      `Copied into ${profile.sections.find((s) => s.id === sectionId)!.name} as “${dartTrim(field)}”. The note is kept.`,
  };
}
