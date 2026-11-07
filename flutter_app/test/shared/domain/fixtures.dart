import 'dart:convert';
import 'dart:io';

import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

/// Real `.novel.json` files made by the original app. Test content only: never shown in the app's library.
const fixtureNames = ['qa-sample', 'made-in-the-app'];

Object? fixtureJson(String name) => jsonDecode(File('test/fixtures/$name.novel.json').readAsStringSync());

NovelSnapshot loadFixture(String name) => NovelSnapshot.fromJson(fixtureJson(name));
