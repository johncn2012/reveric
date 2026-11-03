// 职责: 移动端 MetaArc 账号页 — 登录、注册、刷新资料，并打开同域网页账号中心。
// 关联文件:
//   lib/shared/providers/metaarc_providers.dart
//   lib/shared/models/metaarc_account.dart
//   lib/mobile/pages/settings_page.dart
//   lib/shared/components/reveric_button.dart
//   lib/mobile/widgets/segmented_tabs.dart
//   lib/shared/localization/locale_keys.dart
//   assets/translations/en/account.json
//   assets/translations/zh-CN/account.json
// 遵循的 Rules:
//   .agents/rules/hooks.md
//   .agents/rules/form.md
//   .agents/rules/design-system.md
//   .agents/rules/i18n.md
//   .agents/rules/code-style.md

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../shared/components/reveric_button.dart';
import '../../shared/form/form.dart';
import '../../shared/localization/app_localization.dart';
import '../../shared/localization/locale_keys.dart';
import '../../shared/logger/app_logger.dart';
import '../../shared/models/metaarc_account.dart';
import '../../shared/providers/metaarc_providers.dart';
import '../../shared/theme/theme.dart';
import '../widgets/segmented_tabs.dart';

final _log = AppLogger.forModule('MobileAccount');

const mobileAccountIdentityKey = ValueKey('mobile-account-identity');
const mobileAccountPasswordKey = ValueKey('mobile-account-password');
const mobileAccountNicknameKey = ValueKey('mobile-account-nickname');
const mobileAccountServerKey = ValueKey('mobile-account-server');
const mobileAccountSubmitKey = ValueKey('mobile-account-submit');
const mobileAccountRefreshKey = ValueKey('mobile-account-refresh');
const mobileAccountCenterKey = ValueKey('mobile-account-center');
const mobileAccountLogoutKey = ValueKey('mobile-account-logout');

typedef MobileAccountUrlOpener = Future<bool> Function(Uri uri);

enum _AccountField<T> implements FieldSchema {
  identity<String>(),
  password<String>(),
  nickname<String>(),
  server<String>();

  const _AccountField({this.validators});

  @override
  final List<Validator<dynamic>>? validators;
}

/// 从设置页进入账号登录、资料和网页账号中心。
Future<void> openMobileAccountPage(BuildContext context) {
  return Navigator.of(context).push<void>(
    MaterialPageRoute<void>(builder: (_) => const MobileAccountPage()),
  );
}

class MobileAccountPage extends HookConsumerWidget {
  const MobileAccountPage({super.key, this.openExternal});

  /// 测试可替换外链打开。为空时用系统浏览器打开同域 /account。
  final MobileAccountUrlOpener? openExternal;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = RevericTheme.colorsOf(context);
    final typo = RevericTheme.typographyOf(context);
    final accountAsync = ref.watch(metaarcAccountProvider);
    final account = accountAsync.asData?.value;
    final submitting = useState(false);
    final showLoader =
        accountAsync.isLoading && !accountAsync.hasValue && !submitting.value;

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: AppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: RevericIcon(
            RevericIcons.arrow_back,
            size: 22,
            color: colors.textSecondary,
          ),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(
          context.t(LocaleKeys.accountStatusBadge),
          style: typo.uiSemibold.copyWith(color: colors.textPrimary),
        ),
      ),
      body: SafeArea(
        top: false,
        child: showLoader
            ? const Center(child: CircularProgressIndicator())
            : account == null
            ? _SignedOut(submitting: submitting, openExternal: openExternal)
            : _SignedIn(account: account, openExternal: openExternal),
      ),
    );
  }
}

class _SignedOut extends HookConsumerWidget {
  const _SignedOut({required this.submitting, required this.openExternal});

  final ValueNotifier<bool> submitting;
  final MobileAccountUrlOpener? openExternal;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = RevericTheme.colorsOf(context);
    final typo = RevericTheme.typographyOf(context);
    final isRegister = useState(false);
    final showPassword = useState(false);
    final failure = useState<String?>(null);
    final form = useForm<_AccountField>(
      initialValues: {
        _AccountField.identity: '',
        _AccountField.password: '',
        _AccountField.nickname: '',
        _AccountField.server: MetaArcAccount.defaultServerUrl,
      },
    );

