// 职责: MetaArc 远程认证、账号登录注册、个人资料与算力配额拉取，以及本地 New-API 算力中枢自动装配。
// 关联文件:
//   lib/shared/models/metaarc_account.dart
//   lib/shared/database/app_database.dart
//   lib/shared/database/daos/ai_provider_dao.dart
//   lib/shared/database/daos/app_settings_dao.dart
//   lib/shared/services/ai/new_api.dart
// 遵循的 Rules:
//   .agents/rules/code-style.md
//   .agents/rules/service-naming.md
//   .agents/rules/error-handling.md

import 'dart:convert';
import 'package:http/http.dart' as http;

import '../../database/app_database.dart';
import '../../logger/app_logger.dart';
import '../../models/metaarc_account.dart';

final _log = AppLogger.forModule('MetaArcAuthService');

class MetaArcAuthService {
  MetaArcAuthService({
    required this.database,
    http.Client? client,
  }) : _client = client ?? http.Client();

  final AppDatabase database;
  final http.Client _client;

  static const String appSettingsKey = 'metaarc_user_account';
  static const String metaarcProviderId = 'metaarc_ai_hub';

  /// 从本地设置加载当前已保存的 MetaArc 账号
  Future<MetaArcAccount?> loadStoredAccount() async {
    try {
      final raw = await database.appSettingsDao.get(appSettingsKey);
      if (raw == null || raw.trim().isEmpty) return null;
      final json = jsonDecode(raw) as Map<String, dynamic>;
      return MetaArcAccount.fromJson(json);
    } catch (e, stack) {
      _log.error('Failed to load stored MetaArc account', error: e, stackTrace: stack);
      return null;
    }
  }

  /// 保存账号到本地设置
  Future<void> saveAccount(MetaArcAccount? account) async {
    if (account == null) {
      await database.appSettingsDao.remove(appSettingsKey);
      return;
    }
    final raw = jsonEncode(account.toJson());
    await database.appSettingsDao.set(key: appSettingsKey, value: raw);
  }

