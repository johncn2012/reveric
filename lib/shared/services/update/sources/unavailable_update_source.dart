// 职责: 在未配置更新源时直接返回失败，不访问任何外部仓库。
// 关联文件:
//   lib/shared/services/update/update_source.dart
//   lib/shared/services/update/models.dart
//   lib/shared/providers/update_providers.dart
//   lib/shared/localization/locale_keys.dart
//   assets/translations/en/settings.json
//   assets/translations/zh-CN/settings.json
// 遵循的 Rules:
//   .agents/rules/code-style.md

import '../../../localization/locale_keys.dart';
import '../models.dart';
import '../update_source.dart';

/// 客户端安装包尚未发布。检查不会访问上游 Release，也不会发出网络请求。
class UnavailableUpdateSource implements UpdateSource {
  const UnavailableUpdateSource();

  @override
  Future<UpdateCheckResult> checkForUpdate(String _) async {
    return const UpdateCheckFailed(LocaleKeys.settingsAboutUpdateUnconfigured);
  }
}