    Future<void> submit() async {
      if (submitting.value) {
        return;
      }
      failure.value = null;
      // 字段没有静态 validator。上次 setError 留下的 forceErrorText
      // 要等下一帧才从输入框上拿掉，同一轮里调用 form.validate() 会误判失败。
      form.clearForcedErrors();
      final identity = (form.getValue<String>(_AccountField.identity) ?? '')
          .trim();
      final password = form.getValue<String>(_AccountField.password) ?? '';
      final nickname = (form.getValue<String>(_AccountField.nickname) ?? '')
          .trim();
      final server = (form.getValue<String>(_AccountField.server) ?? '').trim();
      final serverUrl = server.isEmpty
          ? MetaArcAccount.defaultServerUrl
          : server;

      if (isRegister.value) {
        if (identity.isEmpty || password.length < 6) {
          final message = context.t(LocaleKeys.accountRegisterInvalid);
          if (identity.isEmpty) {
            form.setError(_AccountField.identity, message);
          }
          if (password.length < 6) {
            form.setError(_AccountField.password, message);
          }
          return;
        }
      } else if (identity.isEmpty || password.isEmpty) {
        final message = context.t(LocaleKeys.accountCredentialsRequired);
        if (identity.isEmpty) {
          form.setError(_AccountField.identity, message);
        }
        if (password.isEmpty) {
          form.setError(_AccountField.password, message);
        }
        return;
      }

      submitting.value = true;
      try {
        final notifier = ref.read(metaarcAccountProvider.notifier);
        if (isRegister.value) {
          await notifier.register(
            serverUrl: serverUrl,
            phoneOrEmail: identity,
            password: password,
            nickname: nickname.isEmpty ? null : nickname,
          );
        } else {
          await notifier.login(
            serverUrl: serverUrl,
            account: identity,
            password: password,
          );
        }
      } catch (error, stack) {
        _log.error(
          'MetaArc account request failed',
          error: error,
          stackTrace: stack,
        );
        if (!context.mounted) {
          return;
        }
        failure.value = _accountFailureText(
          error,
          context.t(LocaleKeys.accountRequestFailed),
        );
      } finally {
        if (context.mounted) {
          submitting.value = false;
        }
      }
    }

    Future<void> openCenter() {
      final server = (form.getValue<String>(_AccountField.server) ?? '').trim();
      return _openAccountCenter(
        context,
        serverUrl: server.isEmpty ? null : server,
        openExternal: openExternal,
      );
    }

    return HookedForm<_AccountField>(
      form: form,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          RevericSpacing.x3l,
          RevericSpacing.lg,
          RevericSpacing.x3l,
          RevericSpacing.x6l,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            MobileSegmentedTabs(
              tabs: [
                context.t(LocaleKeys.accountTabLogin),
                context.t(LocaleKeys.accountTabRegister),
              ],
              selectedIndex: isRegister.value ? 1 : 0,
              onSelected: (index) {
                isRegister.value = index == 1;
                failure.value = null;
                form.clearForcedErrors();
              },
            ),
            const SizedBox(height: RevericSpacing.x2l),
            Text(
              context.t(
                isRegister.value
                    ? LocaleKeys.accountRegisterTitle
                    : LocaleKeys.accountLoginTitle,
              ),
              style: typo.uiSemibold.copyWith(color: colors.textPrimary),
            ),
            const SizedBox(height: RevericSpacing.lg),
            if (failure.value != null) ...[
              Text(
                failure.value!,
                style: typo.uiSmall.copyWith(color: colors.error),
              ),
              const SizedBox(height: RevericSpacing.md),
            ],
            HookedTextFormField<_AccountField>(
              fieldHook: _AccountField.identity,
              fieldKey: mobileAccountIdentityKey,
              label: context.t(LocaleKeys.accountPhoneOrEmail),
              hintText: context.t(LocaleKeys.accountPhoneOrEmailHint),
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              autocorrect: false,
              enableSuggestions: false,
              autofillHints: const [AutofillHints.username],
            ),
            if (isRegister.value) ...[
              const SizedBox(height: RevericSpacing.lg),
              HookedTextFormField<_AccountField>(
                fieldHook: _AccountField.nickname,
                fieldKey: mobileAccountNicknameKey,
                label: context.t(LocaleKeys.accountNickname),
                hintText: context.t(LocaleKeys.accountNicknameHint),
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.nickname],
              ),
            ],
            const SizedBox(height: RevericSpacing.lg),
            HookedTextFormField<_AccountField>(
              fieldHook: _AccountField.password,
              fieldKey: mobileAccountPasswordKey,
              label: context.t(LocaleKeys.accountPassword),
              hintText: context.t(
                isRegister.value
                    ? LocaleKeys.accountPasswordSetHint
                    : LocaleKeys.accountPasswordHint,
              ),
              obscureText: !showPassword.value,
              textInputAction: TextInputAction.next,
              autocorrect: false,
              enableSuggestions: false,
              autofillHints: [
                isRegister.value
                    ? AutofillHints.newPassword
                    : AutofillHints.password,
              ],
              suffixIcon: IconButton(
                onPressed: () => showPassword.value = !showPassword.value,
                icon: RevericIcon(
                  showPassword.value
                      ? RevericIcons.visibility_off
                      : RevericIcons.visibility,
                  size: 18,
                  color: colors.textMuted,
                ),
              ),
            ),
            const SizedBox(height: RevericSpacing.lg),
            HookedTextFormField<_AccountField>(
              fieldHook: _AccountField.server,
              fieldKey: mobileAccountServerKey,
              label: context.t(LocaleKeys.accountCloudGateway),
              hintText: MetaArcAccount.defaultServerUrl,
              keyboardType: TextInputType.url,
              textInputAction: TextInputAction.done,
              autocorrect: false,
              enableSuggestions: false,
              onFieldSubmitted: (_) => submit(),
            ),
            const SizedBox(height: RevericSpacing.lg),
            Text(
              context.t(LocaleKeys.accountLoginScopeHint),
              style: typo.uiSmall.copyWith(color: colors.textMuted),
            ),
            const SizedBox(height: RevericSpacing.x2l),
            RevericButton.primary(
              key: mobileAccountSubmitKey,
              label: context.t(
                isRegister.value
                    ? LocaleKeys.accountRegisterButton
                    : LocaleKeys.accountLoginButton,
              ),
              loading: submitting.value,
              onPressed: submit,
            ),
            const SizedBox(height: RevericSpacing.sm),
            RevericButton.secondary(
              key: mobileAccountCenterKey,
              label: context.t(LocaleKeys.accountCenter),
              onPressed: openCenter,
            ),
          ],
        ),
      ),
    );
  }
}

