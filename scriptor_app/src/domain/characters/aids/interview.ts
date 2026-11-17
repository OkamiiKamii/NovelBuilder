// THE INTERVIEW: a character's empty profile filled the way writers get to know someone, one question at a time ("What
// does Mira want more than anything?"), each answer going into the field it belongs to (the profile's own fields, by
// name, whatever the layout). Only fields that are on the character and still empty are asked. The questions are
// fixed and written here; the answers are the author's alone, saved only when they press Next. The character is named,
// never given a pronoun.
//
// THE INTERVIEW AS A CONVERSATION: the author and the character, face to face. Each question is the author's line,
// each answer the character's reply, in their colour beside their cameo, marked with where it went ("→ Fears"); the
// talk so far stays above the question now, and at the head, how well they are known so far ("Known 3 of 11"). The
// author answers as the character. Next saves the answer and asks the next, Skip passes, Done ends; full screen on a
// phone.
//
// The pure parts of flutter_app/lib/features/characters/interview.dart.
//
// What a press changes: Next (or "Save and finish" on the last), with an answer typed, saves it:
// `saveInterviewAnswer(c, entryId, step, storedAnswer(step.type, typed))` in one change (CharacterChanges):
// `updateField(entryId, step.fieldId, { value })` for a field they have, else `addField(entryId, <the section named
// step.sectionName as stored now, else step.sectionId>, step.suggestion, { value })`. Skip and Done change nothing.
// After the last question (answered or skipped) the conversation closes.

import { type FieldType } from '../../records/category';
import { type Entry, type EntryField } from '../../records/entry';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { type CharacterChanges } from '../characterChanges';
import { type CharacterProfile, type CharacterTemplate, type FieldSuggestion } from '../characterRecords';
import { suggestionsFor } from '../templates';

/** A question and the fields it can fill, by name, in the order tried. */
export type InterviewQuestion = { ask: string; hint: string | null; fields: readonly string[] };

const severalHint = 'A few words, separated by commas';

export const interviewQuestions: readonly InterviewQuestion[] = [
  { ask: 'What does {name} want more than anything?', hint: null, fields: ['What they want', 'Initial Goals', 'Motivations'] },
  { ask: 'What is {name} afraid of?', hint: severalHint, fields: ['Fears'] },
  { ask: 'What stands in {name}’s way?', hint: null, fields: ['What stands in the way', 'External Conflict'] },
  {
    ask: 'What does {name} believe that is not true?',
    hint: null,
    fields: ['The lie they believe', 'Beliefs', 'Initial Beliefs'],
  },
  { ask: 'What war goes on inside {name}?', hint: null, fields: ['Internal Conflicts', 'Internal Conflict'] },
  { ask: 'What is {name} good at?', hint: severalHint, fields: ['Strengths'] },
  { ask: 'Where does {name} fall short?', hint: severalHint, fields: ['Weaknesses'] },
  { ask: 'What would {name} never do?', hint: null, fields: ['Lines they will not cross', 'Values'] },
  { ask: 'What does {name} stand to lose?', hint: null, fields: ['What they stand to lose'] },
  { ask: 'Where is {name} when the story begins?', hint: null, fields: ['Starting Point'] },
  { ask: 'How should {name}’s story end?', hint: null, fields: ['Intended Resolution', 'What they need'] },
  { ask: 'How does {name} sound when speaking?', hint: null, fields: ['Voice'] },
];

/** A question to put to a character, and where its answer goes: an empty field they have (`fieldId`), or a field one
 * of their sections suggests (`sectionName` and `suggestion`), made when the answer is saved. The section is found by
 * its name then: a profile not yet stored gives its sections new ids each time it is read. */
export type InterviewStep = {
  ask: string;
  hint: string | null;
  fieldName: string;
  type: FieldType | null;
  fieldId: string | null;
  sectionId: string | null;
  sectionName: string | null;
  suggestion: FieldSuggestion | null;
};

function fieldsByName(entry: Entry): Map<string, EntryField> {
  const have = new Map<string, EntryField>();
  for (const f of entry.fields) {
    const key = dartToLowerCase(dartTrim(f.key));
    if (!have.has(key)) have.set(key, f);
  }
  return have;
}

