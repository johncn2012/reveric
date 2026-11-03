// 职责: 展示本地用户名和头像，点击后编辑本地资料；联动展示 MetaArc 云端算力中枢状态。
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
        final username = settings.username.isNotEmpty
            ? settings.username
            : 'Reveric';
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
          return InkWell(
            onTap: openAccount,
            hoverColor: colors.hover,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: RevericSpacing.md),
              child: Center(child: avatar),
            ),
          );
        }

        if (mode == UserProfileBarMode.dense) {
          return InkWell(
            onTap: openAccount,
            hoverColor: colors.hover,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: RevericSpacing.sm,
                vertical: RevericSpacing.sm,
              ),
              child: Row(
                children: [
                  avatar,
                  const SizedBox(width: RevericSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                username,
                                style: typo.uiSmall.copyWith(
                                  color: colors.textPrimary,
                                ),
                                overflow: TextOverflow.ellipsis,
                                maxLines: 1,
                              ),
                            ),
                            if (metaArcAccount != null) ...[
                              const SizedBox(width: 4),
                              Container(
                                width: 6,
                                height: 6,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: colors.accent,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
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
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                              decoration: BoxDecoration(
                                color: colors.accent.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(3),
                              ),
                              child: Text(
                                metaArcAccount != null ? 'METAARC' : context.t(LocaleKeys.accountCloudBadge),
                                style: typo.uiTiny.copyWith(
                                  color: colors.accent,
                                  fontSize: 9,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              metaArcAccount != null
                                  ? '${metaArcAccount.quota.toStringAsFixed(0)}点 · ${metaArcAccount.plan.toUpperCase()}'
                                  : context.t(LocaleKeys.accountConnectHub),
                              style: typo.uiTiny.copyWith(
                                color: colors.textMuted,
                                fontSize: 10,
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
                      ? 'MetaArc 算力中枢 (${metaArcAccount.quota.toStringAsFixed(1)}点)'
                      : '连接 MetaArc 云端会员算力',
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