class _SignedIn extends HookConsumerWidget {
  const _SignedIn({required this.account, required this.openExternal});

  final MetaArcAccount account;
  final MobileAccountUrlOpener? openExternal;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = RevericTheme.colorsOf(context);
    final typo = RevericTheme.typographyOf(context);
    final refreshing = useState(false);
    final contact = _contactLine(account);
    final points = context.t(
      LocaleKeys.accountPointsUnit,
      namedArgs: {'points': account.quota.toStringAsFixed(1)},
    );

    Future<void> refresh() async {
      if (refreshing.value) {
        return;
      }
      refreshing.value = true;
      try {
        final ok = await ref
            .read(metaarcAccountProvider.notifier)
            .refreshProfile();
        if (!context.mounted || ok) {
          return;
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.t(LocaleKeys.accountRefreshFailed))),
        );
      } catch (error, stack) {
        _log.error(
          'MetaArc profile refresh failed',
          error: error,
          stackTrace: stack,
        );
        if (!context.mounted) {
          return;
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.t(LocaleKeys.accountRefreshFailed))),
        );
      } finally {
        if (context.mounted) {
          refreshing.value = false;
        }
      }
    }

    Future<void> copyKey() async {
      try {
        await Clipboard.setData(ClipboardData(text: account.newApiKey));
      } catch (error, stack) {
        _log.error(
          'Failed to copy MetaArc API key',
          error: error,
          stackTrace: stack,
        );
        return;
      }
      if (!context.mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.t(LocaleKeys.accountCopyKeySuccess))),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(
        RevericSpacing.x3l,
        RevericSpacing.lg,
        RevericSpacing.x3l,
        RevericSpacing.x6l,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(RevericSpacing.lg),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(RevericRadius.large),
              border: Border.all(color: colors.borderSubtle),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  account.displayName,
                  style: typo.uiSemibold.copyWith(color: colors.textPrimary),
                ),
                const SizedBox(height: RevericSpacing.xs),
                Text(
                  account.planName,
                  style: typo.uiSmall.copyWith(color: colors.accent),
                ),
                if (contact != null) ...[
                  const SizedBox(height: RevericSpacing.xs),
                  Text(
                    contact,
                    style: typo.uiSmall.copyWith(color: colors.textMuted),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: RevericSpacing.lg),
          Container(
            padding: const EdgeInsets.all(RevericSpacing.lg),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(RevericRadius.large),
              border: Border.all(color: colors.borderSubtle),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        context.t(LocaleKeys.accountAvailableQuota),
                        style: typo.uiSmall.copyWith(color: colors.textMuted),
                      ),
                    ),
                    Text(
                      points,
                      style: typo.uiSemibold.copyWith(color: colors.accent),
                    ),
                    if (account.hasQuotaTotal)
                      Text(
                        ' / ${account.totalQuota.toStringAsFixed(0)}',
                        style: typo.uiSmall.copyWith(color: colors.textMuted),
                      ),
                  ],
                ),
                const SizedBox(height: RevericSpacing.sm),
                if (account.hasQuotaTotal)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: account.quotaPercent,
                      backgroundColor: colors.surfaceContainer,
                      color: colors.accent,
                      minHeight: 8,
                    ),
                  )
                else
                  Text(
                    context.t(LocaleKeys.accountQuotaWithoutTotal),
                    style: typo.uiTiny.copyWith(color: colors.textMuted),
                  ),
                const SizedBox(height: RevericSpacing.md),
                Text(
                  context.t(
                    account.hasProvisionedApiKey
                        ? LocaleKeys.accountAutoProvisionHint
                        : LocaleKeys.accountChannelUnavailable,
                  ),
                  style: typo.uiSmall.copyWith(color: colors.textMuted),
                ),
              ],
            ),
          ),
          if (account.hasProvisionedApiKey) ...[
            const SizedBox(height: RevericSpacing.lg),
            Text(
              context.t(LocaleKeys.accountSecretKeyTitle),
              style: typo.uiSmallSemibold.copyWith(color: colors.textPrimary),
            ),
            const SizedBox(height: RevericSpacing.xs),
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: RevericSpacing.md,
                vertical: RevericSpacing.xs,
              ),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(RevericRadius.large),
                border: Border.all(color: colors.borderSubtle),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _maskSecret(account.newApiKey),
                      style: typo.uiSmall.copyWith(color: colors.textPrimary),
                    ),
                  ),
                  IconButton(
                    tooltip: context.t(LocaleKeys.accountCopyKey),
                    onPressed: copyKey,
                    icon: RevericIcon(
                      RevericIcons.copy,
                      size: 16,
                      color: colors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: RevericSpacing.lg),
          Text(
            context.t(LocaleKeys.accountMobileSignedInHint),
            style: typo.uiSmall.copyWith(color: colors.textMuted),
          ),
          const SizedBox(height: RevericSpacing.x2l),
          RevericButton.secondary(
            key: mobileAccountRefreshKey,
            label: context.t(LocaleKeys.accountRefreshQuota),
            loading: refreshing.value,
            onPressed: refresh,
          ),
          const SizedBox(height: RevericSpacing.sm),
          RevericButton.primary(
            key: mobileAccountCenterKey,
            label: context.t(LocaleKeys.accountCenter),
            onPressed: () => _openAccountCenter(
              context,
              serverUrl: account.serverUrl,
              openExternal: openExternal,
            ),
          ),
          const SizedBox(height: RevericSpacing.sm),
          RevericButton.danger(
            key: mobileAccountLogoutKey,
            label: context.t(LocaleKeys.accountLogout),
            onPressed: () => ref.read(metaarcAccountProvider.notifier).logout(),
          ),
        ],
      ),
    );
  }
}

