// 职责: MetaArc 会员账号与算力配额数据模型定义、JSON 序列化与解析。
// 关联文件:
//   lib/shared/services/remote/metaarc_auth_service.dart
//   lib/shared/providers/metaarc_providers.dart
//   lib/shared/widgets/metaarc_auth_dialog.dart
// 遵循的 Rules:
//   .agents/rules/code-style.md
//   .agents/rules/json.md

class MetaArcAccount {
  const MetaArcAccount({
    required this.userId,
    required this.token,
    this.email,
    this.phone,
    this.nickname,
    this.plan = 'free',
    this.newApiKey = '',
    this.newApiBaseUrl = 'https://api.metaarc.com.cn/v1',
    this.quota = 0.0,
    this.totalQuota = 0.0,
    this.serverUrl = 'https://api.metaarc.com.cn',
    this.updatedAt,
    this.expiresAt,
  });

  final String userId;
  final String token;
  final String? email;
  final String? phone;
  final String? nickname;
  final String plan;
  final String newApiKey;
  final String newApiBaseUrl;
  final double quota;
  final double totalQuota;
  final String serverUrl;
  final DateTime? updatedAt;
  final DateTime? expiresAt;

  /// 计算剩余额度百分比 (0.0 ~ 1.0)
  double get quotaPercent {
    if (totalQuota <= 0) return 0.0;
    return (quota / totalQuota).clamp(0.0, 1.0);
  }

  /// 显示名称
  String get displayName {
    if (nickname != null && nickname!.trim().isNotEmpty) {
      return nickname!.trim();
    }
    if (phone != null && phone!.trim().isNotEmpty) {
      final p = phone!.trim();
      if (p.length >= 7) {
        return '${p.substring(0, 3)}****${p.substring(p.length - 4)}';
      }
      return p;
    }
    if (email != null && email!.trim().isNotEmpty) {
      return email!.trim();
    }
    return 'MetaArc 用户';
  }

  /// 套餐显示文案
  String get planName {
    switch (plan.toLowerCase()) {
      case 'creator':
        return '创作者版';
      case 'pro':
        return '专业版 (PRO)';
      case 'studio':
        return '工作室版 (STUDIO)';
      case 'free':
      default:
        return '基础体验版';
    }
  }

  MetaArcAccount copyWith({
    String? userId,
    String? token,
    String? email,
    String? phone,
    String? nickname,
    String? plan,
    String? newApiKey,
    String? newApiBaseUrl,
    double? quota,
    double? totalQuota,
    String? serverUrl,
    DateTime? updatedAt,
    DateTime? expiresAt,
  }) {
    return MetaArcAccount(
      userId: userId ?? this.userId,
      token: token ?? this.token,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      nickname: nickname ?? this.nickname,
      plan: plan ?? this.plan,
      newApiKey: newApiKey ?? this.newApiKey,
      newApiBaseUrl: newApiBaseUrl ?? this.newApiBaseUrl,
      quota: quota ?? this.quota,
      totalQuota: totalQuota ?? this.totalQuota,
      serverUrl: serverUrl ?? this.serverUrl,
      updatedAt: updatedAt ?? this.updatedAt,
      expiresAt: expiresAt ?? this.expiresAt,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'user_id': userId,
      'token': token,
      'email': email,
      'phone': phone,
      'nickname': nickname,
      'plan': plan,
      'new_api_key': newApiKey,
      'new_api_base_url': newApiBaseUrl,
      'quota': quota,
      'total_quota': totalQuota,
      'server_url': serverUrl,
      'updated_at': updatedAt?.toIso8601String(),
      'expires_at': expiresAt?.toIso8601String(),
    };
  }

  factory MetaArcAccount.fromJson(Map<String, dynamic> json) {
    return MetaArcAccount(
      userId: json['user_id']?.toString() ?? '',
      token: json['token']?.toString() ?? '',
      email: json['email']?.toString(),
      phone: json['phone']?.toString(),
      nickname: json['nickname']?.toString(),
      plan: json['plan']?.toString() ?? 'free',
      newApiKey: json['new_api_key']?.toString() ?? '',
      newApiBaseUrl: json['new_api_base_url']?.toString() ?? 'https://api.metaarc.com.cn/v1',
      quota: (json['quota'] as num?)?.toDouble() ?? 0.0,
      totalQuota: (json['total_quota'] as num?)?.toDouble() ?? 0.0,
      serverUrl: json['server_url']?.toString() ?? 'https://api.metaarc.com.cn',
      updatedAt: json['updated_at'] != null ? DateTime.tryParse(json['updated_at'].toString()) : null,
      expiresAt: json['expires_at'] != null ? DateTime.tryParse(json['expires_at'].toString()) : null,
    );
  }
}
