import { Capacitor } from '@capacitor/core';

/** Running as the installed Android app (rather than in a browser). */
export const isAndroidApp = (): boolean => Capacitor.isNativePlatform();
/** Running as the installed desktop app. Its pages are served to itself under `app://`. */
export const isDesktopApp = (): boolean => typeof window !== 'undefined' && window.location.protocol === 'app:';
/** Running as an installed app of either kind: everything it needs is already on the device. */
export const isInstalledApp = (): boolean => isAndroidApp() || isDesktopApp();
