// 职责: 验证移动端账号页只提交真实登录资料，并按返回字段展示余额与密钥。
// 关联文件:
//   lib/mobile/pages/account_page.dart
//   lib/shared/providers/metaarc_providers.dart
//   lib/shared/models/metaarc_account.dart
// 遵循的 Rules:
//   .agents/rules/testing.md

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:reveric/mobile/pages/account_page.dart';
import 'package:reveric/shared/localization/merging_asset_loader.dart';
import 'package:reveric/shared/models/metaarc_account.dart';
import 'package:reveric/shared/providers/metaarc_providers.dart';
import 'package:reveric/shared/theme/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await EasyLocalization.ensureInitialized();
  });

  setUp(() => rootBundle.clear());

  testWidgets('signed-out form uses the apex host and hides payment controls', (
    tester,
  ) async {
    final opened = <Uri>[];
    final account = await _pump(
      tester,
      openExternal: (uri) async {
        opened.add(uri);
        return true;
      },
    );

    expect(find.text('Sign in to MetaArc'), findsOneWidget);
    expect(
      find.text(
        'Sign-in stores the account on this client. Payment and administration stay on the web account center.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('Upgrade'), findsNothing);
    expect(find.textContaining('Subscribe'), findsNothing);
    expect(find.textContaining('支付'), findsNothing);
    expect(find.text('Available AI Quota'), findsNothing);
    expect(find.byType(LinearProgressIndicator), findsNothing);
    expect(
      tester
          .widget<TextField>(find.byKey(mobileAccountServerKey))
          .controller!
          .text,
      'https://metaarc.com.cn',
    );

    await tester.tap(find.byKey(mobileAccountSubmitKey));
    await tester.pump();
    expect(
      find.text('Enter a phone number or email and a password'),
      findsWidgets,
    );
    expect(account.loginCount, 0);

    await tester.tap(find.byKey(mobileAccountCenterKey));
    await tester.pump();
    expect(opened, [Uri.parse('https://metaarc.com.cn/account')]);
  });

  testWidgets('login posts the gateway the user entered', (tester) async {
    final account = await _pump(tester);

    await tester.enterText(find.byKey(mobileAccountServerKey), '');
    await tester.enterText(
      find.byKey(mobileAccountIdentityKey),
      'reader@metaarc.com.cn',
    );
    await tester.enterText(find.byKey(mobileAccountPasswordKey), 'secret');
    await tester.tap(find.byKey(mobileAccountSubmitKey));
    await tester.pumpAndSettle();

    expect(account.loginCount, 1);
    expect(account.loginServer, 'https://metaarc.com.cn');
    expect(account.loginAccount, 'reader@metaarc.com.cn');
    expect(account.loginPassword, 'secret');
    expect(find.text('Reader'), findsOneWidget);

    await tester.tap(find.byKey(mobileAccountLogoutKey));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(mobileAccountServerKey),
      'http://127.0.0.1:8080',
    );
    await tester.enterText(find.byKey(mobileAccountIdentityKey), 'local');
    await tester.enterText(find.byKey(mobileAccountPasswordKey), 'secret');
    await tester.tap(find.byKey(mobileAccountSubmitKey));
    await tester.pumpAndSettle();

    expect(account.loginCount, 2);
    expect(account.loginServer, 'http://127.0.0.1:8080');
  });

  testWidgets('login shows the server message and hides transport failures', (
    tester,
  ) async {
    final account = await _pump(tester, loginError: Exception('密码错误'));

    await tester.enterText(find.byKey(mobileAccountIdentityKey), 'reader');
    await tester.enterText(find.byKey(mobileAccountPasswordKey), 'secret');
    await tester.tap(find.byKey(mobileAccountSubmitKey));
    await tester.pump();

    expect(find.text('密码错误'), findsOneWidget);
    expect(find.textContaining('Exception'), findsNothing);
    expect(account.loginCount, 1);

    account.loginError = const FormatException('socket down');
    await tester.tap(find.byKey(mobileAccountSubmitKey));
    await tester.pump();
    expect(
      find.text('The account request could not be completed. Try again later.'),
      findsOneWidget,
    );
    expect(find.textContaining('socket down'), findsNothing);
  });

  testWidgets('register requires six characters then sends the nickname', (
    tester,
  ) async {
    final account = await _pump(tester);
    await tester.tap(find.text('Register'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(mobileAccountIdentityKey), '13800138000');
    await tester.enterText(find.byKey(mobileAccountPasswordKey), 'short');
    await tester.tap(find.byKey(mobileAccountSubmitKey));
    await tester.pump();
    expect(
      find.text(
        'Account is required and the password must be at least 6 characters',
      ),
      findsOneWidget,
    );
    expect(account.registerCount, 0);

    await tester.enterText(find.byKey(mobileAccountPasswordKey), 'longer');
    await tester.enterText(find.byKey(mobileAccountNicknameKey), '元弧');
    await tester.tap(find.byKey(mobileAccountSubmitKey));
    await tester.pumpAndSettle();

    expect(account.registerCount, 1);
    expect(account.registerAccount, '13800138000');
    expect(account.registerPassword, 'longer');
    expect(account.registerNickname, '元弧');
    expect(account.registerServer, 'https://metaarc.com.cn');
    expect(find.text('元弧'), findsOneWidget);
  });

  testWidgets('signed-in page shows returned balance and hides a mock key', (
    tester,
  ) async {
    final account = await _pump(
      tester,
      initial: _account(newApiKey: 'sk-mock-demo', quota: 12.5),
      refreshOk: false,
    );

    expect(find.text('12.5 pts'), findsOneWidget);
    expect(find.text('创作者版'), findsOneWidget);
    expect(find.text('13800138000'), findsOneWidget);
    expect(
      find.text('The profile did not include a quota total.'),
      findsOneWidget,
    );
    expect(find.text('Compute access is not available.'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsNothing);
    expect(find.textContaining('sk-mock'), findsNothing);
    expect(find.text('Exclusive API Key (New-API Token)'), findsNothing);
    expect(find.textContaining('支付'), findsNothing);
    expect(find.textContaining('Upgrade'), findsNothing);

    await tester.tap(find.byKey(mobileAccountRefreshKey));
    await tester.pump();
    expect(account.refreshCount, 1);
    expect(find.text('Could not refresh the account profile.'), findsOneWidget);
    await tester.pumpAndSettle();
  });

  testWidgets('signed-in page masks a real key and opens /account', (
    tester,
  ) async {
    final opened = <Uri>[];
    var allowOpen = true;
    final account = await _pump(
      tester,
      initial: _account(
        quota: 20,
        totalQuota: 80,
        newApiKey: 'sk-live-abcdefghij1234',
        serverUrl: 'https://api.metaarc.com.cn/',
      ),
      openExternal: (uri) async {
        opened.add(uri);
        return allowOpen;
      },
    );

    expect(find.byType(LinearProgressIndicator), findsOneWidget);
    expect(find.text(' / 80'), findsOneWidget);
    expect(find.textContaining('sk-live-'), findsOneWidget);
    expect(find.textContaining('abcdefghij'), findsNothing);
    expect(
      find.text('The returned compute credential is saved on this device.'),
      findsOneWidget,
    );

    await tester.tap(find.byKey(mobileAccountRefreshKey));
    await tester.pump();
    expect(account.refreshCount, 1);
    expect(find.text('20.0 pts'), findsOneWidget);

    await tester.tap(find.byKey(mobileAccountCenterKey));
    await tester.pump();
    expect(opened, [Uri.parse('https://metaarc.com.cn/account')]);

    allowOpen = false;
    await tester.tap(find.byKey(mobileAccountCenterKey));
    await tester.pump();
    expect(find.text('Could not open the account center.'), findsOneWidget);
    await tester.pumpAndSettle();
  });
}

MetaArcAccount _account({
  required String newApiKey,
  required double quota,
  double totalQuota = 0,
  String serverUrl = 'https://metaarc.com.cn',
}) {
  return MetaArcAccount(
    userId: 'user-1',
    token: 'token',
    nickname: '元弧',
    phone: '13800138000',
    plan: 'creator',
    quota: quota,
    totalQuota: totalQuota,
    newApiKey: newApiKey,
    serverUrl: serverUrl,
  );
}

class _AccountDouble extends MetaArcAccountNotifier {
  _AccountDouble({this.initial, this.loginError, this.refreshOk = true});

  final MetaArcAccount? initial;
  Object? loginError;
  final bool refreshOk;

  int loginCount = 0;
  String? loginServer;
  String? loginAccount;
  String? loginPassword;
  int registerCount = 0;
  String? registerServer;
  String? registerAccount;
  String? registerPassword;
  String? registerNickname;
  int refreshCount = 0;

  @override
  Future<MetaArcAccount?> build() async => initial;

  @override
  Future<MetaArcAccount> login({
    required String serverUrl,
    required String account,
    required String password,
  }) async {
    loginCount += 1;
    loginServer = serverUrl;
    loginAccount = account;
    loginPassword = password;
    final error = loginError;
    if (error != null) {
      state = AsyncValue.error(error, StackTrace.current);
      throw error;
    }
    final user = MetaArcAccount(
      userId: 'user-1',
      token: 'token',
      nickname: 'Reader',
      email: account.contains('@') ? account : null,
      serverUrl: serverUrl,
      quota: 3,
    );
    state = AsyncValue.data(user);
    return user;
  }

  @override
  Future<MetaArcAccount> register({
    required String serverUrl,
    required String phoneOrEmail,
    required String password,
    String? nickname,
  }) async {
    registerCount += 1;
    registerServer = serverUrl;
    registerAccount = phoneOrEmail;
    registerPassword = password;
    registerNickname = nickname;
    final user = MetaArcAccount(
      userId: 'user-1',
      token: 'token',
      nickname: nickname,
      phone: phoneOrEmail,
      serverUrl: serverUrl,
      quota: 1,
    );
    state = AsyncValue.data(user);
    return user;
  }

  @override
  Future<bool> refreshProfile() async {
    refreshCount += 1;
    return refreshOk;
  }

  @override
  Future<void> logout() async {
    state = const AsyncValue.data(null);
  }
}

Future<_AccountDouble> _pump(
  WidgetTester tester, {
  MetaArcAccount? initial,
  Object? loginError,
  bool refreshOk = true,
  MobileAccountUrlOpener? openExternal,
}) async {
  tester.view.physicalSize = const Size(430, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final account = _AccountDouble(
    initial: initial,
    loginError: loginError,
    refreshOk: refreshOk,
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [metaarcAccountProvider.overrideWith(() => account)],
      child: EasyLocalization(
        supportedLocales: const [Locale('en')],
        path: 'assets/translations',
        assetLoader: const MergingAssetLoader(),
        fallbackLocale: const Locale('en'),
        startLocale: const Locale('en'),
        child: Builder(
          builder: (context) {
            return MaterialApp(
              localizationsDelegates: context.localizationDelegates,
              supportedLocales: context.supportedLocales,
              locale: context.locale,
              theme: RevericThemeData.reveric.toThemeData(),
              builder: (_, child) =>
                  RevericTheme(data: RevericThemeData.reveric, child: child!),
              home: MobileAccountPage(openExternal: openExternal),
            );
          },
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return account;
}
