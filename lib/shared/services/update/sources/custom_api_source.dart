// 职责: 自定义 API 更新源 — 向 MetaArc 清单查询当前平台的安装包
// 关联文件:
//   lib/shared/services/update/models.dart
//   lib/shared/services/update/update_source.dart
//   lib/shared/logger/log_manager.dart
//   lib/shared/localization/locale_keys.dart
//   assets/translations/en/settings.json
//   assets/translations/zh-CN/settings.json
// 遵循的 Rules:
//   .agents/rules/state-management.md
import 'dart:async';
import 'dart:convert';
import 'dart:ffi';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../../../logger/app_logger.dart';
import '../../../localization/locale_keys.dart';
import '../models.dart';
import '../update_source.dart';

final _log = AppLogger.forModule('CustomApiSource');

/// 把 Dart ABI 收成清单使用的 CPU 架构。不使用操作系统版本文本。
String updateCpuArch([Abi? abi]) {
  return switch (abi ?? Abi.current()) {
    Abi.windowsX64 || Abi.linuxX64 || Abi.macosX64 || Abi.androidX64 => 'x64',
    Abi.windowsArm64 ||
    Abi.linuxArm64 ||
    Abi.macosArm64 ||
    Abi.androidArm64 => 'arm64',
    Abi.windowsIA32 || Abi.linuxIA32 || Abi.androidIA32 => 'ia32',
    _ => 'unknown',
  };
}

/// 安装包地址只接受 MetaArc 域名，以及本机调试用的 loopback。
bool isAllowedUpdateDownloadUrl(Uri uri, {required String platform}) {
  if (uri.userInfo.isNotEmpty || uri.hasFragment) {
    return false;
  }
  final path = uri.path.toLowerCase();
  if (path.contains('..') || !_packagePathMatches(path, platform)) {
    return false;
  }
  final host = uri.host.toLowerCase();
  if (_isBlockedUpdateHost(host)) {
    return false;
  }
  if (uri.scheme == 'https') {
    return host == 'metaarc.com.cn' || host.endsWith('.metaarc.com.cn');
  }
  if (uri.scheme == 'http') {
    return host == '127.0.0.1' || host == 'localhost';
  }
  return false;
}

bool _packagePathMatches(String path, String platform) {
  return switch (platform) {
    'windows' => path.endsWith('.exe') && path.contains('setup'),
    'android' => path.endsWith('.apk'),
    'macos' || 'linux' => path.endsWith('.zip'),
    _ => false,
  };
}

bool _isBlockedUpdateHost(String host) {
  return host == 'github.com' ||
      host.endsWith('.github.com') ||
      host.endsWith('.githubusercontent.com') ||
      host.contains('looplj');
}

/// 自定义 API 更新源
class CustomApiSource implements UpdateSource {
  final String apiEndpoint;
  final FutureOr<http.Client> Function() createClient;
  final String _operatingSystem;
  final String _cpuArch;

  CustomApiSource(
    this.apiEndpoint, {
    this.createClient = http.Client.new,
    String? operatingSystem,
    String? cpuArch,
  }) : _operatingSystem = operatingSystem ?? Platform.operatingSystem,
       _cpuArch = cpuArch ?? updateCpuArch();

  @override
  Future<UpdateCheckResult> checkForUpdate(String currentVersion) async {
    http.Client? client;
    try {
      final endpoint = Uri.parse(apiEndpoint);
      final uri = endpoint.replace(
        queryParameters: {
          ...endpoint.queryParameters,
          'platform': _operatingSystem,
          'arch': _cpuArch,
          'current': currentVersion,
        },
      );

      _log.info('Update check url=$uri currentVersion=$currentVersion');

      client = await createClient();
      final response = await client
          .get(uri, headers: {'Accept': 'application/json'})
          .timeout(const Duration(seconds: 10));

      if (response.statusCode != 200) {
        return const UpdateCheckFailed(LocaleKeys.settingsAboutCheckFailed);
      }

      final decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) {
        return const UpdateCheckFailed(LocaleKeys.settingsAboutCheckFailed);
      }
      return _parse(decoded, currentVersion);
    } catch (e) {
      _log.warning('Update check failed error=$e');
      return const UpdateCheckFailed(LocaleKeys.settingsAboutCheckFailed);
    } finally {
      client?.close();
    }
  }

  UpdateCheckResult _parse(Map<String, dynamic> body, String currentVersion) {
    if (body['has_update'] != true) {
      if (body['status'] == 'current') {
        return const UpdateUpToDate();
      }
      return const UpdateCheckFailed(
        LocaleKeys.settingsAboutUpdateUnconfigured,
      );
    }

    final version = body['version'];
    final downloadUrl = body['download_url'];
    if (version is! String ||
        version.isEmpty ||
        downloadUrl is! String ||
        downloadUrl.isEmpty) {
      return const UpdateCheckFailed(LocaleKeys.settingsAboutCheckFailed);
    }
    if (!isNewerVersion(version, currentVersion)) {
      return const UpdateUpToDate();
    }
    final downloadUri = Uri.tryParse(downloadUrl);
    if (downloadUri == null ||
        !isAllowedUpdateDownloadUrl(downloadUri, platform: _operatingSystem)) {
      _log.warning('Update download url rejected host=${downloadUri?.host}');
      return const UpdateCheckFailed(LocaleKeys.settingsAboutCheckFailed);
    }

    final fileSize = body['file_size'];
    final notes = body['release_notes'];
    return UpdateAvailable(
      UpdateInfo(
        version: version,
        downloadUrl: downloadUrl,
        fileSize: fileSize is int ? fileSize : null,
        releaseNotes: notes is String ? notes : null,
      ),
    );
  }
}
