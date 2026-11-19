// 职责: 展示本地资料，并用账号状态位打开已有的 MetaArc 账号流程。
// 关联文件:
//   lib/shared/providers/settings_providers.dart
//   lib/shared/providers/metaarc_providers.dart
//   lib/shared/widgets/metaarc_auth_dialog.dart
//   lib/shared/theme/theme.dart
//   lib/shared/utils/storage_paths.dart
//   lib/desktop/widgets/settings/settings_dialog.dart
//   lib/shared/widgets/user_profile_edit_dialog.dart (本地资料编辑)
//   lib/shared/localization/locale_keys.dart
//   assets/translations/en/account.json
//   assets/translations/zh-CN/account.json
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../shared/components/reveric_dialog.dart';
import '../../shared/localization/app_localization.dart';
import '../../shared/localization/locale_keys.dart';
import '../../shared/models/metaarc_account.dart';
import '../../shared/providers/metaarc_providers.dart';
import '../../shared/providers/settings_providers.dart';
import '../../shared/theme/theme.dart';
import '../../shared/utils/storage_paths.dart';
import '../../shared/widgets/metaarc_auth_dialog.dart';
import '../../shared/widgets/user_profile_edit_dialog.dart';

/// 用户信息栏的布局模式。
enum UserProfileBarMode {
  /// 宽侧边栏（如首页 280px）— 大头像 + 用户名 + 右侧箭头/算力入口。
  generous,

  /// 窄侧边栏（如小说编辑页 rail 132px）— 小头像 + 用户名。
  dense,

  /// 仅头像，居中（折叠后的窄轨）。
  iconOnly,
}

class UserProfileBar extends ConsumerWidget {
  const UserProfileBar({super.key, this.mode = UserProfileBarMode.generous});

  final UserProfileBarMode mode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = RevericTheme.colorsOf(context);
    final typo = RevericTheme.typographyOf(context);
    final settingsAsync = ref.watch(appSettingsProvider);
    final metaArcAccountAsync = ref.watch(metaarcAccountProvider);
    final metaArcAccount = metaArcAccountAsync.asData?.value;

    return settingsAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
      data: (settings) {
        final username = () {
          final nickname = metaArcAccount?.nickname?.trim();
          if (nickname != null && nickname.isNotEmpty) {
            return nickname;
          }
          final email = metaArcAccount?.email;
          if (email != null && email.trim().isNotEmpty) {
            return email.trim().split('@').first;
          }
          if (settings.username.isNotEmpty && settings.username != '晚风客') {
            return settings.username;
          }
          return context.t(LocaleKeys.accountLocalNameEmpty);
        }();
        final accountStatus = _accountStatusLabel(context, metaArcAccount);
        final resolvedAvatar = RevericPaths.resolveStored(settings.avatarPath);

        final avatarSize = switch (mode) {
          UserProfileBarMode.generous => RevericSizes.avatarRadiusLg * 2,
          UserProfileBarMode.dense => 22.0,
          UserProfileBarMode.iconOnly => RevericSizes.aiAvatarSm,
        };
        final avatarIconSize = switch (mode) {
          UserProfileBarMode.generous => RevericSizes.avatarRadiusLg,
          UserProfileBarMode.dense => 16.0,
          UserProfileBarMode.iconOnly => 14.0,
        };

        void openAccount() {
          showRevericDialog<void>(
            context: context,
            builder: (_) => const UserProfileEditDialog(),
          );
        }

        void openMetaArcAuth() {
          showRevericDialog<void>(
            context: context,
            builder: (_) => const MetaArcAuthDialog(),
          );
        }

        final avatar = Container(
          width: avatarSize,
          height: avatarSize,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: colors.surfaceContainer,
          ),
          child: ClipOval(
            child: resolvedAvatar != null
                ? Image.file(
                    File(resolvedAvatar),
                    width: avatarSize,
                    height: avatarSize,
                    fit: BoxFit.cover,
                    cacheWidth: (avatarSize * 2).toInt(),
                    errorBuilder: (_, _, _) => RevericIcon(
                      RevericIcons.person,
                      size: avatarIconSize,
                      color: colors.textMuted,
                    ),
                  )
                : RevericIcon(
                    RevericIcons.person,
                    size: avatarIconSize,
                    color: colors.textMuted,
                  ),
          ),
        );

        if (mode == UserProfileBarMode.iconOnly) {
          return Tooltip(
            message: accountStatus,
            child: InkWell(
              onTap: openAccount,
              hoverColor: colors.hover,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: RevericSpacing.md),
                child: Center(child: avatar),
              ),
            ),
          );
        }

        if (mode == UserProfileBarMode.dense) {
          return Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: RevericSpacing.sm,
              vertical: RevericSpacing.sm,
            ),
            child: Row(
              children: [
                InkWell(onTap: openAccount, child: avatar),
                const SizedBox(width: RevericSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      InkWell(
                        onTap: openAccount,
                        child: Text(
                          username,
                          style: typo.uiSmall.copyWith(
                            color: colors.textPrimary,
                          ),
                          overflow: TextOverflow.ellipsis,
                          maxLines: 1,
                        ),
                      ),
                      InkWell(
                        onTap: openMetaArcAuth,
                        child: Text(
                          accountStatus,
                          style: typo.uiTiny.copyWith(color: colors.textMuted),
                          overflow: TextOverflow.ellipsis,
                          maxLines: 1,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        }

        // generous (主首页宽侧边栏)
        return Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: RevericSpacing.lg,
            vertical: RevericSpacing.md,
          ),
          child: Container(
            padding: const EdgeInsets.all(RevericSpacing.sm),
            decoration: BoxDecoration(
              color: colors.surfaceContainer.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(RevericRadius.medium),
              border: Border.all(color: colors.borderSubtle.withValues(alpha: 0.5)),
            ),
            child: Row(
              children: [
                InkWell(
                  onTap: openAccount,
                  borderRadius: BorderRadius.circular(RevericRadius.large),
                  child: avatar,
                ),
                const SizedBox(width: RevericSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      InkWell(
                        onTap: openAccount,
                        child: Text(
                          username,
                          style: typo.uiSemibold.copyWith(
                            color: colors.textPrimary,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(height: 2),
                      InkWell(
                        onTap: openMetaArcAuth,
                        borderRadius: BorderRadius.circular(4),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                              decoration: BoxDecoration(
                                color: colors.accent.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(3),
                              ),
                              child: Text(
                                context.t(LocaleKeys.accountStatusBadge),
                                style: typo.uiTiny.copyWith(
                                  color: colors.accent,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                accountStatus,
                                style: typo.uiTiny.copyWith(
                                  color: colors.textMuted,
                                ),
                                overflow: TextOverflow.ellipsis,
                                maxLines: 1,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: RevericSpacing.xs),
                IconButton(
                  icon: RevericIcon(
                    RevericIcons.cloud,
                    size: 16,
                    color: metaArcAccount != null ? colors.accent : colors.textSubtle,
                  ),
                  tooltip: metaArcAccount != null
                      ? accountStatus
                      : context.t(LocaleKeys.accountOpenFlow),
                  onPressed: openMetaArcAuth,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

String _accountStatusLabel(BuildContext context, MetaArcAccount? account) {
  if (account == null) {
    return context.t(LocaleKeys.accountSignedOut);
  }
  final points = context.t(
    LocaleKeys.accountPointsUnit,
    namedArgs: {'points': account.quota.toStringAsFixed(1)},
  );
  return '$points · ${account.planName}';
}
