import { useRef, useState } from 'react';
import { AppearanceControls } from '@/modules/manuscript/components/AppearanceMenu';
import { setPrefs, usePrefs } from '@/modules/manuscript/preferences';
import { FORMS, FORM_LABELS, INPUT_LABELS, device, useDevice, type Form } from '@/modules/platform/device';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { downloadBlob, fileSlug } from '@/shared/download';
import { useSwitchMode } from './Dock';
import { ACTIONS, ACTION_LABELS, comboOf, displayCombo, isUsable, type ActionId } from './shortcuts';
import { CENTERS, CENTER_LABELS, MODES, MODE_HINTS, MODE_LABELS, PANELS, PANEL_LABELS, PRESETS, WIDTH, studio, useStudio, type Center, type Mode, type Panel, type Slot } from './store';

export function StudioPage() {
  const project = useCurrentProject();
  const { mode, layout, own, shortcuts } = useStudio(project.id);
  const prefs = usePrefs();
  const dev = useDevice();
  const switchMode = useSwitchMode(project.id);
  const file = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [capturing, setCapturing] = useState<ActionId | null>(null);

  const SLOT_NAMES: Record<Slot, [string, string]> = { left: ['Left of pages', 'left panel on pages'], right: ['Right of pages', 'right panel on pages'], writeLeft: ['Left of the manuscript', 'left panel while writing'], writeRight: ['Right of the manuscript', 'right panel while writing'] };
  const side = (target: Mode, which: Slot) => {
    const dock = layout[target][which];
    const name = `${MODE_LABELS[target]}: ${SLOT_NAMES[which][1]}`;
    return (
      <div className="sys-row">
        <label className="inline">
          {SLOT_NAMES[which][0]}
          <select value={dock.kind} aria-label={`${name} shows`} onChange={(e) => studio.updateDock(project.id, target, which, { kind: e.target.value as Panel })}>
            {PANELS.map((panel) => (
              <option key={panel} value={panel}>
                {PANEL_LABELS[panel]}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={dock.open} aria-label={`${name} is open`} onChange={(e) => studio.updateDock(project.id, target, which, { open: e.target.checked })} />
          Open
        </label>
        <label className="inline">
          Width
          <input type="range" min={WIDTH.min} max={WIDTH.max} step={4} value={dock.width} aria-label={`${name} width`} onChange={(e) => studio.updateDock(project.id, target, which, { width: Number(e.target.value) })} />
          <span className="muted small">{dock.width}px</span>
        </label>
      </div>
    );
  };

  return (
    <div className="stack studio-page">
      <header className="page-header">
        <div>
          <h1>Workspace</h1>
          <p className="muted" role="status">
            {MODE_LABELS[mode]} workspace · {FORM_LABELS[dev.form]} layout · {own ? `a layout of this project's own` : 'your layout for every project'}
          </p>
        </div>
      </header>

      <section className="panel stack" aria-label="This device">
        <h2>This device</h2>
        <dl className="device-facts">
          <div>
            <dt>Interface</dt>
            <dd>
              {FORM_LABELS[dev.form]}
              {dev.override ? ` (chosen; detected ${FORM_LABELS[dev.detected]})` : ' (detected)'}
            </dd>
          </div>
          <div>
            <dt>Input</dt>
            <dd>{INPUT_LABELS[dev.input]}</dd>
          </div>
        </dl>
        <p className="muted small">
          Desktop, tablet and phone each keep their own workspace layout, active workspace and editor appearance. Everything on this page changes the {FORM_LABELS[dev.form].toLowerCase()} layout only: arranging panels here can never rearrange them on
          another kind of device. Your writing, lore and plans are the same everywhere.
        </p>
        <div className="sys-row">
          <label className="inline">
            Interface on this device
            <select value={dev.override ?? ''} aria-label="Interface on this device" onChange={(e) => device.setOverride((e.target.value || null) as Form | null)}>
              <option value="">Detect automatically</option>
              {FORMS.map((form) => (
                <option key={form} value={form}>
                  {FORM_LABELS[form]}
                </option>
              ))}
            </select>
          </label>
          {FORMS.filter((form) => form !== dev.form).map((form) => (
            <button
              key={form}
              type="button"
              className="btn"
              onClick={() => {
                studio.copyFrom(project.id, form);
                setNotice({ text: `The ${FORM_LABELS[dev.form].toLowerCase()} layout is now a copy of the ${FORM_LABELS[form].toLowerCase()} one. The ${FORM_LABELS[form].toLowerCase()} layout itself is unchanged.` });
              }}
            >
              Copy the {FORM_LABELS[form].toLowerCase()} layout here
            </button>
          ))}
        </div>
      </section>

      {notice && (
        <p className={notice.error ? 'notice error' : 'notice'} role={notice.error ? 'alert' : 'status'}>
          {notice.text}
          <button type="button" className="btn ghost icon" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}

      <section className="panel" aria-label="Presets">
        <h2>Start from a preset</h2>
        <ul className="preset-grid">
          {PRESETS.map((preset) => (
            <li key={preset.id} className="panel">
              <strong>{preset.name}</strong>
              <p className="muted small">{preset.description}</p>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  studio.applyPreset(project.id, preset.id);
                  setPrefs({ focus: false });
                  setNotice({ text: `${preset.name} applied. It opens in the ${MODE_LABELS[preset.start]} workspace; every part of it can be changed below.` });
                }}
              >
                Use {preset.name}
              </button>
            </li>
          ))}
          <li className="panel">
            <strong>Standard</strong>
            <p className="muted small">The layout the app starts with.</p>
            <button type="button" className="btn" onClick={() => (studio.applyPreset(project.id, 'standard'), setNotice({ text: 'Back to the standard layout.' }))}>
              Reset to Standard
            </button>
          </li>
        </ul>
      </section>

      <section className="panel" aria-label="Workspaces">
        <h2>The four workspaces</h2>
        <p className="muted small">Each workspace has its own centre and side panels. Switch with the tabs above any page, or with a shortcut. Panels can also be resized by dragging their edge, and swapped by dragging one onto the other.</p>
        {MODES.map((target) => (
          <fieldset key={target} className="plan-group mode-card" aria-label={`${MODE_LABELS[target]} workspace`}>
            <legend>{MODE_LABELS[target]}</legend>
            <p className="muted small">{MODE_HINTS[target]}</p>
            <div className="sys-row">
              <label className="inline">
                Centre
                <select value={layout[target].center} aria-label={`${MODE_LABELS[target]}: centre shows`} onChange={(e) => studio.updateMode(project.id, target, { center: e.target.value as Center })}>
                  {CENTERS.map((center) => (
                    <option key={center} value={center}>
                      {CENTER_LABELS[center]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={layout[target].focus} aria-label={`${MODE_LABELS[target]}: distraction-free`} onChange={(e) => studio.updateMode(project.id, target, { focus: e.target.checked })} />
                Distraction-free
              </label>
              <label className="check">
                <input type="checkbox" checked={layout[target].goalBar} aria-label={`${MODE_LABELS[target]}: goal bar`} onChange={(e) => studio.updateMode(project.id, target, { goalBar: e.target.checked })} />
                Word-count goal bar
              </label>
              <button type="button" className="btn" disabled={mode === target} onClick={() => switchMode(target)}>
                {mode === target ? 'Active' : `Open ${MODE_LABELS[target]}`}
              </button>
            </div>
            {side(target, 'writeLeft')}
            {side(target, 'writeRight')}
            {side(target, 'left')}
            {side(target, 'right')}
          </fieldset>
        ))}
      </section>

      <section className="panel" aria-label="Where this layout is saved">
        <h2>Where this layout is saved</h2>
        <label className="check wrap">
          <input type="checkbox" checked={own} onChange={(e) => studio.setScope(project.id, e.target.checked ? 'project' : 'global')} />
          Give “{project.title}” a layout of its own
        </label>
        <p className="muted small">
          {own ? 'Changes here apply to this project only. Untick to return it to your layout for every project.' : 'Changes here apply to every project that does not have a layout of its own.'} Layouts, shortcuts and editor appearance are kept on this device and survive closing the app.
        </p>
        <div className="actions start wrap">
          <button type="button" className="btn" onClick={() => downloadBlob(new Blob([studio.exportConfig(project.id)], { type: 'application/json' }), `${fileSlug(project.title)}-workspace.json`)}>
            Export layout
          </button>
          <button type="button" className="btn" onClick={() => file.current?.click()}>
            Import layout…
          </button>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="Layout file"
            onChange={async (e) => {
              const chosen = e.target.files?.[0];
              e.target.value = '';
              if (!chosen) return;
              try {
                studio.importConfig(project.id, await chosen.text());
                setNotice({ text: 'Layout imported.' });
              } catch (err) {
                setNotice({ text: err instanceof Error ? err.message : 'That file could not be read.', error: true });
              }
            }}
          />
        </div>
      </section>

      <section className="panel" aria-label="Keyboard shortcuts">
        <h2>Keyboard shortcuts</h2>
        <table className="shortcut-table">
          <tbody>
            {ACTIONS.map((action) => (
              <tr key={action}>
                <th scope="row">{ACTION_LABELS[action]}</th>
                <td>
                  {capturing === action ? (
                    <input
                      autoFocus
                      readOnly
                      value=""
                      placeholder="Press the keys…"
                      aria-label={`New shortcut for ${ACTION_LABELS[action]}`}
                      onBlur={() => setCapturing(null)}
                      onKeyDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.key === 'Escape') return setCapturing(null);
                        const combo = comboOf(e.nativeEvent);
                        if (!combo) return;
                        if (!isUsable(combo)) return setNotice({ text: `${displayCombo(combo)} would get in the way of typing. Use a combination with ${displayCombo('Mod')} or ${displayCombo('Alt')}.`, error: true });
                        const taken = ACTIONS.find((other) => other !== action && shortcuts[other] === combo);
                        studio.setShortcut(action, combo);
                        setNotice(taken ? { text: `${displayCombo(combo)} now does “${ACTION_LABELS[action]}”. “${ACTION_LABELS[taken]}” has no shortcut.` } : null);
                        setCapturing(null);
                      }}
                    />
                  ) : (
                    <kbd>{displayCombo(shortcuts[action])}</kbd>
                  )}
                </td>
                <td>
                  <button type="button" className="btn" aria-label={`Change the shortcut for ${ACTION_LABELS[action]}`} onClick={() => setCapturing(action)}>
                    Change
                  </button>{' '}
                  {shortcuts[action] && (
                    <button type="button" className="btn ghost" aria-label={`Remove the shortcut for ${ACTION_LABELS[action]}`} onClick={() => studio.setShortcut(action, '')}>
                      Clear
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="actions start">
          <button type="button" className="btn" onClick={() => studio.resetShortcuts()}>
            Reset shortcuts
          </button>
        </div>
      </section>

      <section className="panel" aria-label="Editor appearance">
        <h2>Editor appearance</h2>
        <p className="muted small">How the page looks while you write. These follow you to every project.</p>
        <div className="grid-2">
          <div className="stack">
            <AppearanceControls prefs={prefs} />
          </div>
        </div>
      </section>
    </div>
  );
}
