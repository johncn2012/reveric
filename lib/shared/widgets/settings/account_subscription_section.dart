// 职责: MetaArc 会员账户与订阅中心设置页 — 展示当前登录用户资料、套餐级别、算力配额用量、有效期及续费操作。
// 关联文件:
//   lib/shared/models/metaarc_account.dart
//   lib/shared/providers/metaarc_providers.dart
//   lib/shared/widgets/metaarc_auth_dialog.dart
//   lib/shared/components/reveric_button.dart
//   lib/shared/theme/theme.dart
// 遵循的 Rules:
//   .agents/rules/code-style.md
//   .agents/rules/hooks.md
//   .agents/rules/design-system.md

import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../components/reveric_badge.dart';
import '../../components/reveric_button.dart';
import '../../components/reveric_surfaces.dart';
import '../../models/metaarc_account.dart';
import '../../providers/metaarc_providers.dart';
import '../../theme/theme.dart';
import '../metaarc_auth_dialog.dart';
import '../promo_badge.dart';

class AccountSubscriptionSection extends HookConsumerWidget {
  const AccountSubscriptionSection({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = RevericTheme.colorsOf(context);
    final typo = RevericTheme.typographyOf(context);
    final accountAsync = ref.watch(metaarcAccountProvider);
    final isRefreshing = useState(false);

    final account = accountAsync.asData?.value;

    Future<void> handleRefresh() async {
      isRefreshing.value = true;
      try {
        await ref.read(metaarcAccountProvider.notifier).refreshProfile();
      } finally {
        isRefreshing.value = false;
      }
    }

    void handleOpenPricing() {
      final pricingUrl = Uri.parse('https://metaarc.com.cn/pricing');
      launchUrl(pricingUrl, mode: LaunchMode.externalApplication);
    }

    void handleOpenAccountCenter() {
      final centerUrl = Uri.parse(MetaArcAccount.accountCenterUrl(account?.serverUrl));
      launchUrl(centerUrl, mode: LaunchMode.externalApplication);
    }

    return SingleChildScrollView(
      padding: EdgeInsets.all(
        compact ? RevericSpacing.x3l : RevericSpacing.x4l,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                '账户与订阅',
                style: compact ? typo.uiSemibold : typo.heading2,
              ),
              const Spacer(),
              if (account != null)
                RevericButton.text(
                  label: '刷新用量',
                  icon: RevericIcons.arrow_clockwise,
                  size: RevericButtonSize.compact,
                  loading: isRefreshing.value,
                  onPressed: handleRefresh,
                ),
            ],
          ),
          const SizedBox(height: RevericSpacing.x3l),
          if (account == null)
            _buildGuestCard(context, colors, typo)
          else ...[
            _buildProfileCard(context, colors, typo, account),
            const SizedBox(height: RevericSpacing.x3l),
            _buildSubscriptionCard(context, colors, typo, account, handleOpenPricing, handleOpenAccountCenter),
            const SizedBox(height: RevericSpacing.x3l),
            _buildQuotaCard(context, colors, typo, account),
            const SizedBox(height: RevericSpacing.x4l),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: RevericButton.secondary(
                label: '退出登录',
                icon: RevericIcons.sign_out,
                onPressed: () async {
                  await ref.read(metaarcAccountProvider.notifier).logout();
                },
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildGuestCard(
    BuildContext context,
    RevericColors colors,
    RevericTypography typo,
  ) {
    return RevericElevatedCard(
      fallback: colors.surface,
      padding: const EdgeInsets.all(RevericSpacing.x3l),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: colors.accent.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: RevericIcon(
                  RevericIcons.person_outline,
                  size: 24,
                  color: colors.accent,
                ),
              ),
              const SizedBox(width: RevericSpacing.lg),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '未登录 MetaArc 账号',
                      style: typo.uiSemibold.copyWith(
                        color: colors.textPrimary,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: RevericSpacing.xxs),
                    Text(
                      '登录或注册 MetaArc 官方账号，即可自动同步会员权益、算力点数与云端存储。',
                      style: typo.uiSmall.copyWith(color: colors.textMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: RevericSpacing.x2l),
          Row(
            children: [
              RevericButton.primary(
                label: '登录 / 注册账号',
                icon: RevericIcons.sign_in,
                onPressed: () => showMetaArcAuthDialog(context),
              ),
              const SizedBox(width: RevericSpacing.md),
              RevericButton.secondary(
                label: '查看会员方案',
                icon: RevericIcons.arrow_square_out,
                onPressed: () {
                  launchUrl(
                    Uri.parse('https://metaarc.com.cn/pricing'),
                    mode: LaunchMode.externalApplication,
                  );
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildProfileCard(
    BuildContext context,
    RevericColors colors,
    RevericTypography typo,
    MetaArcAccount account,
  ) {
    final name = (account.nickname?.trim().isNotEmpty ?? false)
        ? account.nickname!
        : (account.email ?? account.phone ?? 'MetaArc 创作者');
    final contact = account.email ?? account.phone ?? '';

    return RevericElevatedCard(
      fallback: colors.surface,
      padding: const EdgeInsets.all(RevericSpacing.x3l),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [colors.accent, colors.accentWarm],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              name.characters.take(1).toString().toUpperCase(),
              style: typo.heading2.copyWith(color: Colors.white),
            ),
          ),
          const SizedBox(width: RevericSpacing.lg),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      name,
                      style: typo.uiSemibold.copyWith(
                        color: colors.textPrimary,
                        fontSize: 17,
                      ),
                    ),
                    const SizedBox(width: RevericSpacing.sm),
                    _buildPlanBadge(account.plan, colors),
                  ],
                ),
                if (contact.isNotEmpty) ...[
                  const SizedBox(height: RevericSpacing.xxs),
                  Text(
                    contact,
                    style: typo.uiSmall.copyWith(color: colors.textMuted),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSubscriptionCard(
    BuildContext context,
    RevericColors colors,
    RevericTypography typo,
    MetaArcAccount account,
    VoidCallback onUpgrade,
    VoidCallback onManage,
  ) {
    final isProOrStudio = account.plan == 'pro' || account.plan == 'studio';
    final planTitle = switch (account.plan) {
      'studio' => '工作室旗舰版 (Studio)',
      'pro' => '专业创作者版 (Pro)',
      _ => '免费基础版 (Free)',
    };

    String expireText;
    if (account.expiresAt != null) {
      final d = account.expiresAt!;
      expireText = '${d.year}年${d.month}月${d.day}日到期';
    } else {
      expireText = isProOrStudio ? '有效订阅中' : '永久有效';
    }

    return RevericElevatedCard(
      fallback: colors.surface,
      padding: const EdgeInsets.all(RevericSpacing.x3l),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              RevericIcon(
                RevericIcons.star,
                color: colors.accent,
                size: 20,
              ),
              const SizedBox(width: RevericSpacing.sm),
              Text(
                '会员订阅特权',
                style: typo.uiSemibold.copyWith(
                  color: colors.textPrimary,
                  fontSize: 15,
                ),
              ),
              const Spacer(),
              Text(
                expireText,
                style: typo.uiSmall.copyWith(color: colors.textMuted),
              ),
            ],
          ),
          const SizedBox(height: RevericSpacing.md),
          Text(
            planTitle,
            style: typo.heading2.copyWith(
              color: colors.accent,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: RevericSpacing.sm),
          Text(
            isProOrStudio
                ? '享有全平台高速算力、高并发 AI 编排助手、无限制章节扩写及专属 CDN 存储。'
                : '当前为免费基础版，升级会员可享更充沛的创作算力与超长正文生成特权。',
            style: typo.ui.copyWith(color: colors.textSecondary, height: 1.5),
          ),
          const SizedBox(height: RevericSpacing.x2l),
          Row(
            children: [
              RevericButton.primary(
                label: isProOrStudio ? '续费 / 升级方案' : '立即升级专业版',
                icon: RevericIcons.star,
                onPressed: onUpgrade,
              ),
              const SizedBox(width: RevericSpacing.md),
              RevericButton.secondary(
                label: '账户中心',
                icon: RevericIcons.arrow_square_out,
                onPressed: onManage,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildQuotaCard(
    BuildContext context,
    RevericColors colors,
    RevericTypography typo,
    MetaArcAccount account,
  ) {
    final remainingQuota = account.quota;
    final totalQuota = account.totalQuota > 0 ? account.totalQuota : 100.0;
    final ratio = (remainingQuota / totalQuota).clamp(0.0, 1.0);

    return RevericElevatedCard(
      fallback: colors.surface,
      padding: const EdgeInsets.all(RevericSpacing.x3l),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              RevericIcon(
                RevericIcons.bar_chart_outlined,
                color: colors.accent,
                size: 20,
              ),
              const SizedBox(width: RevericSpacing.sm),
              Text(
                '算力点数与配额',
                style: typo.uiSemibold.copyWith(
                  color: colors.textPrimary,
                  fontSize: 15,
                ),
              ),
            ],
          ),
          const SizedBox(height: RevericSpacing.lg),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                remainingQuota.toStringAsFixed(1),
                style: typo.display.copyWith(
                  color: colors.textPrimary,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(width: RevericSpacing.xs),
              Text(
                '点剩余',
                style: typo.ui.copyWith(color: colors.textMuted),
              ),
            ],
          ),
          const SizedBox(height: RevericSpacing.md),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: ratio,
              minHeight: 8,
              backgroundColor: colors.borderSubtle,
              valueColor: AlwaysStoppedAnimation(colors.accent),
            ),
          ),
          const SizedBox(height: RevericSpacing.md),
          Text(
            '算力点数用于驱动 MetaArc 创作助手、深度思考、续写及多模态资产生成。',
            style: typo.uiSmall.copyWith(color: colors.textMuted),
          ),
        ],
      ),
    );
  }

  Widget _buildPlanBadge(String plan, RevericColors colors) {
    final (label, bg) = switch (plan) {
      'studio' => ('工作室版', colors.accent),
      'pro' => ('专业版', colors.accentWarm),
      _ => ('免费版', colors.borderSubtle),
    };

    return RevericPromoBadge(label);
  }
}
