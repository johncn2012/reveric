// 职责: 把已有的 reveric.sqlite 复制成 metaarc.sqlite，并在支持目录换标识时带走同一份库。
// 关联文件:
//   lib/shared/brand/identifiers.dart
//   lib/shared/database/app_database.dart
//   lib/shared/services/backup_service.dart
// 遵循的 Rules:
//   .agents/rules/file-access.md
//   .agents/rules/error-handling.md
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;

import '../brand/identifiers.dart';
import '../logger/app_logger.dart';

final _log = AppLogger.forModule('DatabaseFile');

/// 返回当前支持目录里的主库路径。新文件不存在时，从同目录或对应的旧支持目录复制一份。
///
/// 不删除旧文件。复制失败会抛出，避免在旧库还在时另开一个空库。
Future<String> ensureAppDatabasePath(
  Directory support, {
  Iterable<String>? legacyDirectoryNames,
}) async {
  if (!await support.exists()) {
    await support.create(recursive: true);
  }
  final current = File(p.join(support.path, appDatabaseFileName));
  if (await current.exists()) {
    return current.path;
  }
  final legacy = File(p.join(support.path, legacyAppDatabaseFileName));
  if (await legacy.exists()) {
    await _copySqliteFamily(legacy, current);
    return current.path;
  }
  final migrated = await _legacySupportWithDatabase(
    support,
    legacyDirectoryNames ?? _legacySupportNames(),
  );
  if (migrated == null) {
    return current.path;
  }
  await _copyMissingTree(migrated, support);
  final legacyDb = File(p.join(migrated.path, legacyAppDatabaseFileName));
  final already = File(p.join(migrated.path, appDatabaseFileName));
  final File source;
  if (await legacyDb.exists()) {
    source = legacyDb;
  } else if (await already.exists()) {
    source = already;
  } else {
    throw StateError('Legacy support directory has no application database');
  }
  await _copySqliteFamily(source, current);
  _log.info('migrated application support data into the current directory');
  return current.path;
}

/// 备份解压目录是临时副本。把旧文件名改成当前文件名，用户的压缩包本身不动。
Future<void> normalizeExtractedAppDatabase(Directory directory) async {
  normalizeExtractedAppDatabaseSync(directory);
}

void normalizeExtractedAppDatabaseSync(Directory directory) {
  final current = File(p.join(directory.path, appDatabaseFileName));
  final legacy = File(p.join(directory.path, legacyAppDatabaseFileName));
  if (current.existsSync() || !legacy.existsSync()) {
    return;
  }
  legacy.renameSync(current.path);
  final wal = File('${legacy.path}-wal');
  if (wal.existsSync()) {
    wal.renameSync('${current.path}-wal');
  }
}

/// 读取已经存在的主库，新旧文件名都认。没有库时返回 null。
String? existingAppDatabasePath(String directoryPath) {
  final current = p.join(directoryPath, appDatabaseFileName);
  if (File(current).existsSync()) {
    return current;
  }
  final legacy = p.join(directoryPath, legacyAppDatabaseFileName);
  if (File(legacy).existsSync()) {
    return legacy;
  }
  return null;
}

List<String> _legacySupportNames() {
  if (kDebugMode) {
    return const [legacyDebugApplicationId, 'reveric.debug'];
  }
  return const [legacyApplicationId, 'reveric'];
}

Future<Directory?> _legacySupportWithDatabase(
  Directory current,
  Iterable<String> names,
) async {
  final candidates = <String>[];
  for (final name in names) {
    candidates.add(p.join(current.parent.path, name));
  }
  final roaming = current.parent.parent.path;
  final product = p.basename(current.path);
  for (final company in names) {
    candidates.add(p.join(roaming, company, product));
    if (product != 'MetaArc') {
      candidates.add(p.join(roaming, company, 'MetaArc'));
    }
  }
  final seen = <String>{};
  for (final path in candidates) {
    final normalized = p.normalize(path);
    if (!seen.add(normalized) ||
        normalized == p.normalize(current.path)) {
      continue;
    }
    final directory = Directory(normalized);
    if (await _directoryHasDatabase(directory)) {
      return directory;
    }
  }
  return null;
}

Future<bool> _directoryHasDatabase(Directory directory) async {
  try {
    if (!await directory.exists()) {
      return false;
    }
    return await File(p.join(directory.path, appDatabaseFileName)).exists() ||
        await File(
          p.join(directory.path, legacyAppDatabaseFileName),
        ).exists();
  } on FileSystemException {
    // Android and iOS cannot stat another app container. That probe is a miss.
    return false;
  }
}

Future<void> _copyMissingTree(Directory from, Directory to) async {
  await to.create(recursive: true);
  await for (final entity in from.list(followLinks: false)) {
    final name = p.basename(entity.path);
    if (_isDatabaseFamilyName(name)) {
      continue;
    }
    if (entity is Link) {
      _log.warning(
        'Skipped symbolic link while migrating support data name=$name',
      );
      continue;
    }
    final targetPath = p.join(to.path, name);
    if (entity is Directory) {
      await _copyMissingTree(entity, Directory(targetPath));
    } else if (entity is File) {
      final target = File(targetPath);
      if (await target.exists()) {
        continue;
      }
      await entity.copy(target.path);
    }
  }
}

bool _isDatabaseFamilyName(String name) {
  for (final base in [appDatabaseFileName, legacyAppDatabaseFileName]) {
    if (name == base ||
        name == '$base-wal' ||
        name == '$base-shm' ||
        name == '$base-journal') {
      return true;
    }
  }
  return false;
}

Future<void> _copySqliteFamily(File source, File dest) async {
  final leftoverWal = File('${dest.path}-wal');
  if (await leftoverWal.exists()) {
    await leftoverWal.delete();
  }
  final staging = File('${dest.path}.migrating');
  final walStaging = File('${dest.path}-wal.migrating');
  if (await staging.exists()) {
    await staging.delete();
  }
  await source.copy(staging.path);
  final sourceWal = File('${source.path}-wal');
  final hasWal = await sourceWal.exists();
  try {
    if (hasWal) {
      if (await walStaging.exists()) {
        await walStaging.delete();
      }
      await sourceWal.copy(walStaging.path);
    }
    if (hasWal) {
      await walStaging.rename('${dest.path}-wal');
    }
    await staging.rename(dest.path);
  } catch (error, stackTrace) {
    _log.error(
      'application database copy failed',
      error: error,
      stackTrace: stackTrace,
    );
    if (await staging.exists()) {
      await staging.delete();
    }
    if (await walStaging.exists()) {
      await walStaging.delete();
    }
    if (await dest.exists()) {
      await dest.delete();
    }
    if (await leftoverWal.exists()) {
      await leftoverWal.delete();
    }
    rethrow;
  }
  _log.info(
    'copied legacy application database to ${p.basename(dest.path)}',
  );
}