  /// 用户登录
  Future<MetaArcAccount> login({
    required String serverUrl,
    required String account,
    required String password,
  }) async {
    final cleanUrl = MetaArcAccount.normalizeServerUrl(serverUrl);
    final uri = MetaArcAccount.loginUri(cleanUrl);

    final res = await _client.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'account': account.trim(),
        'password': password,
      }),
    );

    if (res.statusCode != 200) {
      String msg = '登录失败 (HTTP ${res.statusCode})';
      try {
        final data = jsonDecode(res.body);
        if (data is Map && data['message'] != null) {
          msg = data['message'].toString();
        }
      } catch (_) {}
      throw Exception(msg);
    }

    final data = jsonDecode(res.body) as Map<String, dynamic>;
    final user = data['user'] as Map<String, dynamic>? ?? {};
    final token = data['token']?.toString() ?? '';

    final metaArcAccount = MetaArcAccount(
      userId: user['id']?.toString() ?? '',
      token: token,
      email: user['email']?.toString(),
      phone: user['phone']?.toString(),
      nickname: user['nickname']?.toString(),
      plan: user['plan']?.toString() ?? 'free',
      newApiKey: user['new_api_key']?.toString() ?? '',
      newApiBaseUrl: _remoteBaseUrl(user['new_api_base_url']),
      quota: (user['quota'] as num?)?.toDouble() ?? 0.0,
      totalQuota: (user['total_quota'] as num?)?.toDouble() ?? 0.0,
      serverUrl: cleanUrl,
      updatedAt: DateTime.now(),
      expiresAt: user['expires_at'] != null ? DateTime.tryParse(user['expires_at'].toString()) : null,
    );

    // 自动持久化并装配本地 AI 供应商与通道
    await saveAccount(metaArcAccount);
    await syncToAiProviders(metaArcAccount);

    return metaArcAccount;
  }

  /// 用户注册
  Future<MetaArcAccount> register({
    required String serverUrl,
    required String phoneOrEmail,
    required String password,
    String? nickname,
  }) async {
    final cleanUrl = MetaArcAccount.normalizeServerUrl(serverUrl);
    final uri = MetaArcAccount.registerUri(cleanUrl);

    final isEmail = phoneOrEmail.contains('@');
    final payload = <String, dynamic>{
      'password': password,
      if (nickname != null && nickname.trim().isNotEmpty) 'nickname': nickname.trim(),
    };
    if (isEmail) {
      payload['email'] = phoneOrEmail.trim();
    } else {
      payload['phone'] = phoneOrEmail.trim();
    }

    final res = await _client.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
    );

    if (res.statusCode != 200 && res.statusCode != 201) {
      String msg = '注册失败 (HTTP ${res.statusCode})';
      try {
        final data = jsonDecode(res.body);
        if (data is Map && data['message'] != null) {
          msg = data['message'].toString();
        }
      } catch (_) {}
      throw Exception(msg);
    }

    // 注册成功后自动执行登录
    return await login(
      serverUrl: serverUrl,
      account: phoneOrEmail,
      password: password,
    );
  }

  /// 刷新云端资料与配额
  Future<MetaArcAccount> fetchProfile(MetaArcAccount current) async {
    final cleanUrl = MetaArcAccount.normalizeServerUrl(current.serverUrl);
    final uri = MetaArcAccount.profileUri(cleanUrl);

    final res = await _client.get(
      uri,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ${current.token}',
      },
    );

    if (res.statusCode != 200) {
      throw Exception('获取个人资料失败 (HTTP ${res.statusCode})');
    }

    final data = jsonDecode(res.body) as Map<String, dynamic>;
    final user = (data['user'] is Map<String, dynamic>) ? data['user'] as Map<String, dynamic> : data;

    final remoteBaseUrl = _remoteBaseUrl(user['new_api_base_url']);
    final updated = current.copyWith(
      plan: user['plan']?.toString() ?? current.plan,
      newApiKey: user['new_api_key']?.toString() ?? current.newApiKey,
      newApiBaseUrl: remoteBaseUrl.isNotEmpty ? remoteBaseUrl : current.newApiBaseUrl,
      serverUrl: cleanUrl,
      quota: (user['quota'] as num?)?.toDouble() ?? current.quota,
      totalQuota: (user['total_quota'] as num?)?.toDouble() ?? current.totalQuota,
      nickname: user['nickname']?.toString() ?? current.nickname,
      updatedAt: DateTime.now(),
      expiresAt: user['expires_at'] != null ? DateTime.tryParse(user['expires_at'].toString()) : current.expiresAt,
    );

    await saveAccount(updated);
    await syncToAiProviders(updated);
    return updated;
  }

  /// 核心自动装配引擎：将 MetaArc 下发的专属 New-API Key 与网关同步到本地 AiProviders 表。
  /// 仅当服务端下发有效凭据（非 sk-mock- 开头）且算力网关地址非空时才启用；否则禁用该 Provider。
  Future<void> syncToAiProviders(MetaArcAccount account) async {
    final canProvision = account.hasProvisionedApiKey && account.newApiBaseUrl.trim().isNotEmpty;

    try {
      final existing = await database.aiProviderDao.getById(metaarcProviderId);
      if (!canProvision) {
        if (existing != null && existing.enabled) {
          await database.aiProviderDao.upsert(existing.copyWith(enabled: false));
          _log.info('Disabled unprovisioned MetaArc AiProvider (ID: $metaarcProviderId)');
        }
        return;
      }

      final defaultModels = [
        'gpt-4o',
        'gpt-4o-mini',
        'claude-3-5-sonnet',
        'deepseek-chat',
        'deepseek-reasoner',
        'qwen-max',
      ];
      final defaultImageModels = [
        'dall-e-3',
        'flux-schnell',
        'flux-pro',
      ];
      final defaultAudioModels = [
        'tts-1',
        'tts-1-hd',
      ];
      final defaultVideoModels = [
        'kling-v1',
        'luma-dream-machine',
      ];

      final provider = AiProvider(
        id: metaarcProviderId,
        name: 'MetaArc 算力中枢',
        builtin: false,
        type: 'openai_compatible',
        enabled: true,
        apiKey: account.newApiKey,
        baseUrl: account.newApiBaseUrl,
        models: existing?.models.isNotEmpty == true ? existing!.models : defaultModels,
        imageModels: existing?.imageModels.isNotEmpty == true ? existing!.imageModels : defaultImageModels,
        audioModels: existing?.audioModels.isNotEmpty == true ? existing!.audioModels : defaultAudioModels,
        videoModels: existing?.videoModels.isNotEmpty == true ? existing!.videoModels : defaultVideoModels,
        embeddingModels: const ['text-embedding-3-small'],
        temperature: existing?.temperature ?? 0.7,
        maxTurns: existing?.maxTurns ?? 512,
        reasoningEffort: existing?.reasoningEffort,
        proxyUrl: '',
        proxyUsername: '',
        proxyPassword: '',
        accessKeyId: null,
        secretAccessKey: null,
        assetProjectName: null,
        updatedAt: DateTime.now(),
        deletedAt: DateTime.fromMillisecondsSinceEpoch(0),
      );

      await database.aiProviderDao.upsert(provider);
      _log.info('Successfully auto-provisioned MetaArc AiProvider (ID: $metaarcProviderId)');
    } catch (e, stack) {
      _log.error('Failed to auto-provision MetaArc AiProvider', error: e, stackTrace: stack);
    }
  }

  /// 算力网关地址只采用服务端返回的非空值，不补 api 子域。
  String _remoteBaseUrl(Object? value) {
    return value?.toString().trim() ?? '';
  }

  /// 登出：清除本地账号与缓存
  Future<void> logout() async {
    await saveAccount(null);
    try {
      final existing = await database.aiProviderDao.getById(metaarcProviderId);
      if (existing != null) {
        // 禁用 MetaArc 供应商
        await database.aiProviderDao.upsert(existing.copyWith(enabled: false));
      }
    } catch (_) {}
  }
}