String? _contactLine(MetaArcAccount account) {
  for (final value in [account.phone, account.email, account.userId]) {
    final text = value?.trim() ?? '';
    if (text.isNotEmpty) {
      return text;
    }
  }
  return null;
}

String _maskSecret(String key) {
  if (key.length > 12) {
    return '${key.substring(0, 8)}••••••••${key.substring(key.length - 4)}';
  }
  return key;
}

/// 认证服务用 `Exception(message)` 携带服务端可读文案。
/// `Exception()` 的运行时类型是 `_Exception`，只认 `Exception: ` 前缀。
/// SocketException、FormatException 等传输错误仍用兜底说明。
String _accountFailureText(Object error, String fallback) {
  const prefix = 'Exception: ';
  final text = error.toString();
  if (text.startsWith(prefix)) {
    final message = text.substring(prefix.length).trim();
    if (message.isNotEmpty) {
      return message;
    }
  }
  return fallback;
}

Future<void> _openAccountCenter(
  BuildContext context, {
  required String? serverUrl,
  required MobileAccountUrlOpener? openExternal,
}) async {
  final uri = Uri.parse(MetaArcAccount.accountCenterUrl(serverUrl));
  var opened = false;
  try {
    opened = await (openExternal ?? _launchExternal)(uri);
  } catch (error, stack) {
    _log.error(
      'Failed to open MetaArc account center',
      error: error,
      stackTrace: stack,
    );
    opened = false;
  }
  if (!context.mounted || opened) {
    return;
  }
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(context.t(LocaleKeys.accountOpenCenterFailed))),
  );
}

Future<bool> _launchExternal(Uri uri) {
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}
