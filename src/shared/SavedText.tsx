import { useCallback, useEffect, useRef, useState } from 'react';

interface SavedTextProps {
  label: string;
  value: string;
  onSave: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
  /** Keep the label for screen readers but do not show it. */
  hideLabel?: boolean;
}

/**
 * A text field that saves itself shortly after typing stops, and immediately
 * on blur, unmount or page close. Give it a `key` tied to the record it edits.
 */
export function SavedText({ label, value, onSave, multiline, rows = 4, placeholder, className = '', hideLabel }: SavedTextProps) {
  const [text, setText] = useState(value);
  const pending = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const save = useRef(onSave);
  save.current = onSave;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (pending.current === null) return;
    const next = pending.current;
    pending.current = null;
    save.current(next);
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  // Pick up changes made elsewhere, but never while the writer is mid-edit.
  useEffect(() => {
    if (pending.current === null) setText(value);
  }, [value]);

  const props = {
    value: text,
    placeholder,
    'aria-label': label,
    onBlur: flush,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setText(e.target.value);
      pending.current = e.target.value;
      clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 600);
    },
  };

  return (
    <label className={`field ${className}`}>
      {!hideLabel && <span>{label}</span>}
      {multiline ? <textarea rows={rows} {...props} /> : <input {...props} />}
    </label>
  );
}
