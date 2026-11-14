// 职责: 应用级别编译期常量（版本号、产品线、匿名上报地址、反馈渠道、匿名诊断公共头）
// 关联文件:
//   lib/shared/providers/trace_providers.dart
//   lib/shared/providers/anonymous_reporting_providers.dart
//   lib/shared/logger/startup_failure_reporter.dart
//   lib/shared/widgets/ai/chat/feedback_dialog.dart
//   release.sh (版本号同步)
//

/// 应用版本号。
/// 与 pubspec.yaml 的 version 字段保持同步，由 release.sh 一同更新。
/// 供需要同步获取版本号的场景使用（如匿名上报），避免 PackageInfo 异步调用。
const appVersion = '0.6.2';

/// 窗口、托盘、引导页、通知和系统显示名使用的产品名。
/// 关于页仍展示 [revericAttribution]，不把修改版写成没有上游。
const productDisplayName = 'MetaArc';

/// 匿名诊断接收地址，包含完整路径；请求不追加业务 API 后缀。
/// 为空表示本构建不接匿名诊断：不上报，也不展示 opt-in 入口。
const anonymousReportingBaseUrl = '';

/// MetaArc 官方门户与商业中台主页地址。
const metaArcOfficialWebsiteUrl = 'https://metaarc.com.cn';

/// MetaArc GitHub 仓库地址。
const metaArcGitHubRepoUrl = 'https://github.com/johncn2012/MetaArc';

/// MetaArc 问题反馈与需求建议地址。
const metaArcGitHubIssuesUrl = 'https://github.com/johncn2012/MetaArc/issues';

/// MetaArc 官方联系与反馈邮箱。
const metaArcContactEmail = 'contact@metaarc.com.cn';

/// 上游项目地址。关于页展示该链接，满足 AGPL 署名。下载和更新检查不使用它。
const revericGitHubRepoUrl = 'https://github.com/looplj/reveric';

/// 技能广场只读取公开链接目录，导入沿用各来源平台的现有流程。
/// 目录仓库是 https://github.com/johncn2012/skills 。客户端拉取该仓库 main 上的 catalog.json。
const revericSkillsCatalogUrl =
    'https://raw.githubusercontent.com/johncn2012/skills/main/catalog.json';

/// 关于页一行署名。产品名是 MetaArc 元弧；句中保留 NOTICES 要求的
/// “Based on Reveric by looplj.”，不做本地化。
const revericAttribution = 'MetaArc 元弧. Based on Reveric by looplj.';

/// 接收用户通过邮件私下发送的反馈与诊断文件。
const revericFeedbackEmail = 'contact@metaarc.com.cn';

/// 产品线编码，通过 X-Product-Code 请求头发送给匿名诊断接收端。
const revericProductCode = 'writer';

/// 匿名诊断 API 公共请求头。
final revericApiHeaders = <String, String>{
  'Content-Type': 'application/json',
  'X-Product-Code': revericProductCode,
};

/// 用户主动提交日志与会话的诊断后端，与匿名事件上报独立。
/// 关于页在该地址非空时显示上传入口。上传路径是 `/v1/diagnostics`。
const diagnosticsBaseUrl = 'https://diagnostics.metaarc.com.cn';
