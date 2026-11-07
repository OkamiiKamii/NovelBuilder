import { useEffect, useState } from 'react';
import { ensurePersistence, storageInfo, type StorageInfo } from '@/core/storage';
import { useOnline } from './useOnline';

const size = (bytes: number) => (bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`);

/** Tells the writer where their work lives and whether the browser is allowed to clear it. */
export function StorageStatus() {
  const online = useOnline();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const refresh = () => void storageInfo().then(setInfo);
  useEffect(refresh, []);
  if (!info) return null;

  return (
    <p className="storage-status muted small">
      <span className={`dot ${info.persisted ? 'ok' : 'warn'}`} aria-hidden="true" />
      Your work is saved on this device and works offline{online ? '' : ' (you are offline now)'}.
      {info.usage !== null && ` Using ${size(info.usage)}.`}{' '}
      {info.persisted ? (
        'Protected from automatic browser cleanup.'
      ) : (
        <>
          The browser may clear it if the disk runs low.{' '}
          <button type="button" className="link" onClick={() => void ensurePersistence().then(refresh)}>
            Protect it
          </button>{' '}
          and keep backup files of anything important.
        </>
      )}
    </p>
  );
}
