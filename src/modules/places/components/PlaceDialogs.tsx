import { useState } from 'react';
import { places } from '@/core';
import type { StoryModel } from '@/modules/model/types';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { Modal } from '@/shared/Modal';
import { LEVEL_PRESETS, MAP_IMAGE_LIMIT, type MapPin, type PlaceSettings, type WorldMap } from '../types';

const useNotice = () => {
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const act = (task: Promise<unknown>, done?: string) => void task.then(() => setNotice(done ? { text: done } : null), (e) => setNotice({ text: e instanceof Error ? e.message : String(e), error: true }));
  const shown = notice && (
    <p className={notice.error ? 'error' : 'notice'} role={notice.error ? 'alert' : 'status'}>
      {notice.text}
    </p>
  );
  return { act, shown };
};

/** The novel's levels of place, largest first: from a set to start with, or the author's own. A level some place has cannot be removed. */
export function LevelsDialog({ model, settings, onClose }: { model: StoryModel; settings: PlaceSettings | null; onClose: () => void }) {
  const api = places.forProject(model.project.id);
  const { act, shown } = useNotice();
  const [name, setName] = useState('');
  const levels = settings?.levels ?? [];
  const using = (id: string) => [...model.entries.values()].filter((e) => e.placeLevel === id).length;
  const move = (i: number, by: -1 | 1) => {
    const next = [...levels];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    act(api.setLevels(next));
  };
  return (
    <Modal title="Levels of place" onClose={onClose}>
      <div className="stack place-levels">
        <p className="muted small">How large each kind of place is in this novel, largest first: a universe, a planet, a city, a room, or your own. A place's level is set on it; nothing needs one.</p>
        {shown}
        <div className="chips" role="group" aria-label="Start from">
          {LEVEL_PRESETS.map((p) => (
            <button key={p.id} type="button" className="filter-chip" title={p.levels.join(', ')} onClick={() => act(api.applyPreset(p.id), levels.length ? `Added the levels of “${p.name}” that were missing.` : `Started from “${p.name}”.`)}>
              {levels.length ? `Add the levels of “${p.name}”` : `Start from “${p.name}”`}
            </button>
          ))}
        </div>
        {levels.length === 0 ? (
          <p className="muted">No levels yet.</p>
        ) : (
          <ol className="place-level-list" aria-label="Levels, largest first">
            {levels.map((level, i) => (
              <li key={level.id}>
                <input key={level.name} defaultValue={level.name} aria-label={`Level ${i + 1} name`} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== level.name && act(api.setLevels(levels.map((l) => (l.id === level.id ? { ...l, name: e.target.value } : l))))} />
                <span className="muted small">
                  {using(level.id)} {using(level.id) === 1 ? 'place' : 'places'}
                </span>
                <button type="button" className="tool" aria-label={`Move ${level.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" className="tool" aria-label={`Move ${level.name} down`} disabled={i === levels.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </button>
                <button type="button" className="tool" aria-label={`Remove ${level.name}`} onClick={() => act(api.setLevels(levels.filter((l) => l.id !== level.id)))}>
                  ✕
                </button>
              </li>
            ))}
          </ol>
        )}
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            act(api.setLevels([...levels, { name }]).then(() => setName('')));
          }}
        >
          <input value={name} placeholder="A level of your own, e.g. Sector" aria-label="New level" onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn" disabled={!name.trim()}>
            Add
          </button>
        </form>
      </div>
    </Modal>
  );
}

/** Reads an image the author chose from their device, as a data URL, with its size. Nothing is sent anywhere. */
const readImage = (file: File): Promise<{ url: string; width: number; height: number }> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Choose an image file.'));
    if (file.size > MAP_IMAGE_LIMIT) return reject(new Error(`That image is larger than ${MAP_IMAGE_LIMIT / 1024 / 1024} MB.`));
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      const img = new Image();
      img.onload = () => resolve({ url, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ url, width: 0, height: 0 });
      img.src = url;
    };
    reader.onerror = () => reject(reader.error ?? new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });

/** One map's settings: what it shows, its size and units, its grid and its background. */
function MapFields({ model, map, pins }: { model: StoryModel; map: WorldMap; pins: MapPin[] }) {
  const api = places.forProject(model.project.id);
  const { act, shown } = useNotice();
  const [removing, setRemoving] = useState(false);
  const placesList = [...model.entries.values()].filter((e) => e.category === 'location').sort((a, b) => a.name.localeCompare(b.name));
  const save = (input: Parameters<typeof api.saveMap>[1]) => act(api.saveMap(map.id, input));
  const count = pins.filter((p) => p.mapId === map.id).length;
  const num = (label: string, value: number, key: 'width' | 'height' | 'grid') => (
    <label className="field">
      <span>{label}</span>
      <input key={value} type="number" min={key === 'grid' ? 0 : undefined} step="any" defaultValue={value} aria-label={`${map.name}: ${label.toLowerCase()}`} onBlur={(e) => Number(e.target.value) !== value && save({ [key]: Number(e.target.value) })} />
    </label>
  );
  return (
    <li className="stack tight place-map-fields">
      <div className="grid-2 tight">
        <label className="field">
          <span>Name</span>
          <input key={map.name} defaultValue={map.name} aria-label={`Name of the map ${map.name}`} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== map.name && save({ name: e.target.value })} />
        </label>
        <label className="field">
          <span>A map of</span>
          <select aria-label={`What ${map.name} is a map of`} value={map.placeId ?? ''} onChange={(e) => save({ placeId: e.target.value || null })}>
            <option value="">The whole world</option>
            {placesList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {num('Width', map.width, 'width')}
        {num('Height', map.height, 'height')}
        <label className="field">
          <span>Unit</span>
          <input key={map.unit} defaultValue={map.unit} placeholder="leagues, km, squares…" aria-label={`${map.name}: unit`} onBlur={(e) => e.target.value.trim() !== map.unit && save({ unit: e.target.value })} />
        </label>
        {num('Grid every', map.grid, 'grid')}
      </div>
      <div className="toolbar">
        <label className="btn">
          {map.image ? 'Change the background image' : 'Choose a background image from this device'}
          <input
            type="file"
            accept="image/*"
            hidden
            aria-label={`Background image for ${map.name}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              act(
                readImage(file).then(async ({ url, width, height }) => {
                  await api.setImage(map.id, url);
                  // With nothing placed on it yet, the map takes the image's proportions, so the picture is not stretched.
                  if (!count && width && height) await api.saveMap(map.id, { height: Math.round(map.width * (height / width) * 100) / 100 });
                }),
                'Background image set. It stays in this novel, on this device.',
              );
            }}
          />
        </label>
        {map.image && (
          <button type="button" className="btn ghost" onClick={() => act(api.setImage(map.id, null), 'Background image removed.')}>
            Remove the image
          </button>
        )}
        <button type="button" className="btn ghost danger" onClick={() => setRemoving(true)}>
          Delete {map.name}
        </button>
      </div>
      {shown}
      {removing && (
        <ConfirmDialog
          title="Delete this map"
          confirmLabel="Delete the map"
          onCancel={() => setRemoving(false)}
          onConfirm={() => {
            setRemoving(false);
            act(api.removeMap(map.id));
          }}
        >
          <p>
            Delete the map “{map.name}” and its {count} {count === 1 ? 'pin' : 'pins'}? The places themselves are kept, in the tree and on any other map.
          </p>
        </ConfirmDialog>
      )}
    </li>
  );
}

/** The novel's maps: each of the whole world or of one place, over a grid or an image from the author's device. */
export function MapsDialog({ model, maps, pins, onClose }: { model: StoryModel; maps: WorldMap[]; pins: MapPin[]; onClose: () => void }) {
  const api = places.forProject(model.project.id);
  const { act, shown } = useNotice();
  const [name, setName] = useState('');
  return (
    <Modal title="Maps" onClose={onClose}>
      <div className="stack place-maps">
        <p className="muted small">A map is optional: every place is in the tree whether it has coordinates or not. A map is drawn over a grid, or over an image you choose from this device; it stays in this novel and is never sent anywhere. Coordinates are in the map's own units, across from the left and down from the top.</p>
        {shown}
        {maps.length === 0 ? (
          <p className="muted">No maps yet.</p>
        ) : (
          <ul className="place-map-list" aria-label="Maps">
            {maps.map((m) => (
              <MapFields key={m.id} model={model} map={m} pins={pins} />
            ))}
          </ul>
        )}
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            act(api.saveMap(null, { name }).then(() => setName('')), `Made the map “${name.trim()}”.`);
          }}
        >
          <input value={name} placeholder="A new map, e.g. The Known World" aria-label="New map name" onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn" disabled={!name.trim()}>
            Make the map
          </button>
        </form>
      </div>
    </Modal>
  );
}
