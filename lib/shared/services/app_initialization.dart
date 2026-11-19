// 职责: 应用初始化任务执行器 — Orchestrator + Onboarding helpers
// 关联文件:
//   lib/shared/services/initialization/task.dart
//   lib/shared/services/initialization/agent_seeds.dart
//   lib/shared/services/initialization/demo_screenplay.dart
//   lib/shared/services/demo_novel.dart
//   lib/shared/database/app_database.dart
//   lib/shared/logger/app_logger.dart
//   lib/shared/logger/startup_failure_reporter.dart
import 'dart:async';

import 'package:drift/drift.dart';
import 'package:flutter/services.dart';

import '../logger/app_logger.dart';
import '../logger/startup_failure_reporter.dart';
import '../database/app_database.dart';
import '../models/asset_purpose.dart';
import '../models/app_settings_aggregate_data.dart';
import 'demo_novel.dart';
import 'image_library_service.dart';
import 'initialization/agent_seeds.dart';
import 'initialization/collection_seeds.dart';
import 'initialization/demo_screenplay.dart';
import 'initialization/shortcut_action_seeds.dart';
import 'initialization/task.dart';
import 'initialization/provider_seeds.dart';

final _log = AppLogger.forModule('AppInit');

const _appInitializationKeyPrefix = 'app_initialization.';

const appStateKeyOnboardingCompleted = 'onboarding_completed';
const appStateKeyChatOnboardingShown = 'chat_onboarding_shown';

Future<void>? _initLock;

List<AppInitializationTask> defaultAppInitializationTasks() {
  return const [
    AppInitializationTask(
      id: 'default_collections_v1',
      run: seedDefaultCollections,
    ),
    AppInitializationTask(
      id: 'default_third_party_providers_v1',
      run: seedDefaultThirdPartyProviders,
    ),
    AppInitializationTask(
      id: 'default_metaso_provider_v1',
      run: seedDefaultMetasoProvider,
    ),
    AppInitializationTask(
      id: 'default_api88_provider_v1',
      run: seedDefaultApi88Provider,
    ),
    AppInitializationTask(
      id: 'default_global_agents_v1',
      run: seedDefaultGlobalAgents,
    ),
    AppInitializationTask(
      id: 'default_ai_shortcut_actions_v1',
      run: seedDefaultAiShortcutActions,
    ),
    AppInitializationTask(id: 'demo_works_v3', run: _seedDemoWorks),
    AppInitializationTask(
      id: 'metaarc_v064_brand_cleanup_v3',
      run: _cleanupMetaArcBrand,
    ),
  ];
}

/// 示例小说与示例剧本作为一项初始化任务写入；两者各自按标题去重。
Future<void> _seedDemoWorks(AppDatabase database) async {
  // 1. 软删除历史旧版示例（若存在）
  final oldNovels = await (database.select(database.novels)
        ..where((t) =>
            t.title.isIn(const ['潮汐邮局', '末班船的证人']) |
            t.id.isIn(const ['nov_IFQ4NO', 'scr_NA9MBX'])))
      .get();
  for (final old in oldNovels) {
    await database.novelDao.softDelete(old.id);
  }
  // 2. 注入全新高质量示范作品（1部科幻长篇小说 + 1部悬疑标准剧本）
  await createDemoNovel(database);
  await seedDemoScreenplay(database);
}

