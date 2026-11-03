// 职责: 校验 MetaArc 账号默认基址落在主域，旧 api 子域会收成同域账号中心。
// 关联文件:
//   lib/shared/models/metaarc_account.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:reveric/shared/models/metaarc_account.dart';

void main() {
  test('account server defaults to the apex domain', () {
    const account = MetaArcAccount(userId: 'user', token: 'token');

    expect(account.serverUrl, 'https://metaarc.com.cn');
    expect(account.newApiBaseUrl, isEmpty);
    expect(MetaArcAccount.accountCenterUrl(null), 'https://metaarc.com.cn/account');
  });

  test('stored api subdomain is rewritten to the apex account center', () {
    final account = MetaArcAccount.fromJson({
      'user_id': 'user',
      'token': 'token',
      'server_url': 'https://api.metaarc.com.cn/',
      'new_api_base_url': '',
    });

    expect(account.serverUrl, 'https://metaarc.com.cn');
    expect(
      MetaArcAccount.accountCenterUrl('https://api.metaarc.com.cn/'),
      'https://metaarc.com.cn/account',
    );
    expect(
      MetaArcAccount.normalizeServerUrl('http://127.0.0.1:8080/'),
      'http://127.0.0.1:8080',
    );
  });
}
