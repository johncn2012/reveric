// 职责: MetaArc 云端资产同步与 S3 对象存储直传服务 — 将本地生成的图片与视频交付物直传至多租户隔离云端 S3。
// 关联文件:
//   lib/shared/models/metaarc_account.dart
//   lib/shared/database/app_database.dart
//   lib/shared/services/remote/metaarc_auth_service.dart
//   lib/shared/providers/metaarc_providers.dart
// 遵循的 Rules:
//   .agents/rules/code-style.md
//   .agents/rules/service-naming.md
//   .agents/rules/error-handling.md

import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:mime/mime.dart';

import '../../database/app_database.dart';
import '../../logger/app_logger.dart';
import '../../models/metaarc_account.dart';

final _log = AppLogger.forModule('MetaArcSyncService');

class MetaArcSyncService {
  MetaArcSyncService({
    required this.database,
    http.Client? client,
  }) : _client = client ?? http.Client();

  final AppDatabase database;
  final http.Client _client;

  /// 交付物上传到云端 S3 对象存储并登记资产
  /// [localFilePath]: 本地图片/视频文件的绝对路径
  /// [assetType]: 'image' | 'video' | 'audio'
  /// [projectId]: 所属作品/小说 ID (用于云端多租户与项目隔离)
  /// [assetId]: 本地 SQLite Assets 表中的主键 ID (若提供，将自动更新其 metadataJson)
  Future<String?> uploadAssetToS3({
    required MetaArcAccount account,
    required String localFilePath,
    required String assetType,
    String? projectId,
    String? assetId,
  }) async {
    final file = File(localFilePath);
    if (!await file.exists()) {
      _log.warning('Upload aborted: Local file does not exist: $localFilePath');
      return null;
    }

    final fileName = file.uri.pathSegments.last;
    final mimeType = lookupMimeType(localFilePath) ?? 'application/octet-stream';
    final byteSize = await file.length();
    final cleanServerUrl = MetaArcAccount.normalizeServerUrl(account.serverUrl);

    try {
      // 1. 向 MetaArc BaaS 申请租户隔离的 Presigned PUT 上传凭据
      final presignUri = Uri.parse('$cleanServerUrl/api/media/upload-url');
      final presignRes = await _client.post(
        presignUri,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${account.token}',
        },
        body: jsonEncode({
          'projectId': projectId,
          'assetType': assetType,
          'fileName': fileName,
          'mimeType': mimeType,
        }),
      );

      if (presignRes.statusCode != 200) {
        _log.error('Failed to get presigned upload URL: ${presignRes.body}');
        return null;
      }

      final presignJson = jsonDecode(presignRes.body) as Map<String, dynamic>;
      final uploadData = presignJson['data'] as Map<String, dynamic>;
      final putUrl = uploadData['putUrl']?.toString() ?? '';
      final storageKey = uploadData['key']?.toString() ?? '';
      final cdnUrl = uploadData['cdnUrl']?.toString() ?? '';
      final requiredHeaders = (uploadData['headers'] as Map<String, dynamic>?) ?? {};

      if (putUrl.isEmpty) {
        _log.error('Presigned URL is empty');
        return null;
      }

      // 2. 使用 HTTP PUT 将本地二进制文件直接上传到 S3 / R2 / OSS (不经过应用服务器中转)
      final bytes = await file.readAsBytes();
      final uploadHeaders = <String, String>{
        'Content-Type': mimeType,
      };
      for (final entry in requiredHeaders.entries) {
        uploadHeaders[entry.key] = entry.value.toString();
      }

      final s3Response = await _client.put(
        Uri.parse(putUrl),
        headers: uploadHeaders,
        body: bytes,
      );

      if (s3Response.statusCode < 200 || s3Response.statusCode >= 300) {
        _log.error('S3 Direct PUT failed with HTTP ${s3Response.statusCode}: ${s3Response.body}');
        return null;
      }

      _log.info('Successfully uploaded asset to S3: $cdnUrl');

      // 3. 上报资产确认登记到 BaaS media_assets 表
      final confirmUri = Uri.parse('$cleanServerUrl/api/media/confirm');
      await _client.post(
        confirmUri,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${account.token}',
        },
        body: jsonEncode({
          'projectId': projectId,
          'assetType': assetType,
          'storageKey': storageKey,
          'cdnUrl': cdnUrl,
          'byteSize': byteSize,
          'mimeType': mimeType,
          'meta': {
            'local_path': localFilePath,
            'file_name': fileName,
            'client_asset_id': assetId,
          },
        }),
      );

      return cdnUrl;
    } catch (e, stack) {
      _log.error('Error during MetaArc S3 asset upload', error: e, stackTrace: stack);
      return null;
    }
  }

  /// 上报算力消耗与任务完成记录 (可量化指标)
  Future<void> reportTaskConsumption({
    required MetaArcAccount account,
    required String taskType,
    required double actualPoints,
    String? novelId,
    Map<String, dynamic>? meta,
  }) async {
    final cleanServerUrl = MetaArcAccount.normalizeServerUrl(account.serverUrl);
    try {
      // 1. 创建即时任务记录
      final createUri = Uri.parse('$cleanServerUrl/api/tasks/create');
      final createRes = await _client.post(
        createUri,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${account.token}',
        },
        body: jsonEncode({
          'taskType': taskType,
          'novelId': novelId,
          'inputPayload': meta ?? {},
          'estimatedPoints': actualPoints,
        }),
      );

      if (createRes.statusCode != 201) return;
      final taskJson = jsonDecode(createRes.body) as Map<String, dynamic>;
      final taskId = taskJson['task']?['id']?.toString();
      if (taskId == null) return;

      // 2. 结算并扣除配额
      final updateUri = Uri.parse('$cleanServerUrl/api/tasks/$taskId/update-status');
      await _client.post(
        updateUri,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${account.token}',
        },
        body: jsonEncode({
          'status': 'completed',
          'progress': 100,
          'actualPoints': actualPoints,
          'outputPayload': meta ?? {},
        }),
      );
    } catch (e, stack) {
      _log.error(
        'Failed to report task consumption to MetaArc cloud',
        error: e,
        stackTrace: stack,
      );
    }
  }
}