/** The questions `entry` can still be asked, with its `profile`'s sections and the novel's `templates`: for each, the
 * first of its fields the character has or is offered. A field already filled means the question is answered. */
export function interviewFor(
  entry: Entry,
  profile: CharacterProfile,
  templates: readonly CharacterTemplate[],
): InterviewStep[] {
  const have = fieldsByName(entry);
  const offered = new Map<string, [string, string, FieldSuggestion]>();
  const keys = entry.fields.map((f) => f.key);
  for (const s of profile.sections) {
    if (s.hidden) continue;
    for (const sug of suggestionsFor(s.name, templates, keys)) {
      const key = dartToLowerCase(dartTrim(sug.name));
      if (!offered.has(key)) offered.set(key, [s.id, s.name, sug]);
    }
  }
  const name = dartTrim(entry.name).length === 0 ? 'them' : dartTrim(entry.name);
  const used = new Set<string>();
  const steps: InterviewStep[] = [];
  for (const q of interviewQuestions) {
    for (const candidate of q.fields) {
      const key = dartToLowerCase(candidate);
      const ask = q.ask.split('{name}').join(name);
      const field = have.get(key);
      if (field !== undefined) {
        if (dartTrim(field.value).length === 0 && !used.has(key)) {
          used.add(key);
          steps.push({
            ask,
            hint: q.hint,
            fieldName: field.key,
            type: field.type,
            fieldId: field.id,
            sectionId: null,
            sectionName: null,
            suggestion: null,
          });
        }
        break;
      }
      const offer = offered.get(key);
      if (offer !== undefined) {
        const [sectionId, sectionName, sug] = offer;
        if (!used.has(key)) {
          used.add(key);
          steps.push({
            ask,
            hint: q.hint,
            fieldName: sug.name,
            type: sug.type,
            fieldId: null,
            sectionId,
            sectionName,
            suggestion: sug,
          });
        }
        break;
      }
    }
  }
  return steps;
}

/** The answer as the field stores it: a list field takes one item per line (from commas); text as typed. */
export function storedAnswer(type: FieldType | null, answer: string): string {
  if (type === 'tags' || type === 'multiselect') {
    return answer
      .split(/[,\n]/)
      .filter((p) => dartTrim(p).length > 0)
      .map((p) => dartTrim(p))
      .join('\n');
  }
  return dartTrim(answer);
}

/** How well the author knows a character: of the interview's questions, how many their profile has answered (`known`),
 * and of how many (`of`: those answered and those the interview would ask now; a question with no field in this
 * layout counts for neither). */
export function acquaintance(
  entry: Entry,
  profile: CharacterProfile,
  templates: readonly CharacterTemplate[],
): { known: number; of: number } {
  const have = fieldsByName(entry);
  let known = 0;
  for (const q of interviewQuestions) {
    const field = q.fields.map((c) => have.get(dartToLowerCase(c))).find((f) => f !== undefined);
    if (field !== undefined && dartTrim(field.value).length > 0) known++;
  }
  return { known, of: known + interviewFor(entry, profile, templates).length };
}

/** Saves one answer into its field: the field the character has, or the one their section suggests, made now with the
 * answer. The same from the profile and from the cast card. */
export function saveInterviewAnswer(c: CharacterChanges, entryId: string, step: InterviewStep, value: string): void {
  if (step.fieldId !== null) {
    c.updateField(entryId, step.fieldId, { value });
    return;
  }
  // The section as it is stored now (found by name: an unstored profile's ids change on each read).
  const sections = c.profileOf(c.character(entryId)).sections;
  const section = sections.find((s) => s.name === step.sectionName);
  c.addField(entryId, section?.id ?? step.sectionId!, step.suggestion!, { value });
}