/// 0.6.4 升级迁移：清理历史 SQLite 中的残留品牌标识、旧头像与默认称呼「晚风客」
Future<void> _cleanupMetaArcBrand(AppDatabase database) async {
  // 1. 清理本地 profile 中的旧随机称呼「晚风客」
  try {
    final profileRaw = await database.appSettingsDao.get(
      LocalProfileSettingsData.appSettingsKey,
    );
    if (profileRaw != null) {
      final profile = LocalProfileSettingsData.decode(profileRaw);
      if (profile.username == '晚风客') {
        final updated = LocalProfileSettingsData(
          username: '创作者',
          avatarPath: profile.avatarPath.contains('viber') ? '' : profile.avatarPath,
        );
        await database.appSettingsDao.set(
          key: LocalProfileSettingsData.appSettingsKey,
          value: updated.encode(),
        );
      }
    }
  } catch (e) {
    _log.warning('Failed to cleanup local profile: $e');
  }

  // 2. 清理 AI 助手设置中的旧品牌信息与旧头像
  try {
    final aiAgentRaw = await database.appSettingsDao.get(
      AiAgentSettingsData.appSettingsKey,
    );
    if (aiAgentRaw != null) {
      final aiSettings = AiAgentSettingsData.decode(aiAgentRaw);
      final needsIdentityFix = aiSettings.identity.contains('Reveric') ||
          aiSettings.identity.contains('小说创作工作台里的写作搭档');
      final needsAvatarFix = aiSettings.avatarPath.contains('viber');
      if (needsIdentityFix || needsAvatarFix) {
        final updated = AiAgentSettingsData(
          identity: needsIdentityFix ? defaultAiAgentIdentityText : aiSettings.identity,
          soul: aiSettings.soul,
          avatarPath: needsAvatarFix ? '' : aiSettings.avatarPath,
          nextActionSuggestions: aiSettings.nextActionSuggestions,
        );
        await database.appSettingsDao.set(
          key: AiAgentSettingsData.appSettingsKey,
          value: updated.encode(),
        );
      }
    }
  } catch (e) {
    _log.warning('Failed to cleanup AI agent settings: $e');
  }

  // 3. 彻底软删除历史旧版示例（潮汐邮局、末班船的证人）
  try {
    final oldNovels = await (database.select(database.novels)
          ..where((t) =>
              t.title.isIn(const ['潮汐邮局', '末班船的证人']) |
              t.id.isIn(const ['nov_IFQ4NO', 'scr_NA9MBX'])))
        .get();
    for (final old in oldNovels) {
      await database.novelDao.softDelete(old.id);
    }
  } catch (e) {
    _log.warning('Failed to cleanup old demo works: $e');
  }

  // 4. 为现有官方示范作品刷新全新高质量专属封面
  try {
    final tansop = await (database.select(database.novels)
          ..where((t) =>
              t.id.equals('nov_TANSOP') |
              t.title.equals('深空编年史：最后的光锥')))
        .getSingleOrNull();
    if (tansop != null) {
      final novelCoverData =
          await rootBundle.load('assets/images/demo/novel_cover.webp');
      final newCoverAsset = await buildImageLibraryService(database).importBytes(
        novelCoverData.buffer.asUint8List(),
        name: 'novel_cover.webp',
        novelId: tansop.id,
        purpose: AssetPurpose.cover,
      );
      await (database.update(database.novels)
            ..where((t) => t.id.equals(tansop.id)))
          .write(
        NovelsCompanion(coverAssetId: Value(newCoverAsset.id)),
      );
    }

    final screenplay = await (database.select(database.novels)
          ..where((t) =>
              t.id.equals('scr_5CEBDY') |
              t.title.equals('雨夜迷局：重构之眼')))
        .getSingleOrNull();
    if (screenplay != null) {
      final spCoverData =
          await rootBundle.load('assets/images/demo/screenplay_cover.webp');
      final newSpAsset = await buildImageLibraryService(database).importBytes(
        spCoverData.buffer.asUint8List(),
        name: 'screenplay_cover.webp',
        novelId: screenplay.id,
        purpose: AssetPurpose.cover,
      );
      await (database.update(database.novels)
            ..where((t) => t.id.equals(screenplay.id)))
          .write(
        NovelsCompanion(coverAssetId: Value(newSpAsset.id)),
      );
    }
  } catch (e) {
    _log.warning('Failed to refresh demo covers: $e');
  }
}

Future<void> ensureAppInitializationTasks({
  required AppDatabase database,
  required List<AppInitializationTask> tasks,
}) async {
  while (_initLock != null) {
    await _initLock;
  }
  final completer = Completer<void>();
  _initLock = completer.future;
  try {
    // 单次批量查询所有初始化完成记录
    final completedKeys = await database.appStateDao.getAllByPrefix(
      _appInitializationKeyPrefix,
    );
    for (final task in tasks) {
      final settingKey = '$_appInitializationKeyPrefix${task.id}';
      final completedAt = completedKeys[settingKey];
      if (completedAt != null && completedAt.isNotEmpty) {
        if (_log.isDebugEnabled) {
          _log.debug('skip task=${task.id} completedAt=$completedAt');
        }
        continue;
      }
      _log.info('run task=${task.id}');
      try {
        await task.run(database);
        await database.appStateDao.set(
          key: settingKey,
          value: DateTime.now().toIso8601String(),
        );
      } catch (error, stackTrace) {
        _log.error(
          'failed task=${task.id} error=$error',
          error: error,
          stackTrace: stackTrace,
        );
        await StartupFailureReporter().report(
          phase: 'app_initialization_${task.id}',
          error: error,
          stackTrace: stackTrace,
        );
        continue;
      }
      _log.info('complete task=${task.id}');
    }
  } finally {
    completer.complete();
    _initLock = null;
  }
}

Future<bool> hasCompletedOnboarding(AppDatabase database) async {
  _log.info('hasCompletedOnboarding START');
  final result = await database.appStateDao.has(appStateKeyOnboardingCompleted);
  _log.info('hasCompletedOnboarding result=$result');
  return result;
}

Future<void> markOnboardingCompleted(AppDatabase database) async {
  await database.appStateDao.set(
    key: appStateKeyOnboardingCompleted,
    value: DateTime.now().toIso8601String(),
  );
}

Future<void> clearOnboardingAndFeatureUsageRecords(AppDatabase database) async {
  try {
    await database.transaction(() async {
      await database.appStateDao.remove(appStateKeyOnboardingCompleted);
      await database.appStateDao.remove(appStateKeyChatOnboardingShown);
      await database.delete(database.featureUsages).go();
    });
  } catch (error, stackTrace) {
    _log.error(
      '[DB] table=app_states,feature_usages operation=DELETE '
      'id=$appStateKeyOnboardingCompleted,'
      '$appStateKeyChatOnboardingShown,all_feature_usages error=$error',
      error: error,
      stackTrace: stackTrace,
    );
    rethrow;
  }
}
