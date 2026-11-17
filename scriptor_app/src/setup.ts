// Runs once, before anything else: record ids from the device's own random UUIDs, and uncaught errors kept in the
// in-memory ErrorLog (never written or sent; FEATURES.md #12). In development the usual red screen still shows.

import { randomUUID } from 'expo-crypto';

import { ErrorLog } from './data/errorLog';
import { setIdGenerator } from './domain/ids';

setIdGenerator(randomUUID);

type ErrorUtilsLike = {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
};

const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
if (errorUtils) {
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    ErrorLog.instance.record(error, isFatal ? 'fatal' : 'uncaught');
    if (__DEV__ || isFatal) previous(error, isFatal);
  });
}