export const interviewWords = {
  done: 'Done',
  skip: 'Skip',
  next: 'Next',
  finish: 'Save and finish',
  answer: 'Answer',
  passedOver: 'Passed over',
  title: (name: string) => `Interview with ${name}`,
  /** Under the answer box, when no hint is given. */
  ownWords: (name: string) => `In ${name}’s own words`,
  /** Under the question now. */
  goesInto: (fieldName: string) => `Goes into ${fieldName}`,
  /** Under a reply. */
  wentInto: (fieldName: string) => `→ ${fieldName}`,
} as const;

/** One exchange of the conversation: the question, where its answer went, and the reply (null when it was passed
 * over). */
export type InterviewExchange = { ask: string; fieldName: string; reply: string | null };

/** The conversation's state: the questions (`interviewFor`, read when it opens), how many were known before, the
 * talk so far, the question now, and what Next saves. */
export class InterviewTalk {
  readonly said: InterviewExchange[] = [];
  at = 0;
  answered = 0;
  /** Whether the conversation has closed (after the last question). */
  closed = false;

  constructor(
    readonly steps: readonly InterviewStep[],
    /** The character's name as stored. */
    readonly entryName: string,
    /** Of the questions, how many the profile already answered before this conversation (`acquaintance().known`). */
    readonly known: number,
  ) {}

  static open(entry: Entry, profile: CharacterProfile, templates: readonly CharacterTemplate[]): InterviewTalk {
    return new InterviewTalk(interviewFor(entry, profile, templates), entry.name, acquaintance(entry, profile, templates).known);
  }

  get name(): string {
    return dartTrim(this.entryName).length === 0 ? 'them' : dartTrim(this.entryName);
  }

  /** The question now (the Flutter dialog opens only with questions to ask; null when there are none). */
  get step(): InterviewStep | null {
    return this.steps[this.at] ?? null;
  }

  get last(): boolean {
    return this.at + 1 >= this.steps.length;
  }

  /** The head: "Interview with Mira", and "Known 3 of 11" (or "In conversation" when nothing is to be known). */
  get title(): string {
    return interviewWords.title(this.name);
  }

  get gauge(): string {
    const total = this.known + this.steps.length;
    return total === 0 ? 'In conversation' : `Known ${this.known + this.answered} of ${total}`;
  }

  /** The progress bar: one mark a question, each 'done' (in the character's colour), 'now' (the primary colour) or
   * 'ahead' (the outline); and its words to a screen reader. */
  get progress(): { marks: ('done' | 'now' | 'ahead')[]; label: string } {
    return {
      marks: this.steps.map((_, i) => (i < this.at ? 'done' : i === this.at ? 'now' : 'ahead')),
      label: `Question ${this.at + 1} of ${this.steps.length}`,
    };
  }

  /** The answer box's hint. */
  get hint(): string {
    return this.step?.hint ?? interviewWords.ownWords(this.name);
  }

  /** The primary button: "Next", or "Save and finish" on the last; pressable only with an answer typed. */
  nextButton(typed: string): { label: string; icon: 'send' | 'check'; enabled: boolean } {
    return { label: this.last ? interviewWords.finish : interviewWords.next, icon: this.last ? 'check' : 'send', enabled: dartTrim(typed).length > 0 };
  }

  /** Beside the buttons, once something is saved: "One answer saved to the profile." / "2 answers saved…". */
  get savedNote(): string | null {
    if (this.answered === 0) return null;
    return `${this.answered === 1 ? 'One answer' : `${this.answered} answers`} saved to the profile.`;
  }

  /** Next (`keep`) or Skip: the answer to save, if any (`save` is given the step and the value as stored, and should
   * call `saveInterviewAnswer` in one change), then the next question, or the end. */
  next(keep: boolean, typed: string, save: (step: InterviewStep, value: string) => void): void {
    const step = this.step;
    if (step === null || this.closed) return;
    const reply = keep && dartTrim(typed).length > 0 ? dartTrim(typed) : null;
    if (reply !== null) {
      save(step, storedAnswer(step.type, typed));
      this.answered++;
    }
    if (this.at + 1 >= this.steps.length) {
      this.closed = true;
      return;
    }
    this.said.push({ ask: step.ask, fieldName: step.fieldName, reply });
    this.at++;
  }
}
