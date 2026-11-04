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
const metaArcOfficialWebsiteUrl = 'https://MetaArc.COM.CN';

/// 上游项目地址。关于页展示该链接，满足 AGPL 署名。下载和更新检查不使用它。
const revericGitHubRepoUrl = 'https://github.com/looplj/reveric';

/// QQ 交流群官方邀请链接。
const revericQqGroupJoinUrl = 'https://qm.qq.com/q/Ap8pfOWHDO';
const revericQqGroupNumber = '924148054';

/// 技能广场只读取公开链接目录，导入沿用各来源平台的现有流程。
/// 目录仓库是 https://github.com/johncn2012/skills 。客户端拉取该仓库 main 上的 catalog.json。
const revericSkillsCatalogUrl =
    'https://raw.githubusercontent.com/johncn2012/skills/main/catalog.json';

/// AGPLv3 第 7 条附加条款要求修改版保留的作者署名，与 NOTICES 保持一致，不做本地化。
const revericAttribution = 'Based on Reveric by looplj.';

/// 接收用户通过邮件私下发送的反馈与诊断文件。
const revericFeedbackEmail = 'bababaa261@gmail.com';

/// 产品线编码，通过 X-Product-Code 请求头发送给匿名诊断接收端。
const revericProductCode = 'writer';

/// 匿名诊断 API 公共请求头。
final revericApiHeaders = <String, String>{
  'Content-Type': 'application/json',
  'X-Product-Code': revericProductCode,
};

/// 用户主动提交日志与会话的诊断后端，与匿名事件上报独立。
/// 仓库里没有已接通的 MetaArc 诊断主机。空字符串关掉关于页的上传入口，
/// 不再请求 diagnostics.reveric.app。Worker 目标域名见
/// server/cf/workers/diagnostics；Cloudflare 绑定 diagnostics.metaarc.com.cn
/// 之后，再把这里写成 `https://diagnostics.metaarc.com.cn`。
const diagnosticsBaseUrl = '';
