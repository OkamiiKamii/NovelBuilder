import 'package:integration_test/integration_test_driver.dart';

/// Runs an integration test with `flutter drive` (for profile-mode measurements) and writes what it reports to
/// `build/integration_response_data.json`.
Future<void> main() => integrationDriver();
