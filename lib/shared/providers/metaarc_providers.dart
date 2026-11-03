// 职责: MetaArc 会员账号、认证服务、S3 云端资产直传与算力配额的全局状态管理与同步。
// 关联文件:
//   lib/shared/models/metaarc_account.dart
//   lib/shared/services/remote/metaarc_auth_service.dart
//   lib/shared/services/remote/metaarc_sync_service.dart
//   lib/shared/providers/novel_providers.dart
// 遵循的 Rules:
//   .agents/rules/code-style.md
//   .agents/rules/state-management.md

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../logger/app_logger.dart';
import '../models/metaarc_account.dart';
import '../services/remote/metaarc_auth_service.dart';
import '../services/remote/metaarc_sync_service.dart';
import 'novel_providers.dart';

final _log = AppLogger.forModule('MetaArcAccount');

/// MetaArc 认证与通信底层服务 Provider
final metaarcAuthServiceProvider = Provider<MetaArcAuthService>((ref) {
  final db = ref.watch(appDatabaseProvider);
  return MetaArcAuthService(database: db);
});

/// MetaArc 云端资产同步与 S3 直传服务 Provider
final metaarcSyncServiceProvider = Provider<MetaArcSyncService>((ref) {
  final db = ref.watch(appDatabaseProvider);
  return MetaArcSyncService(database: db);
});

/// MetaArc 当前用户账号状态 Notifier
class MetaArcAccountNotifier extends AsyncNotifier<MetaArcAccount?> {
  @override
  Future<MetaArcAccount?> build() async {
    final service = ref.watch(metaarcAuthServiceProvider);
    return await service.loadStoredAccount();
  }

  /// 登录
  Future<MetaArcAccount> login({
    required String serverUrl,
    required String account,
    required String password,
  }) async {
    state = const AsyncValue.loading();
    try {
      final service = ref.read(metaarcAuthServiceProvider);
      final user = await service.login(
        serverUrl: serverUrl,
        account: account,
        password: password,
      );
      state = AsyncValue.data(user);
      return user;
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
      rethrow;
    }
  }

  /// 注册并登录
  Future<MetaArcAccount> register({
    required String serverUrl,
    required String phoneOrEmail,
    required String password,
    String? nickname,
  }) async {
    state = const AsyncValue.loading();
    try {
      final service = ref.read(metaarcAuthServiceProvider);
      final user = await service.register(
        serverUrl: serverUrl,
        phoneOrEmail: phoneOrEmail,
        password: password,
        nickname: nickname,
      );
      state = AsyncValue.data(user);
      return user;
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
      rethrow;
    }
  }

  /// 刷新算力与资料。失败时保留已保存的账号，并返回 false。
  Future<bool> refreshProfile() async {
    final current = state.asData?.value;
    if (current == null) {
      return false;
    }
    try {
      final service = ref.read(metaarcAuthServiceProvider);
      final updated = await service.fetchProfile(current);
      state = AsyncValue.data(updated);
      return true;
    } catch (e, stack) {
      _log.error(
        'Failed to refresh MetaArc profile',
        error: e,
        stackTrace: stack,
      );
      state = AsyncValue.data(current);
      return false;
    }
  }

  /// 退出登录
  Future<void> logout() async {
    try {
      final service = ref.read(metaarcAuthServiceProvider);
      await service.logout();
    } finally {
      state = const AsyncValue.data(null);
    }
  }
}

/// MetaArc 用户状态 Provider
final metaarcAccountProvider =
    AsyncNotifierProvider<MetaArcAccountNotifier, MetaArcAccount?>(
      MetaArcAccountNotifier.new,
    );
