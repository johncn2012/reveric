// 职责: 集中 MetaArc 的安装标识，并在读取时接受改名前的 Reveric 标识。
// 关联文件:
//   lib/shared/database/database_file.dart
//   lib/shared/services/plugins/legacy_ids.dart
//   lib/shared/services/themes_orchestrator.dart
//   lib/shared/models/plugin/view.dart

/// 桌面端应用标识。Android / iOS 容器标识仍是 `ai.reveric`，因为新包读不到旧沙箱。
const metaArcApplicationId = 'cn.metaarc';
const metaArcDebugApplicationId = 'cn.metaarc.debug';
const legacyApplicationId = 'ai.reveric';
const legacyDebugApplicationId = 'ai.reveric.debug';

const appDatabaseFileName = 'metaarc.sqlite';
const legacyAppDatabaseFileName = 'reveric.sqlite';

const oauthCallbackScheme = metaArcApplicationId;
const legacyOauthCallbackScheme = legacyApplicationId;
const oauthCallbackUri = '$oauthCallbackScheme://mcp/oauth/callback';
const legacyOauthCallbackUri =
    '$legacyOauthCallbackScheme://mcp/oauth/callback';

const themeTokenMetaArc = 'metaarc';
const legacyThemeToken = 'reveric';

const pluginUiProtocol = 'metaarc-ui-v1';
const pluginTsxProtocol = 'metaarc-tsx-v1';
const legacyPluginUiProtocol = 'reveric-ui-v1';
const legacyPluginTsxProtocol = 'reveric-tsx-v1';

const bundledPluginIdAliases = <String, String>{
  'reveric.deepseek': 'metaarc.deepseek',
  'reveric.memory': 'metaarc.memory',
  'reveric.web': 'metaarc.web',
};

const defaultEnabledBundledPluginId = 'metaarc.web';

bool isPluginUiProtocol(Object? value) =>
    value == pluginUiProtocol || value == legacyPluginUiProtocol;

bool isPluginTsxProtocol(Object? value) =>
    value == pluginTsxProtocol || value == legacyPluginTsxProtocol;

bool isKnownPluginProtocol(Object? value) =>
    isPluginUiProtocol(value) || isPluginTsxProtocol(value);

/// 已保存的 `reveric` 主题令牌和新建时写入的 `metaarc` 是同一套配色。
String canonicalThemeToken(String value) =>
    value == legacyThemeToken ? themeTokenMetaArc : value;
