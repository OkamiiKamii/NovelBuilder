import { FONT_SIZE, FONTS, LINE_HEIGHT, PARAGRAPH_SPACING, setPrefs, THEMES, WIDTHS, type WritingPrefs } from '../preferences';

const LABELS: Record<string, string> = {
  light: 'Light',
  sepia: 'Sepia',
  dark: 'Dark',
  focus: 'Focus',
  serif: 'Serif',
  sans: 'Sans',
  mono: 'Mono',
  narrow: 'Narrow',
  medium: 'Medium',
  wide: 'Wide',
  full: 'Full',
};

function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button key={option} type="button" className={option === value ? 'active' : ''} aria-pressed={option === value} onClick={() => onChange(option)}>
            {LABELS[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The controls for how the page looks while writing. Used in the editor's menu and on the Workspace page. */
export function AppearanceControls({ prefs }: { prefs: WritingPrefs }) {
  return (
    <>
      <Segmented label="Theme" options={THEMES} value={prefs.theme} onChange={(theme) => setPrefs({ theme })} />
      <Segmented label="Font" options={FONTS} value={prefs.font} onChange={(font) => setPrefs({ font })} />
      <label className="field">
        <span>Font size — {prefs.fontSize}px</span>
        <input type="range" {...FONT_SIZE} value={prefs.fontSize} onChange={(e) => setPrefs({ fontSize: Number(e.target.value) })} />
      </label>
      <label className="field">
        <span>Line spacing — {prefs.lineHeight.toFixed(1)}</span>
        <input type="range" {...LINE_HEIGHT} value={prefs.lineHeight} onChange={(e) => setPrefs({ lineHeight: Number(e.target.value) })} />
      </label>
      <label className="field">
        <span>Paragraph spacing — {prefs.paragraphSpacing.toFixed(1)}</span>
        <input type="range" {...PARAGRAPH_SPACING} value={prefs.paragraphSpacing} onChange={(e) => setPrefs({ paragraphSpacing: Number(e.target.value) })} />
      </label>
      <Segmented label="Column width" options={WIDTHS} value={prefs.width} onChange={(width) => setPrefs({ width })} />
    </>
  );
}

export function AppearanceMenu({ prefs, onClose }: { prefs: WritingPrefs; onClose: () => void }) {
  return (
    <>
      <div className="popover-backdrop" onClick={onClose} />
      <div
        className="popover stack"
        role="dialog"
        aria-label="Appearance"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <AppearanceControls prefs={prefs} />
      </div>
    </>
  );
}
