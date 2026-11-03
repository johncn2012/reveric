// 职责: 验证自定义更新清单的架构参数、尚未发布和真实下载地址。
// 关联文件:
//   lib/shared/services/update/sources/custom_api_source.dart
//   lib/shared/services/update/models.dart
//   lib/shared/localization/locale_keys.dart
import 'dart:convert';
import 'dart:ffi';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:reveric/shared/localization/locale_keys.dart';
import 'package:reveric/shared/services/update.dart';

class _TrackedClient extends MockClient {
  _TrackedClient(super.handler);
  bool closed = false;
  @override
  void close() {
    closed = true;
    super.close();
  }
}

http.Response _json(Object body) {
  return http.Response.bytes(
    utf8.encode(jsonEncode(body)),
    200,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );
}

void main() {
  test('cpu arch uses the ABI name instead of the OS version string', () {
    expect(updateCpuArch(Abi.windowsX64), 'x64');
    expect(updateCpuArch(Abi.macosArm64), 'arm64');
    expect(updateCpuArch(Abi.windowsX64), isNot(contains('Windows')));
  });

  test('unreleased manifest stays unpublished and closes the client', () async {
    final client = _TrackedClient(
      (request) async => _json({
        'has_update': false,
        'status': 'unreleased',
        'message': '尚未发布',
      }),
    );
    final source = CustomApiSource(
      'https://metaarc.com.cn/api/updates/latest',
      createClient: () => client,
      operatingSystem: 'windows',
      cpuArch: 'x64',
    );
    final result = await source.checkForUpdate('0.6.2');
    expect(result, isA<UpdateCheckFailed>());
    expect(
      (result as UpdateCheckFailed).error,
      LocaleKeys.settingsAboutUpdateUnconfigured,
    );
    expect(client.closed, isTrue);
  });

  test(
    'windows check sends platform and cpu arch, then accepts the setup',
    () async {
      late Uri requested;
      final source = CustomApiSource(
        'https://metaarc.com.cn/api/updates/latest',
        createClient: () => MockClient((request) async {
          requested = request.url;
          return _json({
            'has_update': true,
            'version': '0.7.0',
            'download_url':
                'https://metaarc.com.cn/downloads/MetaArc-0.7.0-windows-setup.exe',
            'file_size': 128,
            'release_notes': '内测，未签名。',
          });
        }),
        operatingSystem: 'windows',
        cpuArch: 'x64',
      );

      final result = await source.checkForUpdate('0.6.2');
      expect(requested.queryParameters, {
        'platform': 'windows',
        'arch': 'x64',
        'current': '0.6.2',
      });
      expect(requested.host, isNot('api.github.com'));
      final info = (result as UpdateAvailable).info;
      expect(info.version, '0.7.0');
      expect(
        info.downloadUrl,
        'https://metaarc.com.cn/downloads/MetaArc-0.7.0-windows-setup.exe',
      );
      expect(info.fileSize, 128);
      expect(info.releaseNotes, '内测，未签名。');
    },
  );

  test('same version and rejected hosts do not become downloads', () async {
    Future<UpdateCheckResult> check(Map<String, Object?> body) {
      return CustomApiSource(
        'http://127.0.0.1:8080/api/updates/latest',
        createClient: () => MockClient((_) async => _json(body)),
        operatingSystem: 'windows',
        cpuArch: 'x64',
      ).checkForUpdate('0.7.0');
    }

    expect(
      await check({
        'has_update': false,
        'status': 'current',
        'version': '0.7.0',
      }),
      isA<UpdateUpToDate>(),
    );
    expect(
      await check({
        'has_update': true,
        'version': '0.7.0',
        'download_url':
            'https://metaarc.com.cn/downloads/MetaArc-0.7.0-windows-setup.exe',
      }),
      isA<UpdateUpToDate>(),
    );
    final rejected = await check({
      'has_update': true,
      'version': '9.0.0',
      'download_url':
          'https://github.com/looplj/reveric/releases/download/v9.0.0/MetaArc-9.0.0-windows-setup.exe',
    });
    expect(rejected, isA<UpdateCheckFailed>());
    expect(
      (rejected as UpdateCheckFailed).error,
      LocaleKeys.settingsAboutCheckFailed,
    );
  });

  test('loopback setup url is accepted and a non-exe package is not', () async {
    final accepted = await CustomApiSource(
      'http://127.0.0.1:8080/api/updates/latest',
      createClient: () => MockClient(
        (_) async => _json({
          'has_update': true,
          'version': '0.7.0',
          'download_url':
              'http://127.0.0.1:8080/downloads/MetaArc-0.7.0-windows-setup.exe',
        }),
      ),
      operatingSystem: 'windows',
      cpuArch: 'x64',
    ).checkForUpdate('0.6.2');
    expect(
      (accepted as UpdateAvailable).info.downloadUrl,
      'http://127.0.0.1:8080/downloads/MetaArc-0.7.0-windows-setup.exe',
    );

    final rejected = await CustomApiSource(
      'https://metaarc.com.cn/api/updates/latest',
      createClient: () => MockClient(
        (_) async => _json({
          'has_update': true,
          'version': '0.7.0',
          'download_url':
              'https://metaarc.com.cn/downloads/MetaArc-0.7.0-windows.zip',
        }),
      ),
      operatingSystem: 'windows',
      cpuArch: 'x64',
    ).checkForUpdate('0.6.2');
    expect(rejected, isA<UpdateCheckFailed>());
  });

  test(
    'socket failure closes the client and reports a check failure',
    () async {
      final client = _TrackedClient((_) async {
        throw const SocketException('offline');
      });
      final source = CustomApiSource(
        'https://metaarc.com.cn/api/updates/latest',
        createClient: () => client,
        operatingSystem: 'windows',
        cpuArch: 'x64',
      );
      final result = await source.checkForUpdate('0.6.2');
      expect(result, isA<UpdateCheckFailed>());
      expect(
        (result as UpdateCheckFailed).error,
        LocaleKeys.settingsAboutCheckFailed,
      );
      expect(client.closed, isTrue);
    },
  );
}
