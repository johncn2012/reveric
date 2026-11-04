// 职责: 验证主库文件名迁移会复制旧库，且不会覆盖已经存在的新库。
// 关联文件:
//   lib/shared/database/database_file.dart
//   lib/shared/brand/identifiers.dart
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:reveric/shared/brand/identifiers.dart';
import 'package:reveric/shared/database/database_file.dart';

void main() {
  test('copies the legacy database in the same directory and keeps it', () async {
    final root = await Directory.systemTemp.createTemp('metaarc-db-');
    addTearDown(() => root.delete(recursive: true));
    final legacy = File(p.join(root.path, legacyAppDatabaseFileName));
    await legacy.writeAsString('old-db');
    await File('${legacy.path}-wal').writeAsString('old-wal');

    final path = await ensureAppDatabasePath(
      root,
      legacyDirectoryNames: const ['ai.reveric'],
    );

    expect(p.basename(path), appDatabaseFileName);
    expect(await File(path).readAsString(), 'old-db');
    expect(await File('$path-wal').readAsString(), 'old-wal');
    expect(await legacy.readAsString(), 'old-db');

    await File(path).writeAsString('current-db');
    final again = await ensureAppDatabasePath(
      root,
      legacyDirectoryNames: const ['ai.reveric'],
    );
    expect(await File(again).readAsString(), 'current-db');
  });

  test('copies a legacy support directory when the current one is empty', () async {
    final parent = await Directory.systemTemp.createTemp('metaarc-support-');
    addTearDown(() => parent.delete(recursive: true));
    final legacy = Directory(p.join(parent.path, 'ai.reveric'));
    await legacy.create();
    await File(p.join(legacy.path, legacyAppDatabaseFileName)).writeAsString(
      'sibling-db',
    );
    await Directory(p.join(legacy.path, 'avatars')).create();
    await File(p.join(legacy.path, 'avatars', 'a.png')).writeAsString('png');
    final current = Directory(p.join(parent.path, 'cn.metaarc'));

    final path = await ensureAppDatabasePath(
      current,
      legacyDirectoryNames: const ['ai.reveric'],
    );

    expect(await File(path).readAsString(), 'sibling-db');
    expect(
      await File(p.join(current.path, 'avatars', 'a.png')).readAsString(),
      'png',
    );
    expect(
      await File(p.join(legacy.path, legacyAppDatabaseFileName)).readAsString(),
      'sibling-db',
    );
  });

  test('renames a legacy database inside a backup extract', () async {
    final root = await Directory.systemTemp.createTemp('metaarc-extract-');
    addTearDown(() => root.delete(recursive: true));
    final legacy = File(p.join(root.path, legacyAppDatabaseFileName));
    await legacy.writeAsString('backup-db');
    await File('${legacy.path}-wal').writeAsString('backup-wal');

    normalizeExtractedAppDatabaseSync(root);

    expect(legacy.existsSync(), isFalse);
    expect(
      await File(p.join(root.path, appDatabaseFileName)).readAsString(),
      'backup-db',
    );
    expect(
      await File(p.join(root.path, '$appDatabaseFileName-wal')).readAsString(),
      'backup-wal',
    );
  });
}
