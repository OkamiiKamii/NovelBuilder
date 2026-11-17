// Text ordering that matches the original app's `localeCompare` (ICU root collation). A port of
// flutter_app/lib/shared/domain/collation.dart: the port itself is in ./exchange/collation.ts (complete: it is the
// whole of the Dart file), re-exported here where the Dart file sits.

export { localeCompare } from './exchange/collation';
