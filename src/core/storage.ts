import { isInstalledApp } from '@/shared/platform';
/**
 * Everything the app stores lives in this browser profile on this device.
 * Browsers may clear such data when the disk runs low unless the site has
 * been granted "persistent" storage, so we ask for it.
 */
export interface StorageInfo {
  persisted: boolean;
  usage: number | null;
  quota: number | null;
}

let granted = false;

/** Asks the browser not to evict our data. Safe to call often; resolves to whether it is protected. */
export async function ensurePersistence(): Promise<boolean> {
  if (granted) return true;
  try {
    granted = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false;
  } catch {
    granted = false;
  }
  return granted;
}

export async function storageInfo(): Promise<StorageInfo> {
  try {
    const [persisted, estimate] = await Promise.all([navigator.storage?.persisted?.() ?? false, navigator.storage?.estimate?.() ?? {}]);
    return { persisted, usage: estimate.usage ?? null, quota: estimate.quota ?? null };
  } catch {
    return { persisted: false, usage: null, quota: null };
  }
}

/** Makes the app itself load without a network (production builds only; see vite.config.ts). */
export function registerServiceWorker(): void {
  // An installed app carries its own files; only a browser needs them stored for offline use.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || isInstalledApp()) return;
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
