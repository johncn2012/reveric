// 职责: MetaArc 会员账号管理弹窗 — 提供云端会员登录注册、配额与套餐监控、New-API 专属密钥查阅及 Web 充值入口。
// 关联文件:
//   lib/shared/components/reveric_dialog.dart
//   lib/shared/components/reveric_button.dart
//   lib/shared/models/metaarc_account.dart
//   lib/shared/providers/metaarc_providers.dart
//   lib/shared/theme/theme.dart
//   lib/shared/localization/locale_keys.dart
//   assets/translations/en/account.json
//   assets/translations/zh-CN/account.json
// 遵循的 Rules:
//   .agents/rules/code-style.md
//   .agents/rules/hooks.md
//   .agents/rules/form.md
//   .agents/rules/design-system.md
//   .agents/rules/i18n.md

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../components/reveric_button.dart';
import '../components/reveric_dialog.dart';
import '../localization/app_localization.dart';
import '../localization/locale_keys.dart';
import '../models/metaarc_account.dart';
import '../providers/metaarc_providers.dart';
import '../theme/theme.dart';

class MetaArcAuthDialog extends HookConsumerWidget {
  const MetaArcAuthDialog({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = RevericTheme.colorsOf(context);
    final typo = RevericTheme.typographyOf(context);

    final accountAsync = ref.watch(metaarcAccountProvider);
    final account = accountAsync.asData?.value;

    final isRegisterMode = useState(false);
    final isSubmitting = useState(false);
    final errorMessage = useState<String?>(null);

    final serverController = useTextEditingController(
      text: account?.serverUrl ?? 'https://api.metaarc.com.cn',
    );
    final accountController = useTextEditingController();
    final passwordController = useTextEditingController();
    final nicknameController = useTextEditingController();
    final showPassword = useState(false);

    Future<void> handleLogin() async {
      if (isSubmitting.value) return;
      final server = serverController.text.trim();
      final act = accountController.text.trim();
      final pwd = passwordController.text;

      if (act.isEmpty || pwd.isEmpty) {
        errorMessage.value = '请输入手机号/邮箱及密码';
        return;
      }

      isSubmitting.value = true;
      errorMessage.value = null;

      try {
        await ref.read(metaarcAccountProvider.notifier).login(
          serverUrl: server.isNotEmpty ? server : 'https://api.metaarc.com.cn',
          account: act,
          password: pwd,
        );
      } catch (e) {
        errorMessage.value = e.toString().replaceFirst('Exception: ', '');
      } finally {
        isSubmitting.value = false;
      }
    }

    Future<void> handleRegister() async {
      if (isSubmitting.value) return;
      final server = serverController.text.trim();
      final act = accountController.text.trim();
      final pwd = passwordController.text;
      final nick = nicknameController.text.trim();

      if (act.isEmpty || pwd.length < 6) {
        errorMessage.value = '账号不能为空，密码长度至少 6 位';
        return;
      }

      isSubmitting.value = true;
      errorMessage.value = null;

      try {
        await ref.read(metaarcAccountProvider.notifier).register(
          serverUrl: server.isNotEmpty ? server : 'https://api.metaarc.com.cn',
          phoneOrEmail: act,
          password: pwd,
          nickname: nick.isNotEmpty ? nick : null,
        );
      } catch (e) {
        errorMessage.value = e.toString().replaceFirst('Exception: ', '');
      } finally {
        isSubmitting.value = false;
      }
    }

    Future<void> handleRefresh() async {
      isSubmitting.value = true;
      try {
        await ref.read(metaarcAccountProvider.notifier).refreshProfile();
      } finally {
        isSubmitting.value = false;
      }
    }

    Future<void> handleLogout() async {
      await ref.read(metaarcAccountProvider.notifier).logout();
    }

    Future<void> openRechargeWeb() async {
      final webUrl = Uri.parse(
        account?.serverUrl.replaceFirst('api.', '') ?? 'https://metaarc.com.cn',
      );
      if (await canLaunchUrl(webUrl)) {
        await launchUrl(webUrl, mode: LaunchMode.externalApplication);
      }
    }

    // 已登录界面
    if (account != null) {
      return RevericDialog.panel(
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: colors.accent.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(RevericRadius.small),
                border: Border.all(color: colors.accent.withValues(alpha: 0.3)),
              ),
              child: Text(
                'METAARC',
                style: typo.uiTinySemibold.copyWith(
                  color: colors.accent,
                  letterSpacing: 1.2,
                ),
              ),
            ),
            const SizedBox(width: RevericSpacing.md),
            Text(
              context.t(LocaleKeys.accountHubTitle),
              style: typo.titleMedium.copyWith(color: colors.textPrimary),
            ),
          ],
        ),
        width: 440,
        content: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: RevericSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // 账号基础信息卡片
                Container(
                  padding: const EdgeInsets.all(RevericSpacing.lg),
                  decoration: BoxDecoration(
                    color: colors.surfaceDim,
                    borderRadius: BorderRadius.circular(RevericRadius.medium),
                    border: Border.all(color: colors.borderSubtle),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: colors.accent.withValues(alpha: 0.2),
                          border: Border.all(color: colors.accent, width: 1.5),
                        ),
                        child: Center(
                          child: RevericIcon(
                            RevericIcons.person,
                            size: 24,
                            color: colors.accent,
                          ),
                        ),
                      ),
                      const SizedBox(width: RevericSpacing.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Flexible(
                                  child: Text(
                                    account.displayName,
                                    style: typo.uiSemibold.copyWith(
                                      color: colors.textPrimary,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: colors.accent.withValues(alpha: 0.2),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    account.planName,
                                    style: typo.uiTiny.copyWith(
                                      color: colors.accent,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              account.phone ?? account.email ?? account.userId,
                              style: typo.uiTiny.copyWith(color: colors.textMuted),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: RevericSpacing.lg),

                // 算力配额仪表盘
                Container(
                  padding: const EdgeInsets.all(RevericSpacing.lg),
                  decoration: BoxDecoration(
                    color: colors.surfaceDim,
                    borderRadius: BorderRadius.circular(RevericRadius.medium),
                    border: Border.all(color: colors.borderSubtle),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            context.t(LocaleKeys.accountAvailableQuota),
                            style: typo.uiSmall.copyWith(color: colors.textMuted),
                          ),
                          Row(
                            children: [
                              Text(
                                context.t(
                                  LocaleKeys.accountPointsUnit,
                                  args: [account.quota.toStringAsFixed(1)],
                                ),
                                style: typo.uiMediumSemibold.copyWith(
                                  color: colors.accent,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              if (account.totalQuota > 0)
                                Text(
                                  ' / ${account.totalQuota.toStringAsFixed(0)}',
                                  style: typo.uiSmall.copyWith(color: colors.textMuted),
                                ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: RevericSpacing.sm),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: account.totalQuota > 0 ? account.quotaPercent : 1.0,
                          backgroundColor: colors.surfaceContainer,
                          valueColor: AlwaysStoppedAnimation<Color>(colors.accent),
                          minHeight: 8,
                        ),
                      ),
                      const SizedBox(height: RevericSpacing.md),
                      Row(
                        children: [
                          RevericIcon(
                            RevericIcons.check,
                            size: 14,
                            color: colors.accent,
                          ),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              context.t(LocaleKeys.accountAutoProvisionHint),
                              style: typo.uiTiny.copyWith(color: colors.textMuted),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: RevericSpacing.lg),

                // 专属 API Key 快捷复制
                if (account.newApiKey.isNotEmpty) ...[
                  Text(
                    context.t(LocaleKeys.accountSecretKeyTitle),
                    style: typo.uiSmallSemibold.copyWith(color: colors.textPrimary),
                  ),
                  const SizedBox(height: RevericSpacing.xs),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: RevericSpacing.md,
                      vertical: RevericSpacing.sm,
                    ),
                    decoration: BoxDecoration(
                      color: colors.canvas,
                      borderRadius: BorderRadius.circular(RevericRadius.medium),
                      border: Border.all(color: colors.borderInput),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            account.newApiKey.length > 12
                                ? '${account.newApiKey.substring(0, 8)}••••••••${account.newApiKey.substring(account.newApiKey.length - 4)}'
                                : account.newApiKey,
                            style: typo.uiSmall.copyWith(
                              color: colors.textPrimary,
                              fontFamily: 'monospace',
                            ),
                          ),
                        ),
                        IconButton(
                          icon: RevericIcon(
                            RevericIcons.file_copy,
                            size: 16,
                            color: colors.textMuted,
                          ),
                          tooltip: context.t(LocaleKeys.accountCopyKey),
                          onPressed: () {
                            Clipboard.setData(ClipboardData(text: account.newApiKey));
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(context.t(LocaleKeys.accountCopyKeySuccess)),
                                duration: const Duration(seconds: 2),
                              ),
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        actions: [
          RevericButton.secondary(
            label: context.t(LocaleKeys.accountLogout),
            onPressed: handleLogout,
          ),
          RevericButton.secondary(
            label: context.t(LocaleKeys.accountRefreshQuota),
            loading: isSubmitting.value,
            onPressed: handleRefresh,
          ),
          RevericButton.primary(
            label: context.t(LocaleKeys.accountUpgradePlan),
            onPressed: openRechargeWeb,
          ),
        ],
      );
    }

    // 未登录/注册界面
    return RevericDialog.panel(
      title: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: colors.accent.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(RevericRadius.small),
              border: Border.all(color: colors.accent.withValues(alpha: 0.3)),
            ),
            child: Text(
              'METAARC',
              style: typo.uiTinySemibold.copyWith(
                color: colors.accent,
                letterSpacing: 1.2,
              ),
            ),
          ),
          const SizedBox(width: RevericSpacing.md),
          Text(
            isRegisterMode.value
                ? context.t(LocaleKeys.accountRegisterTitle)
                : context.t(LocaleKeys.accountLoginTitle),
            style: typo.titleMedium.copyWith(color: colors.textPrimary),
          ),
        ],
      ),
      width: 440,
      content: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: RevericSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // 模式切换
              Row(
                children: [
                  Expanded(
                    child: InkWell(
                      onTap: () {
                        isRegisterMode.value = false;
                        errorMessage.value = null;
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          border: Border(
                            bottom: BorderSide(
                              color: !isRegisterMode.value ? colors.accent : colors.borderSubtle,
                              width: 2,
                            ),
                          ),
                        ),
                        child: Text(
                          context.t(LocaleKeys.accountTabLogin),
                          style: typo.uiSmallSemibold.copyWith(
                            color: !isRegisterMode.value ? colors.accent : colors.textMuted,
                          ),
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: InkWell(
                      onTap: () {
                        isRegisterMode.value = true;
                        errorMessage.value = null;
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          border: Border(
                            bottom: BorderSide(
                              color: isRegisterMode.value ? colors.accent : colors.borderSubtle,
                              width: 2,
                            ),
                          ),
                        ),
                        child: Text(
                          context.t(LocaleKeys.accountTabRegister),
                          style: typo.uiSmallSemibold.copyWith(
                            color: isRegisterMode.value ? colors.accent : colors.textMuted,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: RevericSpacing.lg),

              if (errorMessage.value != null) ...[
                Container(
                  padding: const EdgeInsets.all(RevericSpacing.sm),
                  decoration: BoxDecoration(
                    color: Colors.red.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(RevericRadius.small),
                    border: Border.all(color: Colors.red.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline, size: 16, color: Colors.redAccent),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          errorMessage.value!,
                          style: typo.uiTiny.copyWith(color: Colors.redAccent),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: RevericSpacing.md),
              ],

              // 账号/手机号
              Text(
                context.t(LocaleKeys.accountPhoneOrEmail),
                style: typo.uiSmallSemibold.copyWith(color: colors.textPrimary),
              ),
              const SizedBox(height: RevericSpacing.xs),
              TextField(
                controller: accountController,
                style: typo.uiSmall.copyWith(color: colors.textPrimary),
                decoration: InputDecoration(
                  hintText: context.t(LocaleKeys.accountPhoneOrEmailHint),
                  hintStyle: typo.uiSmall.copyWith(color: colors.textMuted),
                  filled: true,
                  fillColor: colors.canvas,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(RevericRadius.medium),
                    borderSide: BorderSide(color: colors.borderInput),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: RevericSpacing.md,
                    vertical: RevericSpacing.sm,
                  ),
                ),
              ),
              const SizedBox(height: RevericSpacing.md),

              // 昵称（仅注册）
              if (isRegisterMode.value) ...[
                Text(
                  context.t(LocaleKeys.accountNickname),
                  style: typo.uiSmallSemibold.copyWith(color: colors.textPrimary),
                ),
                const SizedBox(height: RevericSpacing.xs),
                TextField(
                  controller: nicknameController,
                  style: typo.uiSmall.copyWith(color: colors.textPrimary),
                  decoration: InputDecoration(
                    hintText: context.t(LocaleKeys.accountNicknameHint),
                    hintStyle: typo.uiSmall.copyWith(color: colors.textMuted),
                    filled: true,
                    fillColor: colors.canvas,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(RevericRadius.medium),
                      borderSide: BorderSide(color: colors.borderInput),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: RevericSpacing.md,
                      vertical: RevericSpacing.sm,
                    ),
                  ),
                ),
                const SizedBox(height: RevericSpacing.md),
              ],

              // 密码
              Text(
                context.t(LocaleKeys.accountPassword),
                style: typo.uiSmallSemibold.copyWith(color: colors.textPrimary),
              ),
              const SizedBox(height: RevericSpacing.xs),
              TextField(
                controller: passwordController,
                obscureText: !showPassword.value,
                style: typo.uiSmall.copyWith(color: colors.textPrimary),
                decoration: InputDecoration(
                  hintText: isRegisterMode.value
                      ? context.t(LocaleKeys.accountPasswordSetHint)
                      : context.t(LocaleKeys.accountPasswordHint),
                  hintStyle: typo.uiSmall.copyWith(color: colors.textMuted),
                  filled: true,
                  fillColor: colors.canvas,
                  suffixIcon: IconButton(
                    icon: Icon(
                      showPassword.value ? Icons.visibility_off : Icons.visibility,
                      size: 18,
                      color: colors.textMuted,
                    ),
                    onPressed: () => showPassword.value = !showPassword.value,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(RevericRadius.medium),
                    borderSide: BorderSide(color: colors.borderInput),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: RevericSpacing.md,
                    vertical: RevericSpacing.sm,
                  ),
                ),
              ),
              const SizedBox(height: RevericSpacing.md),

              // 服务器网关
              Text(
                context.t(LocaleKeys.accountCloudGateway),
                style: typo.uiTiny.copyWith(color: colors.textMuted),
              ),
              const SizedBox(height: RevericSpacing.xs),
              TextField(
                controller: serverController,
                style: typo.uiTiny.copyWith(color: colors.textMuted),
                decoration: InputDecoration(
                  hintText: 'https://api.metaarc.com.cn',
                  hintStyle: typo.uiTiny.copyWith(color: colors.textMuted),
                  filled: true,
                  fillColor: colors.canvas,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(RevericRadius.medium),
                    borderSide: BorderSide(color: colors.borderInput),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: RevericSpacing.md,
                    vertical: 6,
                  ),
                ),
              ),
              const SizedBox(height: RevericSpacing.lg),

              // 特权提示
              Container(
                padding: const EdgeInsets.all(RevericSpacing.md),
                decoration: BoxDecoration(
                  color: colors.surfaceDim,
                  borderRadius: BorderRadius.circular(RevericRadius.medium),
                ),
                child: Row(
                  children: [
                    RevericIcon(
                      RevericIcons.info_outline,
                      size: 16,
                      color: colors.accent,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '登录后将自动装配 New-API 统一算力池与云端对象存储，支持全平台多端同步。',
                        style: typo.uiTiny.copyWith(color: colors.textMuted),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        RevericButton.secondary(
          label: context.t(LocaleKeys.commonCancel),
          onPressed: () => Navigator.of(context).pop(),
        ),
        RevericButton.primary(
          label: isRegisterMode.value
              ? context.t(LocaleKeys.accountRegisterButton)
              : context.t(LocaleKeys.accountLoginButton),
          loading: isSubmitting.value,
          onPressed: isRegisterMode.value ? handleRegister : handleLogin,
        ),
      ],
    );
  }
}
