// 职责: 把内置插件的旧 id 改成 metaarc.*，并带走登记、私有库和安装记录。
// 关联文件:
//   lib/shared/brand/identifiers.dart
//   lib/shared/database/app_database.dart
//   lib/shared/services/plugins/host.dart
// 遵循的 Rules:
//   .agents/rules/error-handling.md
import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart';
import 'package:path/path.dart' as p;

import '../../brand/identifiers.dart';
import '../../database/app_database.dart';
import '../../logger/app_logger.dart';

final _log = AppLogger.forModule('PluginLegacyIds');

const _pluginIdTables = <String>[
  'plugin_registry',
  'plugin_permissions',
  'plugin_storage',
  'plugin_secrets',
  'plugin_tasks',
];

/// 没有旧 id 时不访问支持目录，避免测试里的插件宿主去要 path_provider。
Future<void> migrateBundledPluginIds({
  required AppDatabase database,
  required Future<Directory> Function() support,
}) async {
  final pending = <MapEntry<String, String>>[];
  for (final entry in bundledPluginIdAliases.entries) {
    final rows = await database
        .customSelect(
          'SELECT plugin_id FROM plugin_registry WHERE plugin_id = ? LIMIT 1',
          variables: [Variable.string(entry.key)],
        )
        .get();
    if (rows.isNotEmpty) {
      pending.add(entry);
    }
  }
  if (pending.isEmpty) {
    return;
  }
  final root = await support();
  for (final entry in pending) {
    await _migrateOne(
      database: database,
      support: root,
      from: entry.key,
      to: entry.value,
    );
  }
}

Future<void> _migrateOne({
  required AppDatabase database,
  required Directory support,
  required String from,
  required String to,
}) async {
  final occupied = await database
      .customSelect(
        'SELECT plugin_id FROM plugin_registry WHERE plugin_id = ? LIMIT 1',
        variables: [Variable.string(to)],
      )
      .get();
  if (occupied.isNotEmpty) {
    _log.warning(
      'Skipped plugin id migration because the new id already exists from=$from to=$to',
    );
    return;
  }
  await _movePluginDirectory(
    Directory(p.join(support.path, 'plugins', from)),
    Directory(p.join(support.path, 'plugins', to)),
  );
  await _movePluginDirectory(
    Directory(p.join(support.path, 'plugin_data', from)),
    Directory(p.join(support.path, 'plugin_data', to)),
  );
  await _rewriteManifests(Directory(p.join(support.path, 'plugins', to)), to);
  try {
    await database.transaction(() async {
      final rows = await database
          .customSelect(
            'SELECT package_path FROM plugin_registry WHERE plugin_id = ?',
            variables: [Variable.string(from)],
          )
          .get();
      for (final row in rows) {
        final packagePath = row.read<String>('package_path');
        final prefix = 'plugins/$from/';
        if (!packagePath.startsWith(prefix)) {
          continue;
        }
        final next = 'plugins/$to/${packagePath.substring(prefix.length)}';
        await _update(
          database,
          'UPDATE plugin_registry SET package_path = ? WHERE plugin_id = ? AND package_path = ?',
          [
            Variable.string(next),
            Variable.string(from),
            Variable.string(packagePath),
          ],
          'plugin_registry',
        );
      }
      for (final table in _pluginIdTables) {
        await _update(
          database,
          'UPDATE $table SET plugin_id = ? WHERE plugin_id = ?',
          [Variable.string(to), Variable.string(from)],
          table,
        );
      }
      await _rewriteInstallRecord(database, from, to);
    });
  } catch (error, stackTrace) {
    _log.error(
      '[DB] UPDATE plugin id migration from=$from to=$to',
      error: error,
      stackTrace: stackTrace,
    );
    rethrow;
  }
}

Future<void> _update(
  AppDatabase database,
  String sql,
  List<Variable<Object>> variables,
  String table,
) async {
  try {
    await database.customUpdate(sql, variables: variables);
  } catch (error, stackTrace) {
    _log.error(
      '[DB] UPDATE $table plugin id migration',
      error: error,
      stackTrace: stackTrace,
    );
    rethrow;
  }
}

Future<void> _rewriteInstallRecord(
  AppDatabase database,
  String from,
  String to,
) async {
  final key = 'plugin_install.$from';
  final rows = await database
      .customSelect(
        'SELECT value FROM app_states WHERE key = ?',
        variables: [Variable.string(key)],
      )
      .get();
  if (rows.isEmpty) {
    return;
  }
  final nextKey = 'plugin_install.$to';
  final taken = await database
      .customSelect(
        'SELECT key FROM app_states WHERE key = ? LIMIT 1',
        variables: [Variable.string(nextKey)],
      )
      .get();
  if (taken.isNotEmpty) {
    _log.warning('Skipped plugin install record rename because $nextKey exists');
    return;
  }
  final decoded = jsonDecode(rows.single.read<String>('value'));
  if (decoded is Map<String, dynamic> && decoded['pluginId'] == from) {
    decoded['pluginId'] = to;
  }
  final encoded = decoded is Map<String, dynamic>
      ? jsonEncode(decoded)
      : rows.single.read<String>('value');
  await _update(
    database,
    'UPDATE app_states SET key = ?, value = ? WHERE key = ?',
    [Variable.string(nextKey), Variable.string(encoded), Variable.string(key)],
    'app_states',
  );
}

Future<void> _movePluginDirectory(Directory from, Directory to) async {
  if (!await from.exists()) {
    return;
  }
  if (await to.exists()) {
    throw StateError(
      'Refusing to replace plugin directory name=${p.basename(to.path)}',
    );
  }
  await to.parent.create(recursive: true);
  await from.rename(to.path);
}

Future<void> _rewriteManifests(Directory root, String id) async {
  if (!await root.exists()) {
    return;
  }
  await for (final entity in root.list(recursive: true, followLinks: false)) {
    if (entity is! File || p.basename(entity.path) != 'plugin.json') {
      continue;
    }
    final decoded = jsonDecode(await entity.readAsString());
    if (decoded is! Map<String, dynamic>) {
      continue;
    }
    decoded['id'] = id;
    _rewriteProtocols(decoded);
    await entity.writeAsString(jsonEncode(decoded));
  }
}

void _rewriteProtocols(Object? node) {
  if (node is Map) {
    if (node['protocol'] == legacyPluginTsxProtocol) {
      node['protocol'] = pluginTsxProtocol;
    } else if (node['protocol'] == legacyPluginUiProtocol) {
      node['protocol'] = pluginUiProtocol;
    }
    for (final value in node.values) {
      _rewriteProtocols(value);
    }
  } else if (node is List) {
    for (final value in node) {
      _rewriteProtocols(value);
    }
  }
}
