# MetaArc brand residual audit

The scan below is the pre-fix inventory at `main` @ `ff32319924057ca77adc910111be0ad2d9922add`. The status table is what this branch changed. Deferred P2 identifiers were not renamed. Appendix A is the original file index, not a second scan.

## Status

| Item | Status | What changed |
| --- | --- | --- |
| Client icons, Android 12 splash, tray image, onboarding loader | FIXED | Pixels are the L1 double arc (white on black for app icons; ink strokes for the loader, tray template, and splash). Filenames such as `reveric_mark.svg` stay. Wordmark file still draws MetaArc. |
| Agent prompts (`assistant`, `explorer`, `review`, `style_polish`, `writer`) | FIXED | Product name is MetaArc 元弧. No other prompt file named Reveric. |
| Object-storage default prefix and connection probe | FIXED | `metaarc/references`, `.metaarc-connection-check`, body `metaarc`. |
| Volcengine asset group | FIXED | `metaarc`. |
| Diagnostics host | FIXED | No MetaArc diagnostics host is live in this repo. `diagnosticsBaseUrl` is empty and the About upload block is hidden, so the client does not call `diagnostics.reveric.app`. Worker route pattern is `diagnostics.metaarc.com.cn`. Binding that hostname is a manual Cloudflare step. The client stays empty until the host answers. R2 bucket name is unchanged. |
| Skills catalog URL | FIXED | Marketplace loads `https://raw.githubusercontent.com/johncn2012/skills/main/catalog.json` from https://github.com/johncn2012/skills . User-Agent stays `MetaArc-Skills`. Metaso query stays `?s=MetaArc`. |
| Metaso referral | FIXED | `?s=MetaArc`. |
| GitHub issue templates | FIXED | MetaArc 元弧. Links go to `github.com/johncn2012/MetaArc`. |
| `site/static` sitemap and robots | FIXED | `https://metaarc.com.cn/`. |
| Cloudflare Pages project | FIXED in config | Workflows use `metaarc-site`. Creating or renaming the Pages project is manual; git does not rename `reveric-site`. |
| Design-kit rail, lockup, mark, page titles | FIXED | NavRail and mock author say MetaArc 元弧. `Mark` draws the L1 arc. Stacked lockup PNGs use that arc plus the MetaArc wordmark. Theme **token** stays `reveric`. |
| Windows CompanyName | FIXED | Version resource CompanyName is MetaArc. `APPLICATION_ID` macro `ai.reveric` remains in `Runner.rc` and is not shown. Chinese product strings use MetaArc 元弧. |
| Chinese theme label | FIXED | Display string is MetaArc 元弧. Saved value `reveric` is still DEFERRED_P2. |
| Attribution | KEPT | About sentence, site footer 「改编自 Reveric」, `NOTICES`, and the README origin line stay. |

DEFERRED_P2 families 1–6 and 8–18 are unchanged. Family 7’s **display** string is no longer the application id; the id macro itself is still deferred.

Scanned tree: `main` @ `ff32319924057ca77adc910111be0ad2d9922add` (matches `origin/main` at audit time).

Search was case-insensitive for `Reveric` / `reveric` / `REVERIC` and for the old Chinese product name `幻界`, across the working tree including `windows/`, `android/`, `ios/`, `macos/`, `linux/`, `pubspec.yaml`, CMake, `Info.plist`, `AndroidManifest.xml`, `Runner.rc`, tray code, the Inno installer, `server/metaarc/public`, `designs/`, `docs/`, comments, package names, URLs, and emails. Skipped generated or dependency trees: `.git`, `node_modules`, `.dart_tool`, `build`, `dist`, `site/dist`, `coverage`, `.fvm`, `.gradle`, `Pods`. Binary files were not string-scanned; icon pixels were opened separately. This inventory is excluded from the counts. A later scan will match it.

Also checked, and not found as product copy: `元弧 MetaArc` (reversed lockup), `原弧`, `元狐`, and email addresses containing `reveric`.

## Known deferrals

These were already decided. They are listed so they are not treated as new bugs.

- Brand lock is English-first 「MetaArc 元弧」. Never 「元弧 MetaArc」.
- Logo L1 (arc-M) is the website mark. The old blue ribbon on beige was supposed to be gone from product surfaces. It is not gone from the client. That is a new finding below, not a deferral.
- Client P0 and P1 wordmarks (window title, installer display name, tray tooltip, about title) already say MetaArc. P2 identifiers stay: `applicationId`, `reveric.exe`, sqlite filename, bundle id, and the same class of stable id.
- Payment stays an honest empty state. The site does not link an upstream GitHub Release as a download.

## Counts

| Class | What is counted | Count |
| --- | --- | --- |
| USER_VISIBLE | Rows in section 1. Eight of them are the same blue ribbon on different surfaces; twenty are copy or host strings. | 28 |
| DEFERRED_P2 | Identifier families already agreed to leave (exe, bundle id, sqlite, channels, plugin ids, and the same kind of stable name) | 18 |
| FALSE_POSITIVE | Intentional 「Based on Reveric」 / AGPL attribution | 6 locations |
| DEV_ONLY | Everything else: imports, type names, comments, tests, docs archive, design-source mocks | the rest of the tree |

Raw scan, before that classification: **2075 text files**, **25964 matching lines**, plus **20 binaries whose filenames contain `reveric`**. Line volume is mostly `package:reveric/` and `Reveric*` symbols in `lib/` (17639 lines) and tests (6841). Those lines are accounted for in Appendix A by file. They are not 25,000 separate product-name bugs.

Directory line totals: `lib` 17639, `test` 6841, `designs` 250, `integration_test` 185, `patrol_test` 173, `plugins` 172, `.agents` 144, `docs` 144, `third` 141, repository root 83, `assets` 75, `macos` 27, `windows` 16, `server` 13, `.github` 13, `android` 13, `ios` 10, `site` 10, `scripts` 7, `linux` 4, `.impeccable` 4.

## 1. USER_VISIBLE

The rows below are the pre-fix findings. The status table marks them FIXED or KEPT.

### Old ribbon mark (highest)

The website lockup is the L1 double arc (`designs/website/assets/mark.svg`, `icon-512.png`, and the copies under `server/metaarc/public/assets/`). The installed client icons are still the blue ribbon on a beige field. Opened during this audit: macOS `app_icon_256.png`, iOS `Icon-App-1024x1024@1x.png`, Android `mipmap-xxxhdpi/ic_launcher.png` and `drawable-xxxhdpi/ic_launcher_foreground.png`, Windows `runner/resources/app_icon.ico` (256px frame), and `assets/logo/reveric_app_icon_512.png`. Same paths as `assets/logo/reveric_mark.svg` (`<title>Reveric mark</title>`, fills `#283B5E` / `#8797D2`).

`assets/logo/reveric_wordmark.png` already draws the word **MetaArc**. Only the mark beside it is the old ribbon. Do not “fix” the wordmark by swapping those pixels for another word.

| Path | What the user sees | Suggested |
| --- | --- | --- |
| `pubspec.yaml` `flutter_launcher_icons` (`image_path` ~283–297) | Generator input is `reveric_app_icon_macos_1024.png` / `reveric_app_icon_ios_1024.png` plus adaptive foreground/background. Regenerating from these files reprints the ribbon. | Point the generator at an L1 arc-M master, then regenerate. |
| `macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_*.png` | Dock / Finder icon. Beige tile, blue ribbon. | L1 arc-M. |
| `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-*.png` | Home screen icon. Same ribbon. | L1 arc-M. |
| `android/app/src/main/res/mipmap-*/ic_launcher.png` and `drawable-*/ic_launcher_foreground.png` (+ background) | Launcher icon. Same ribbon. | L1 arc-M. |
| `windows/runner/resources/app_icon.ico` | Taskbar / exe icon. Same ribbon, confirmed from the 256px frame. | L1 arc-M. |
| `android/app/src/main/res/drawable/splash_mark.xml` and `drawable-night/splash_mark.xml` | Android 12 splash. Vector is the ribbon. Comment cites `reveric_mark.svg`. | L1 arc paths. |
| `lib/shared/widgets/brand_loader.dart` `_MarkPaths` (~369) and tray icon in `lib/shared/services/system_tray_service.dart` (`assets/logo/reveric_mark_32.ico` / `.png`) | Onboarding / loader paints the ribbon, then the MetaArc wordmark. Tray tooltip text is already `MetaArc`; the tray image is the ribbon. | Paint and ship the L1 arc. Tooltip string can stay. |
| `assets/logo/reveric_mark.svg`, `reveric_mark_*.png`, `reveric_app_icon_*.png`, `reveric-raw.png`, adaptive icons | Source art for the rows above. | Replace art with L1. Filenames can stay until a later rename. |

iOS `LaunchImage*.png` is a blank white image, not the ribbon.

Severity: **high**. This is the leftover that contradicts “old ribbon is gone from product surfaces.”

### Copy and hosts

| Path | Line / symbol | Current | Suggested | Severity |
| --- | --- | --- | --- | --- |
| `assets/prompts/agent/assistant.md` | opening line | `运行在 reveric 桌面应用内` | `运行在 MetaArc 桌面应用内` | high |
| `assets/prompts/agent/explorer.md` | opening line | `你是 Reveric 的资料收集员` | `你是 MetaArc 的资料收集员` | high |
| `assets/prompts/agent/review.md` | opening line | `你是 Reveric 的内容核验专家` | `你是 MetaArc 的内容核验专家` | high |
| `assets/prompts/agent/style_polish.md` | opening line | `你是 Reveric 的文风编辑` | `你是 MetaArc 的文风编辑` | high |
| `assets/prompts/agent/writer.md` | opening line | `你是 Reveric 的正文写手` | `你是 MetaArc 的正文写手` | high |
| `lib/shared/models/object_storage_config.dart` | `defaultKeyPrefix` | `reveric/references` (settings field “Key prefix”) | `metaarc/references` | medium |
| `lib/shared/services/object_storage/service.dart` | `_probeKey`, `_probeBody` | key `.reveric-connection-check`, body `reveric` (written into the user’s bucket on connection test) | `.metaarc-connection-check` / `metaarc` | medium |
| `lib/shared/services/ai/assets/volcengine.dart` | `providerAssetGroupName` | group name `reveric` in the user’s Volcengine asset library | `MetaArc` | medium |
| `lib/shared/app_config.dart` | `diagnosticsBaseUrl` | `https://diagnostics.reveric.app` (About → upload logs) | a MetaArc diagnostics host | high |
| `server/cf/workers/diagnostics/wrangler.jsonc` | `routes` | custom domain `diagnostics.reveric.app` | same host move as the client | high |
| `lib/shared/app_config.dart` | `revericSkillsCatalogUrl` | was `https://raw.githubusercontent.com/looplj/reveric-skills/main/catalog.json` | FIXED: `https://raw.githubusercontent.com/johncn2012/skills/main/catalog.json` (repo https://github.com/johncn2012/skills ) | medium |
| `lib/shared/providers/agent_skill_catalog_providers.dart` | User-Agent | `Reveric-Skills` | `MetaArc-Skills` | low |
| `lib/shared/models/provider_brand.dart` | metaso link | `https://metaso.cn/minimax-h3/?s=Reveric` (opened from provider UI) | `?s=MetaArc` | low |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | description, body, label | `报告 Reveric…`, issues link `github.com/looplj/reveric`, label `Reveric 版本` | MetaArc, this repo’s issues | medium |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | description, body | `为 Reveric 提出新功能建议`, same upstream issues URL | MetaArc | medium |
| `.github/ISSUE_TEMPLATE/optimization.yml` | description, body, label | `改进 Reveric…`, `Reveric 版本` | MetaArc | medium |
| `.github/ISSUE_TEMPLATE/questions.yml` | description, body | `咨询 Reveric…`, README link `github.com/looplj/reveric#readme` | MetaArc | medium |
| `site/static/sitemap.xml` | `<loc>` | `https://reveric.app/` | `https://metaarc.com.cn/` | medium |
| `site/static/robots.txt` | Sitemap | `https://reveric.app/sitemap.xml` | `https://metaarc.com.cn/sitemap.xml` | medium |
| `.github/workflows/build.yaml` ~344 and `website.yaml` ~29 | `pages deploy` | `--project-name=reveric-site` | a MetaArc Pages project name | medium |

`site/build.mjs` copies `site/static/` into `site/dist/`, so a static-site build still publishes the `reveric.app` sitemap. `server/metaarc/public/` does **not** contain that sitemap. See the website section.

Worker name `reveric-diagnostics` and R2 bucket `reveric-diagnosis` (`wrangler.jsonc`, `package.json`) are private infrastructure names next to the public host. They are recorded under DEV_ONLY, beside the host row above.

## Brand-form notes

Not Reveric hits. Recorded because the lock is 「MetaArc 元弧」.

- No user-facing string uses the reversed order 「元弧 MetaArc」. `server/metaarc/test/auth_routes.test.ts` asserts the correct order `MetaArc 元弧`.
- Shipped theme labels: English `settings.theme_reveric` = `MetaArc`; Chinese = `元弧` only (`assets/translations/en/settings.json`, `zh-CN/settings.json`). The key and the saved value `reveric` are DEFERRED_P2. The Chinese label is the Chinese name without the English-first lockup.
- Parenthetical 「MetaArc (元弧)」 appears in Chinese installer strings (`windows/packaging/exe/inno_setup.iss`), Chinese `Runner.rc` `ProductName` / `FileDescription` / `IDS_APP_TITLE`, the website meta description (`designs/website/index.html` and `server/metaarc/public/index.html`), and server startup logs. The visible lockup on the site header, account page, and footer copyright is the locked form 「MetaArc 元弧」.
- About page link label and `metaArcOfficialWebsiteUrl` display `https://MetaArc.COM.CN`. Canonical and account links use `https://metaarc.com.cn`. DNS is case-insensitive; this is display casing, not a different name.
- Android `app_name`, iOS `CFBundleDisplayName` / `CFBundleName`, macOS `PRODUCT_NAME`, Linux window title, and `app.title` are `MetaArc` with no 「元弧」. English-first, Chinese subtitle omitted.

## 2. DEFERRED_P2

18 families. Renaming them would split installed apps, databases, plugin ids, or on-disk formats. Listed because they still say Reveric. Not proposed in this PR.

Windows file properties show `CompanyName` = `ai.reveric` (`Runner.rc`). That is the deferred application id leaking into a properties sheet. The product name on that same sheet is already MetaArc. `OriginalFilename` says `MetaArc.exe` while CMake `BINARY_NAME` is `reveric`, so the file on disk is `reveric.exe`.

| # | Family | Where | Current |
| --- | --- | --- | --- |
| 1 | Dart package name | `pubspec.yaml` line 1 | `name: reveric` (this is why `package:reveric/` exists; those imports are DEV_ONLY) |
| 2 | Android application id | `android/app/build.gradle.kts` | `namespace` and `applicationId` `ai.reveric`; debug suffix `.debug` |
| 3 | Apple bundle id | `macos/Runner/Configs/AppInfo.xcconfig`, `ios/Runner.xcodeproj/project.pbxproj`, `macos/Runner.xcodeproj/project.pbxproj` | `ai.reveric`, `ai.reveric.debug`, plus `RunnerTests` / `RunnerUITests` ids |
| 4 | Windows exe | `windows/CMakeLists.txt` | `project(reveric)`, `BINARY_NAME "reveric"` → `reveric.exe`. Makefile echoes that path. |
| 5 | Linux binary and GTK id | `linux/CMakeLists.txt` | `BINARY_NAME "reveric"`, `APPLICATION_ID "ai.reveric"` (+ `.debug`) |
| 6 | Installer app id | `windows/packaging/exe/make_config.yaml` | `app_id: ai.reveric` (display name and publisher are MetaArc) |
| 7 | Windows application id macro | `windows/runner/Runner.rc` | `#define APPLICATION_ID` is still `ai.reveric` / `ai.reveric.debug`. CompanyName in the version resource is now MetaArc and is not this id. |
| 8 | SQLite filename | `lib/shared/database/app_database.dart` (`name: 'reveric'`, `reveric.sqlite`), `backup_service.dart`, `sqlite_schema_repair_orchestrator.dart`, `production/backup_media.dart` | `reveric.sqlite` under the support dir. Support dir itself is the bundle id (`ai.reveric` / `ai.reveric.debug`). |
| 9 | Method channels | `windows/runner/flutter_window.cpp`, `macos/Runner/MainFlutterWindow.swift`, `linux/runner/my_application.cc`, `ios/Runner/AppDelegate.swift`, Dart `MethodChannel('reveric/...')` | `reveric/system_fonts`, `reveric/window_position`, `reveric/window_lifecycle`, `reveric/crash_reporting`, `reveric/menu`, `reveric/update`, `reveric/system_ui`, `reveric/android_directory_import`, `ai.reveric.director/storage` |
| 10 | OAuth callback | `AndroidManifest.xml` intent filter; `lib/shared/services/mcp/oauth/callback.dart` | `ai.reveric://mcp/oauth/callback` |
| 11 | Notification AUMID | `lib/shared/services/system_notification_service.dart` | `ai.reveric` / `ai.reveric.debug` |
| 12 | Bundled plugin ids | `assets/plugins/reveric.{deepseek,memory,web}/plugin.json` and `plugins/*/plugin.json` | `reveric.deepseek`, `reveric.memory`, `reveric.web`. Display names are already DeepSeek / 记忆 / 联网检索; `author` is MetaArc. |
| 13 | Plugin protocols | plugin manifests and `lib/shared/models/plugin/` | `reveric-tsx-v1`, `reveric-ui-v1` |
| 14 | Document format ids | canvas / director / editing models | `reveric.canvas`, `reveric.director`, `reveric.director.frames`, `reveric.editing` |
| 15 | Depth helper binary | `lib/shared/services/depth/native_runner.dart` | `reveric-depth-native`, `reveric-depth-native.exe` |
| 16 | Plugin SDK package and CLI | `plugins/sdk/package.json` | npm name `reveric-plugin-sdk`, bin `reveric-plugin` |
| 17 | Saved theme token | `lib/shared/providers/settings_providers.dart`, `app_settings_aggregate_data.dart` | stored value `reveric` for `AppTheme.reveric`. The label the user reads is MetaArc / 元弧. |
| 18 | Patrol ids | `pubspec.yaml` `patrol:` | `package_name` / `bundle_id` `ai.reveric.debug`. `app_name` is already MetaArc. |

Temp directories (`.reveric_probe_`, `reveric_backup_…`, `reveric_editing_frames_`, and similar) are process-local. They are DEV_ONLY, not this list.

## Packaging sweep

These files were opened. “Clean” means the user-visible product string is MetaArc. Deferred ids in the same file are column 3.

| File | User-visible name | Still Reveric |
| --- | --- | --- |
| `windows/CMakeLists.txt` | — | `BINARY_NAME "reveric"` (P2) |
| `windows/runner/CMakeLists.txt` | uses `BINARY_NAME` | no extra brand string |
| `windows/runner/Runner.rc` | CompanyName, ProductName, and Chinese title are MetaArc / MetaArc 元弧. `OriginalFilename` `MetaArc.exe`. | `APPLICATION_ID` macro remains `ai.reveric` (P2) and is not written into the version resource |
| `windows/runner/main.cpp` | fallback title `MetaArc`; resource string overrides it | debug-only crash strings in `crash_handler.cpp` say `Reveric:` (DEV_ONLY) |
| `windows/runner/flutter_window.cpp` | — | method channels (P2) |
| `windows/packaging/exe/inno_setup.iss` | Start Menu, desktop, and startup shortcuts `MetaArc`. English display name MetaArc. Chinese `MetaArc (元弧)`. Launch / autostart / runtime copy say MetaArc. | shortcut target is `{{EXECUTABLE_NAME}}`, which is `reveric.exe` (P2) |
| `windows/packaging/exe/make_config.yaml` | `display_name` and `publisher` MetaArc. URL `https://MetaArc.COM.CN`. | `app_id: ai.reveric` (P2) |
| `windows/runner/resources/app_icon.ico` | ribbon icon | USER_VISIBLE art |
| `android/app/build.gradle.kts` | — | `applicationId` / `namespace` (P2) |
| `android/app/src/main/AndroidManifest.xml` | label `@string/app_name` | OAuth scheme `ai.reveric` (P2) |
| `android/app/src/debug/AndroidManifest.xml` | no product name | no Reveric string |
| `android/app/src/profile/AndroidManifest.xml` | no product name | no Reveric string |
| `android/.../values/strings.xml` and `values-zh/strings.xml` | `app_name` MetaArc | — |
| `android/.../splash_mark.xml` (+ night) | ribbon splash | USER_VISIBLE art |
| `android` launcher pngs | ribbon | USER_VISIBLE art |
| `ios/Runner/Info.plist` | `CFBundleDisplayName` and `CFBundleName` MetaArc | bundle id comes from the pbxproj (P2) |
| `ios/Runner/AppDelegate.swift` | — | `ai.reveric.director/storage` (P2) |
| `ios` AppIcon pngs | ribbon | USER_VISIBLE art |
| `macos/Runner/Info.plist` | display name is `$(PRODUCT_NAME)` | — |
| `macos/Runner/Configs/AppInfo.xcconfig` | `PRODUCT_NAME = MetaArc`, copyright MetaArc | `PRODUCT_BUNDLE_IDENTIFIER = ai.reveric` (P2) |
| `macos/Runner.xcodeproj/project.pbxproj` | Runner target inherits MetaArc from the xcconfig | bundle ids (P2). Stale `path = Reveric.app` and `TEST_HOST` `Reveric.app` are DEV_ONLY (see below). |
| `macos/Runner/MainFlutterWindow.swift` | — | channels (P2) |
| `macos/packaging/dmg/make_config.yaml` | title MetaArc, path `MetaArc.app` | no Reveric string |
| `macos` AppIcon pngs | ribbon | USER_VISIBLE art |
| `linux/CMakeLists.txt` | — | `BINARY_NAME` / `APPLICATION_ID` (P2) |
| `linux/runner/my_application.cc` | header and window title `MetaArc` | channels (P2). No `.desktop` file is committed. No linux icon file is committed; `flutter_launcher_icons` would generate one from the ribbon png. |
| `pubspec.yaml` | launcher icon paths | package name (P2) and ribbon sources (USER_VISIBLE) |

CI download artifact in `.github/workflows/build.yaml` is `MetaArc-<version>-windows-setup.exe`, not a Reveric filename. The exe inside the installer is still `reveric.exe` (family 4).

## 3. FALSE_POSITIVE

Kept on purpose. AGPL section 7 and `NOTICES` require the sentence and the upstream link. `site/build.mjs` fails the build if the footer link or the AGPL line is removed, and it also fails if that link is turned into a `/releases/download/` install button.

| Path | Current | Why it stays |
| --- | --- | --- |
| `lib/shared/app_config.dart` | `revericAttribution = 'Based on Reveric by looplj.'` and `revericGitHubRepoUrl = 'https://github.com/looplj/reveric'` | About page. Comment says the about page must keep the upstream credit. |
| `lib/shared/widgets/settings/about_settings_section.dart` | shows that sentence and that URL | The about UI. |
| `designs/website/index.html` and `server/metaarc/public/index.html` | `改编自 Reveric（AGPL-3.0），作者 looplj` linking `https://github.com/looplj/reveric` | Site footer. Not a download. |
| `NOTICES` | title `Reveric`, required sentence, upstream URL, commercial-license paragraph that says “use Reveric” | Upstream legal notice. It does not add a MetaArc header. Preserving the notice is the point; wrapping it is a separate legal edit, not a silent rename. |
| `README.md`, `README.en-US.md` | `基于 Reveric（幻界）` / “modified version of Reveric”, and the about-page sentence | Origin statement. `幻界` here is the upstream Chinese name, not a second product title in the app. |
| `test/shared/widgets/update/about_settings_test.dart` | expects `revericAttribution` | Test of the kept sentence. The test file itself is DEV_ONLY. |

`revericFeedbackEmail` is the symbol name. The address is `bababaa261@gmail.com`, which does not say Reveric. No `@reveric` mailbox was found.

## 4. DEV_ONLY

Not shown as the product name in the shipped app, installer, or live portal. Still part of the scan so nothing is dropped.

### Design source still wearing the old name

Shipped Flutter theme labels do not say Reveric. The design kit does.

| Path | Current | Note |
| --- | --- | --- |
| `designs/desktop/NavRail.jsx` ~153–158 | visible rail text `幻界`, tooltip `设置 · 幻界` | Only in-repo UI that still renders the old Chinese name. `_ds_bundle.js` repeats the comment. |
| `designs/desktop/agent_studio.jsx` ~147 | mock author `幻界官方` | Fixture copy inside the kit. |
| `designs/theme.js` ~30 | palette label `Reveric`, description `玉白底色，墨玉落笔` | Design-kit settings switcher. Shipped Chinese label is `元弧`. |
| `designs/desktop/assets/logo/reveric_logo_stacked_transparent.png` (and the cream twin) | pixels read **Reveric** under the ribbon | Design-kit lockup. The shipped wordmark png says MetaArc. |
| `designs/desktop/SettingsDialog.jsx` | heading `Reveric` | Mock settings. |
| `designs/desktop/index.html`, `Canvas.html`, `Drama.html`, `Editing.html`, `EntityGraph.html` | titles `Reveric — …` / `Reveric · …` | Kit page titles. |
| `designs/desktop/ICONOGRAPHY.md`, `README.md`, `SKILL.md`, `UI_KIT.md` | product described as Reveric; wordmark documented as “Reveric” | Design docs. |
| `DESIGN.md` front matter | `name: "Reveric"` | Design token file. |

`designs/website/` does not use these. Its mark is L1 and its lockup is MetaArc 元弧, plus the attribution footer in FALSE_POSITIVE.

### Other internal residue

- Dart symbols and filenames: `RevericButton`, `RevericTheme`, `reveric_*.dart`, `showRevericDialog`, and `package:reveric/` imports. Assert text `No RevericTheme found in context` (`reveric_theme.dart`). Exception text `RevericPaths.initialize()` (`storage_paths.dart`).
- macOS project file still names the product reference `Reveric.app` (`project.pbxproj` ~80, 168, 299; `TEST_HOST`; `Runner.xcscheme` `BuildableName`). `PRODUCT_NAME` is MetaArc and the DMG config expects `MetaArc.app`. This audit did not run a macOS build, so the scheme’s stale `Reveric.app` was not executed. Treat it as a stale Xcode reference, not as proof the shipped bundle is still `Reveric.app`.
- `Makefile` success lines still print `Reveric.app` and `reveric.exe`.
- `windows/runner/crash_handler.cpp` debug strings `Reveric: cannot write native exit state` and the filter symbol `RevericUnhandledExceptionFilter`.
- `plugins/sdk/README.md` still says the SDK is for Reveric plugins and links `github.com/looplj/reveric`. Package description in `plugins/sdk/package.json` matches. Audience is plugin authors, not the app UI.
- `docs/` (144 lines) and `.agents/` (144 lines) talk about Reveric paths, `reveric.sqlite`, and format ids. Archive and agent rules, not shipped UI. One historical plugin example in `docs/solutions/plugin-system/web-plugin.md` has `"author": "Reveric"`; the shipped `plugin.json` author is MetaArc.
- `third/**/REVERIC_PATCH.md` and vendored notes are local fork notes.
- `server/cf/workers/diagnostics` package name `reveric-diagnostics` and bucket `reveric-diagnosis`.
- `site/README.md` documents `reveric.app` and `reveric-site` as the old Pages target, and says they are not the delivered download channel.

## Website and public

`designs/website/` and `server/metaarc/public/` were read for brand copy, not only grepped.

Clean, aside from the intentional footer attribution:

- Header and account lockup: English `MetaArc`, Chinese `元弧`, in that order.
- Titles: `MetaArc 元弧 — …` and `账号 — MetaArc 元弧`.
- Icons and `mark.svg`: L1 arc, `aria-label="MetaArc"`.
- Download cards say 尚未发布. No `github.com/looplj/reveric/releases` link. `metaarc.js` only turns the Windows card into a link when `download_url` is on `metaarc.com.cn` (or a subdomain, or the page origin) and looks like a setup exe.
- Account page: 支付尚未开通. Mail is `contact@metaarc.com.cn`.
- No `reveric.app` string under `server/metaarc/public/`.

Not clean around the public site, but not inside `public/`:

- `site/static/sitemap.xml` and `robots.txt` now use `https://metaarc.com.cn/`. `site/build.mjs` still copies `site/static/` into `site/dist`.
- Website and Package workflows deploy that dist to Cloudflare project `metaarc-site`. The project has to exist in Cloudflare before a deploy; this repo cannot rename the old `reveric-site` project.

## Appendix A — every text file with a hit

Pre-fix index. One row per file. `lines` is the number of lines matching `reveric` or `幻界` before this branch. Files named in the status table were edited afterward. Every file not listed as FIXED, KEPT attribution, or DEFERRED_P2 stays DEV_ONLY.

Generated with the same walk as the counts above.

| File | Lines |
| --- | ---: |
| `.agents/rules/design-system.md` | 49 |
| `.agents/rules/directory-structure.md` | 2 |
| `.agents/rules/hooks.md` | 2 |
| `.agents/rules/hooks/useAnimationController.md` | 1 |
| `.agents/rules/hooks/useCarouselController.md` | 2 |
| `.agents/rules/hooks/useContext.md` | 2 |
| `.agents/rules/hooks/useFixedExtentScrollController.md` | 2 |
| `.agents/rules/hooks/usePlatformBrightness.md` | 3 |
| `.agents/rules/hooks/useScrollController.md` | 2 |
| `.agents/rules/hooks/useSearchController.md` | 3 |
| `.agents/rules/hooks/useTabController.md` | 2 |
| `.agents/rules/hooks/useTextEditingController.md` | 1 |
| `.agents/rules/hooks/useWidgetStatesController.md` | 1 |
| `.agents/rules/i18n.md` | 3 |
| `.agents/rules/icons.md` | 6 |
| `.agents/rules/state-management.md` | 1 |
| `.agents/rules/text-input-ime.md` | 1 |
| `.agents/scripts/check-agent-rules.sh` | 1 |
| `.agents/skills/patrol/SKILL.md` | 13 |
| `.agents/skills/profile/SKILL.md` | 9 |
| `.agents/skills/sqlite/SKILL.md` | 35 |
| `.agents/skills/sqlite/scripts/sqlite_helper.sh` | 3 |
| `.flutter-skill.yaml` | 1 |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | 3 |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | 2 |
| `.github/ISSUE_TEMPLATE/optimization.yml` | 3 |
| `.github/ISSUE_TEMPLATE/questions.yml` | 3 |
| `.github/workflows/build.yaml` | 1 |
| `.github/workflows/website.yaml` | 1 |
| `.impeccable/design.json` | 4 |
| `AGENTS.md` | 5 |
| `CONTEXT.md` | 5 |
| `DESIGN.md` | 9 |
| `DEVELOPMENT.md` | 4 |
| `Makefile` | 9 |
| `NOTICES` | 14 |
| `PRODUCT.md` | 5 |
| `README.en-US.md` | 3 |
| `README.md` | 3 |
| `android/app/build.gradle.kts` | 2 |
| `android/app/src/main/AndroidManifest.xml` | 1 |
| `android/app/src/main/kotlin/ai/reveric/MainActivity.kt` | 6 |
| `android/app/src/main/res/drawable-night/splash_mark.xml` | 1 |
| `android/app/src/main/res/drawable/splash_mark.xml` | 1 |
| `android/app/src/main/res/values-night/styles.xml` | 1 |
| `android/app/src/main/res/values/styles.xml` | 1 |
| `assets/bundled_skills/management/references/themes.md` | 4 |
| `assets/logo/reveric_mark.svg` | 1 |
| `assets/plugin_preview/counter.js` | 27 |
| `assets/plugin_preview/performance.js` | 30 |
| `assets/plugins/reveric.deepseek/plugin.json` | 1 |
| `assets/plugins/reveric.memory/plugin.json` | 2 |
| `assets/plugins/reveric.web/plugin.json` | 1 |
| `assets/prompts/agent/assistant.md` | 1 |
| `assets/prompts/agent/explorer.md` | 1 |
| `assets/prompts/agent/review.md` | 1 |
| `assets/prompts/agent/style_polish.md` | 1 |
| `assets/prompts/agent/writer.md` | 1 |
| `assets/translations/en/settings.json` | 2 |
| `assets/translations/zh-CN/settings.json` | 2 |
| `build-android.sh` | 4 |
| `build-macos.sh` | 1 |
| `build-windows.ps1` | 1 |
| `dart_test.yaml` | 1 |
| `designs/SYSTEM.md` | 74 |
| `designs/desktop/App.jsx` | 3 |
| `designs/desktop/ChatPanel.jsx` | 1 |
| `designs/desktop/ContextPanel.jsx` | 2 |
| `designs/desktop/EditorView.jsx` | 1 |
| `designs/desktop/EntityGraph.html` | 1 |
| `designs/desktop/ICONOGRAPHY.md` | 12 |
| `designs/desktop/Icon.jsx` | 1 |
| `designs/desktop/LibraryView.jsx` | 2 |
| `designs/desktop/ManagementGridView.jsx` | 1 |
| `designs/desktop/ManuscriptEditor.jsx` | 1 |
| `designs/desktop/NavRail.jsx` | 3 |
| `designs/desktop/NovelOverview.jsx` | 1 |
| `designs/desktop/README.md` | 10 |
| `designs/desktop/SKILL.md` | 10 |
| `designs/desktop/SettingsDialog.jsx` | 3 |
| `designs/desktop/Sidebar.jsx` | 1 |
| `designs/desktop/UI_KIT.md` | 2 |
| `designs/desktop/WindowFrame.jsx` | 5 |
| `designs/desktop/_ds_bundle.js` | 23 |
| `designs/desktop/_ds_manifest.json` | 1 |
| `designs/desktop/agent_studio.jsx` | 1 |
| `designs/desktop/assets/logo/reveric_mark.svg` | 1 |
| `designs/desktop/canvas/Canvas.html` | 1 |
| `designs/desktop/colors_and_type.css` | 9 |
| `designs/desktop/data.js` | 1 |
| `designs/desktop/drama/Drama.html` | 2 |
| `designs/desktop/drama/Editing.html` | 1 |
| `designs/desktop/index.html` | 1 |
| `designs/desktop/kit.css` | 9 |
| `designs/desktop/library_collections_data.js` | 2 |
| `designs/desktop/preview/brand-logo.html` | 5 |
| `designs/desktop/preview/brand-mark-app-icon.html` | 2 |
| `designs/desktop/preview/color-accent.html` | 1 |
| `designs/desktop/preview/color-dark-preview.html` | 1 |
| `designs/desktop/preview/color-palettes.html` | 2 |
| `designs/desktop/preview/color-semantic.html` | 1 |
| `designs/desktop/preview/color-surfaces.html` | 1 |
| `designs/desktop/preview/color-text-ink.html` | 1 |
| `designs/desktop/screenplay/data.jsx` | 1 |
| `designs/desktop/screenplay/screenplay.css` | 2 |
| `designs/desktop/screenplay/views.jsx` | 1 |
| `designs/desktop/settings_pages.css` | 2 |
| `designs/mobile/_shots.html` | 2 |
| `designs/mobile/index.html` | 4 |
| `designs/mobile/m_data.jsx` | 4 |
| `designs/mobile/m_kit.jsx` | 3 |
| `designs/mobile/m_screenplay.jsx` | 1 |
| `designs/mobile/m_settings.jsx` | 7 |
| `designs/theme.js` | 7 |
| `designs/themes.css` | 15 |
| `designs/website/index.html` | 1 |
| `docs/adr/0002-remote-assistant-parallel-entry-point.md` | 1 |
| `docs/adr/0006-remote-assistant-app-db-persistence.md` | 1 |
| `docs/adr/0007-plugin-runtime-fjs-a2ui.md` | 2 |
| `docs/adr/0008-plugin-security-capability-allowlist.md` | 1 |
| `docs/adr/0036-async-subagent-completion-wakes-chat-orchestrator.md` | 1 |
| `docs/solutions/agent-context-compaction.md` | 1 |
| `docs/solutions/ai-chat-codemode.md` | 10 |
| `docs/solutions/ai-chat-expanded-mode.md` | 4 |
| `docs/solutions/ai-chat-streaming-cpu-optimization.md` | 8 |
| `docs/solutions/ai-resource-contract-refactor.md` | 10 |
| `docs/solutions/chat-changes-rework.md` | 1 |
| `docs/solutions/github-skills-marketplace.md` | 3 |
| `docs/solutions/heuristic-onboarding.md` | 1 |
| `docs/solutions/infinite-canvas.md` | 4 |
| `docs/solutions/map_editor.md` | 4 |
| `docs/solutions/markdown-block-virtualized-editor.md` | 5 |
| `docs/solutions/mcp-client-and-codemode.md` | 5 |
| `docs/solutions/mobile-port.md` | 1 |
| `docs/solutions/novel_map.md` | 9 |
| `docs/solutions/plugin-system/README.md` | 3 |
| `docs/solutions/plugin-system/architecture.md` | 4 |
| `docs/solutions/plugin-system/settings-and-storage.md` | 4 |
| `docs/solutions/plugin-system/tools.md` | 1 |
| `docs/solutions/plugin-system/verification.md` | 4 |
| `docs/solutions/plugin-system/views.md` | 14 |
| `docs/solutions/plugin-system/web-plugin.md` | 7 |
| `docs/solutions/prompt-regression-evaluation.md` | 2 |
| `docs/solutions/relation-lifecycle-and-history.md` | 2 |
| `docs/solutions/remote-assistant-wechat-bridge.md` | 5 |
| `docs/solutions/screenplay-ai-path-review.md` | 1 |
| `docs/solutions/screenplay-canvas-tree-export.md` | 3 |
| `docs/solutions/screenplay-writing.md` | 2 |
| `docs/solutions/session-history-retention-and-deletion.md` | 1 |
| `docs/solutions/short-drama/agent.md` | 1 |
| `docs/solutions/short-drama/director.md` | 3 |
| `docs/solutions/short-drama/editing.md` | 3 |
| `docs/solutions/short-drama/production.md` | 3 |
| `docs/solutions/short-drama/references.md` | 3 |
| `docs/solutions/short-drama/video-generation.md` | 4 |
| `docs/solutions/tool_run.md` | 2 |
| `integration_test/codemode_data_test.dart` | 14 |
| `integration_test/codemode_orchestrator_test.dart` | 14 |
| `integration_test/codemode_resources_test.dart` | 2 |
| `integration_test/codemode_runtime_test.dart` | 3 |
| `integration_test/director_focus_test.dart` | 4 |
| `integration_test/director_props_test.dart` | 7 |
| `integration_test/director_render_test.dart` | 14 |
| `integration_test/mcp_codemode_test.dart` | 18 |
| `integration_test/plugin_joint_load_test.dart` | 22 |
| `integration_test/plugin_memory_test.dart` | 17 |
| `integration_test/plugin_performance_test.dart` | 7 |
| `integration_test/plugins_native_test.dart` | 7 |
| `integration_test/production/depth_capture_test.dart` | 15 |
| `integration_test/production/editing_export_test.dart` | 12 |
| `integration_test/production/media_pipeline_test.dart` | 8 |
| `integration_test/production/media_preview_test.dart` | 7 |
| `integration_test/production/playback_disposal_test.dart` | 2 |
| `integration_test/video_generation_service_test.dart` | 12 |
| `ios/Runner.xcodeproj/project.pbxproj` | 9 |
| `ios/Runner/AppDelegate.swift` | 1 |
| `lib/desktop/features/agent_skills/agent_skill_reference_file_tree.dart` | 56 |
| `lib/desktop/features/agent_skills/catalog_detail_panel.dart` | 68 |
| `lib/desktop/features/agent_skills/catalog_filter_bar.dart` | 18 |
| `lib/desktop/features/agent_skills/catalog_states.dart` | 16 |
| `lib/desktop/features/agent_skills/install_conflict_dialog.dart` | 20 |
| `lib/desktop/features/agent_skills/installed_skill_detail_panel.dart` | 47 |
| `lib/desktop/features/agent_skills/marketplace_catalog_tab.dart` | 4 |
| `lib/desktop/features/agent_skills/official_catalog_tab.dart` | 8 |
| `lib/desktop/features/agent_skills/setup_edit_panel.dart` | 74 |
| `lib/desktop/features/agent_skills/setup_panel.dart` | 100 |
| `lib/desktop/features/agent_skills/skill_revision_history_dialog.dart` | 15 |
| `lib/desktop/features/agent_skills/source_card.dart` | 38 |
| `lib/desktop/features/asset/library_menu_item.dart` | 5 |
| `lib/desktop/features/asset/media_preview.dart` | 24 |
| `lib/desktop/features/asset/playback_controls.dart` | 8 |
| `lib/desktop/features/canvas/canvas_palette.dart` | 6 |
| `lib/desktop/features/canvas/export_button.dart` | 1 |
| `lib/desktop/features/canvas/export_preview.dart` | 2 |
| `lib/desktop/features/canvas/layout_menu.dart` | 7 |
| `lib/desktop/features/canvas/scene_reference.dart` | 8 |
| `lib/desktop/features/canvas/widgets/canvas_ai_focus_layer.dart` | 4 |
| `lib/desktop/features/canvas/widgets/canvas_ai_status_pill.dart` | 14 |
| `lib/desktop/features/canvas/widgets/canvas_board.dart` | 11 |
| `lib/desktop/features/canvas/widgets/canvas_detail_layer.dart` | 34 |
| `lib/desktop/features/canvas/widgets/canvas_edge_type_picker.dart` | 29 |
| `lib/desktop/features/canvas/widgets/canvas_flow_adapter.dart` | 4 |
| `lib/desktop/features/canvas/widgets/canvas_list_panel.dart` | 56 |
| `lib/desktop/features/canvas/widgets/canvas_node_color_picker.dart` | 14 |
| `lib/desktop/features/canvas/widgets/canvas_node_widget.dart` | 24 |
| `lib/desktop/features/canvas/widgets/canvas_resource_picker.dart` | 28 |
| `lib/desktop/features/canvas/widgets/canvas_sticky_editor.dart` | 15 |
| `lib/desktop/features/canvas/widgets/canvas_toolbar.dart` | 16 |
| `lib/desktop/features/canvas/widgets/floating_cluster.dart` | 13 |
| `lib/desktop/features/canvas/widgets/glass.dart` | 2 |
| `lib/desktop/features/canvas/widgets/zoom_control.dart` | 14 |
| `lib/desktop/features/council/discussion_section.dart` | 38 |
| `lib/desktop/features/council/panel.dart` | 4 |
| `lib/desktop/features/council/setup_section.dart` | 42 |
| `lib/desktop/features/cover_studio/canvas.dart` | 38 |
| `lib/desktop/features/cover_studio/designer.dart` | 17 |
| `lib/desktop/features/cover_studio/records.dart` | 6 |
| `lib/desktop/features/cover_studio/studio_page.dart` | 1 |
| `lib/desktop/features/editing/assets.dart` | 57 |
| `lib/desktop/features/editing/clip.dart` | 8 |
| `lib/desktop/features/editing/export_dialog.dart` | 65 |
| `lib/desktop/features/editing/inspector.dart` | 48 |
| `lib/desktop/features/editing/preview.dart` | 19 |
| `lib/desktop/features/editing/region.dart` | 41 |
| `lib/desktop/features/editing/support.dart` | 7 |
| `lib/desktop/features/editing/timeline.dart` | 48 |
| `lib/desktop/features/map/map_cartographer_panel.dart` | 45 |
| `lib/desktop/features/map/map_create_dialogs.dart` | 37 |
| `lib/desktop/features/map/map_studio_page.dart` | 100 |
| `lib/desktop/features/map/maps_panel.dart` | 13 |
| `lib/desktop/features/monologue/message_list.dart` | 2 |
| `lib/desktop/features/monologue/panel.dart` | 2 |
| `lib/desktop/features/monologue/session_section.dart` | 16 |
| `lib/desktop/features/monologue/setup_section.dart` | 29 |
| `lib/desktop/features/narration/button.dart` | 6 |
| `lib/desktop/features/narration/dialog.dart` | 10 |
| `lib/desktop/features/narration/playback.dart` | 23 |
| `lib/desktop/features/narration/player.dart` | 1 |
| `lib/desktop/features/narration/setup.dart` | 28 |
| `lib/desktop/features/narration/voice.dart` | 11 |
| `lib/desktop/features/production/ai_mark.dart` | 2 |
| `lib/desktop/features/production/asset_picker.dart` | 32 |
| `lib/desktop/features/production/audio_composer.dart` | 28 |
| `lib/desktop/features/production/audio_history.dart` | 7 |
| `lib/desktop/features/production/audio_node.dart` | 1 |
| `lib/desktop/features/production/audio_submit.dart` | 3 |
| `lib/desktop/features/production/board.dart` | 23 |
| `lib/desktop/features/production/builtin_voices.dart` | 6 |
| `lib/desktop/features/production/camera_picker.dart` | 15 |
| `lib/desktop/features/production/canvas_controls.dart` | 25 |
| `lib/desktop/features/production/certification.dart` | 9 |
| `lib/desktop/features/production/character_input.dart` | 19 |
| `lib/desktop/features/production/composer.dart` | 30 |
| `lib/desktop/features/production/composer_toolbar.dart` | 2 |
| `lib/desktop/features/production/connection_flow.dart` | 3 |
| `lib/desktop/features/production/connection_style.dart` | 1 |
| `lib/desktop/features/production/depth_dialog.dart` | 14 |
| `lib/desktop/features/production/draft_completion.dart` | 31 |
| `lib/desktop/features/production/export_progress.dart` | 2 |
| `lib/desktop/features/production/generate_button.dart` | 2 |
| `lib/desktop/features/production/grid.dart` | 18 |
| `lib/desktop/features/production/grid/cell.dart` | 1 |
| `lib/desktop/features/production/grid/group_bar.dart` | 33 |
| `lib/desktop/features/production/grid/group_node.dart` | 12 |
| `lib/desktop/features/production/grid/group_titles.dart` | 6 |
| `lib/desktop/features/production/grid/outlet.dart` | 15 |
| `lib/desktop/features/production/grid/spec_picker.dart` | 14 |
| `lib/desktop/features/production/grid/split_bar.dart` | 14 |
| `lib/desktop/features/production/grid/split_overlay.dart` | 2 |
| `lib/desktop/features/production/history.dart` | 36 |
| `lib/desktop/features/production/image_composer.dart` | 27 |
| `lib/desktop/features/production/image_history.dart` | 7 |
| `lib/desktop/features/production/image_node.dart` | 4 |
| `lib/desktop/features/production/image_submit.dart` | 3 |
| `lib/desktop/features/production/inline_media.dart` | 14 |
| `lib/desktop/features/production/input_preview.dart` | 20 |
| `lib/desktop/features/production/node_bar.dart` | 64 |
| `lib/desktop/features/production/node_card.dart` | 91 |
| `lib/desktop/features/production/popover.dart` | 32 |
| `lib/desktop/features/production/prompt_controller.dart` | 4 |
| `lib/desktop/features/production/prompt_field.dart` | 3 |
| `lib/desktop/features/production/region.dart` | 30 |
| `lib/desktop/features/production/scene_recognition.dart` | 41 |
| `lib/desktop/features/production/selection_actions.dart` | 4 |
| `lib/desktop/features/production/selection_layer.dart` | 7 |
| `lib/desktop/features/production/spec_panel.dart` | 50 |
| `lib/desktop/features/production/speech_options.dart` | 16 |
| `lib/desktop/features/production/status.dart` | 5 |
| `lib/desktop/features/production/storage_dialog.dart` | 9 |
| `lib/desktop/features/production/style_button.dart` | 15 |
| `lib/desktop/features/production/style_editor.dart` | 25 |
| `lib/desktop/features/production/style_picker.dart` | 46 |
| `lib/desktop/features/production/style_thumb.dart` | 5 |
| `lib/desktop/features/production/subject_picker.dart` | 16 |
| `lib/desktop/features/production/support.dart` | 2 |
| `lib/desktop/features/production/task_status.dart` | 13 |
| `lib/desktop/features/production/trim_dialog.dart` | 11 |
| `lib/desktop/features/production/upload.dart` | 6 |
| `lib/desktop/features/production/view/actions.dart` | 16 |
| `lib/desktop/features/production/view/field.dart` | 10 |
| `lib/desktop/features/production/view/method.dart` | 43 |
| `lib/desktop/features/production/view/panel.dart` | 16 |
| `lib/desktop/features/production/view/panorama_actions.dart` | 10 |
| `lib/desktop/features/production/view/sphere_preview.dart` | 5 |
| `lib/desktop/features/production/voice_name.dart` | 7 |
| `lib/desktop/features/production/voice_row.dart` | 15 |
| `lib/desktop/features/production/voices.dart` | 22 |
| `lib/desktop/features/reading/reading_page.dart` | 49 |
| `lib/desktop/features/roleplay/composer.dart` | 20 |
| `lib/desktop/features/roleplay/message_list.dart` | 1 |
| `lib/desktop/features/roleplay/panel.dart` | 2 |
| `lib/desktop/features/roleplay/setup_section.dart` | 19 |
| `lib/desktop/features/screenplay/beats.dart` | 71 |
| `lib/desktop/features/screenplay/board.dart` | 8 |
| `lib/desktop/features/screenplay/character_picker.dart` | 4 |
| `lib/desktop/features/screenplay/characters.dart` | 30 |
| `lib/desktop/features/screenplay/chrome.dart` | 30 |
| `lib/desktop/features/screenplay/context_panel.dart` | 103 |
| `lib/desktop/features/screenplay/episode_move_sheet.dart` | 8 |
| `lib/desktop/features/screenplay/outline.dart` | 23 |
| `lib/desktop/features/screenplay/overview.dart` | 37 |
| `lib/desktop/features/screenplay/overview_cards.dart` | 47 |
| `lib/desktop/features/screenplay/scene_list.dart` | 26 |
| `lib/desktop/features/screenplay/scenes.dart` | 33 |
| `lib/desktop/features/screenplay/script_elements.dart` | 19 |
| `lib/desktop/features/screenplay/script_status.dart` | 5 |
| `lib/desktop/features/screenplay/season_manager.dart` | 2 |
| `lib/desktop/features/screenplay/support.dart` | 11 |
| `lib/desktop/features/storyboard/edit_form.dart` | 22 |
| `lib/desktop/features/storyboard/inline_editor.dart` | 1 |
| `lib/desktop/features/storyboard/region.dart` | 36 |
| `lib/desktop/features/storyboard/shot_row.dart` | 24 |
| `lib/desktop/features/theater/line_card.dart` | 3 |
| `lib/desktop/features/theater/line_list.dart` | 1 |
| `lib/desktop/features/theater/panel.dart` | 2 |
| `lib/desktop/features/theater/performance_section.dart` | 16 |
| `lib/desktop/features/theater/setup_section.dart` | 18 |
| `lib/desktop/pages/home.dart` | 59 |
| `lib/desktop/pages/home_management_lists.dart` | 34 |
| `lib/desktop/pages/novel_editor.dart` | 49 |
| `lib/desktop/pages/onboarding.dart` | 63 |
| `lib/desktop/pages/settings/usage_page.dart` | 1 |
| `lib/desktop/pages/workspace_editor_page.dart` | 3 |
| `lib/desktop/widgets/activation_failure_app.dart` | 12 |
| `lib/desktop/widgets/agent_management/agent_model_settings_page.dart` | 26 |
| `lib/desktop/widgets/agent_management/agent_rule_copy_dialog.dart` | 57 |
| `lib/desktop/widgets/agent_management/agent_rule_edit_panel.dart` | 61 |
| `lib/desktop/widgets/agent_management/agent_rules_grid_page.dart` | 38 |
| `lib/desktop/widgets/agent_management/ai_shortcut_action_edit_panel.dart` | 56 |
| `lib/desktop/widgets/agent_management/ai_shortcut_action_list.dart` | 16 |
| `lib/desktop/widgets/agent_management/expert_team_page.dart` | 70 |
| `lib/desktop/widgets/agent_management/home_management_cards.dart` | 78 |
| `lib/desktop/widgets/agent_management/novel_editor_agent_nav.dart` | 26 |
| `lib/desktop/widgets/agent_management/novel_editor_subagent_nav.dart` | 30 |
| `lib/desktop/widgets/agent_management/subagent_edit_panel.dart` | 74 |
| `lib/desktop/widgets/agent_management/subagent_prompt_edit_panel.dart` | 22 |
| `lib/desktop/widgets/ai/chat/chat_onboarding_bubble.dart` | 18 |
| `lib/desktop/widgets/ai/chat/chat_side_panel.dart` | 12 |
| `lib/desktop/widgets/ai/chat/composer.dart` | 104 |
| `lib/desktop/widgets/ai/chat/config_hint.dart` | 12 |
| `lib/desktop/widgets/ai/chat/expanded_chat_area.dart` | 3 |
| `lib/desktop/widgets/ai/chat/floating.dart` | 26 |
| `lib/desktop/widgets/ai/chat/header.dart` | 18 |
| `lib/desktop/widgets/ai/chat/message_renderer.dart` | 1 |
| `lib/desktop/widgets/ai/chat/panel.dart` | 18 |
| `lib/desktop/widgets/ai/chat/session_context_menu.dart` | 10 |
| `lib/desktop/widgets/ai/chat/session_history_strip.dart` | 24 |
| `lib/desktop/widgets/ai/chat/session_list.dart` | 28 |
| `lib/desktop/widgets/ai/chat/session_switcher.dart` | 31 |
| `lib/desktop/widgets/ai/chat/slash_commands.dart` | 26 |
| `lib/desktop/widgets/ai/diff/pending_changes_detail_dialog.dart` | 52 |
| `lib/desktop/widgets/ai/diff/pending_changes_summary_card.dart` | 30 |
| `lib/desktop/widgets/ai/feature_onboarding_dialog.dart` | 48 |
| `lib/desktop/widgets/ai/mode_session_list_row.dart` | 15 |
| `lib/desktop/widgets/ai/model/mode_model_selector.dart` | 2 |
| `lib/desktop/widgets/ai/model/model_selector.dart` | 82 |
| `lib/desktop/widgets/ai/shared/ai_panel_header.dart` | 16 |
| `lib/desktop/widgets/context_column/context_column_scaffold.dart` | 16 |
| `lib/desktop/widgets/detached_window.dart` | 3 |
| `lib/desktop/widgets/edit_panel_breadcrumb.dart` | 5 |
| `lib/desktop/widgets/entity_graph_panel.dart` | 100 |
| `lib/desktop/widgets/heuristic/discovery_banner.dart` | 15 |
| `lib/desktop/widgets/heuristic/scene_heuristic_banner.dart` | 7 |
| `lib/desktop/widgets/history/change_history_panel.dart` | 19 |
| `lib/desktop/widgets/history/resource_history_button.dart` | 4 |
| `lib/desktop/widgets/home/all_works_header.dart` | 45 |
| `lib/desktop/widgets/home/greeting_header.dart` | 14 |
| `lib/desktop/widgets/home/library_home_panel.dart` | 49 |
| `lib/desktop/widgets/home/novel_home_helpers.dart` | 13 |
| `lib/desktop/widgets/home/resume_section.dart` | 48 |
| `lib/desktop/widgets/novel_editor/add_to_library_banner.dart` | 16 |
| `lib/desktop/widgets/novel_editor/collapsed_ai_panel.dart` | 9 |
| `lib/desktop/widgets/novel_editor/collapsed_sidebar_back_button.dart` | 5 |
| `lib/desktop/widgets/novel_editor/novel_load_error_state.dart` | 7 |
| `lib/desktop/widgets/novel_editor/novel_missing_state.dart` | 8 |
| `lib/desktop/widgets/novel_editor/sidebar_divider.dart` | 2 |
| `lib/desktop/widgets/novel_editor/step3_cover_overlay.dart` | 1 |
| `lib/desktop/widgets/novel_export_dialog.dart` | 5 |
| `lib/desktop/widgets/novel_form_dialog.dart` | 92 |
| `lib/desktop/widgets/novel_import_dialog.dart` | 30 |
| `lib/desktop/widgets/novel_list.dart` | 68 |
| `lib/desktop/widgets/settings/settings_dialog.dart` | 36 |
| `lib/desktop/widgets/settings/settings_storage_section.dart` | 24 |
| `lib/desktop/widgets/sidebar/chapter_tree.dart` | 54 |
| `lib/desktop/widgets/sidebar/collapsed_sidebar.dart` | 18 |
| `lib/desktop/widgets/sidebar/header.dart` | 31 |
| `lib/desktop/widgets/sidebar/menus.dart` | 22 |
| `lib/desktop/widgets/sidebar/rail.dart` | 22 |
| `lib/desktop/widgets/sidebar/sections.dart` | 79 |
| `lib/desktop/widgets/sidebar/sidebar.dart` | 11 |
| `lib/desktop/widgets/sidebar/tree_items.dart` | 30 |
| `lib/desktop/widgets/update_entry.dart` | 4 |
| `lib/desktop/widgets/user_profile_bar.dart` | 26 |
| `lib/desktop/widgets/workspace/chapter_comment_highlight.dart` | 3 |
| `lib/desktop/widgets/workspace/chapter_comment_popover.dart` | 49 |
| `lib/desktop/widgets/workspace/chapter_editor.dart` | 139 |
| `lib/desktop/widgets/workspace/chapter_editor_minimap.dart` | 9 |
| `lib/desktop/widgets/workspace/chapter_list_dropdown.dart` | 42 |
| `lib/desktop/widgets/workspace/chapter_outline_window.dart` | 13 |
| `lib/desktop/widgets/workspace/chapter_preview_dialog.dart` | 17 |
| `lib/desktop/widgets/workspace/character_profile_editor.dart` | 183 |
| `lib/desktop/widgets/workspace/foreshadowing_editor.dart` | 46 |
| `lib/desktop/widgets/workspace/hero.dart` | 35 |
| `lib/desktop/widgets/workspace/novel_description_editor.dart` | 7 |
| `lib/desktop/widgets/workspace/novel_overview.dart` | 116 |
| `lib/desktop/widgets/workspace/novel_workspace_panel.dart` | 114 |
| `lib/desktop/widgets/workspace/outline_architecture_view.dart` | 70 |
| `lib/desktop/widgets/workspace/outline_beat_chips.dart` | 11 |
| `lib/desktop/widgets/workspace/outline_beat_dialog.dart` | 47 |
| `lib/desktop/widgets/workspace/outline_editor.dart` | 31 |
| `lib/desktop/widgets/workspace/outline_global_view.dart` | 49 |
| `lib/desktop/widgets/workspace/outline_timeline_strip.dart` | 87 |
| `lib/desktop/widgets/workspace/outlines_landing_state.dart` | 14 |
| `lib/desktop/widgets/workspace/volume_editor.dart` | 11 |
| `lib/desktop/widgets/workspace/workspace_item_editor.dart` | 113 |
| `lib/main.dart` | 21 |
| `lib/mobile/app.dart` | 1 |
| `lib/mobile/features/agent_skills/catalog_skill_detail_page.dart` | 71 |
| `lib/mobile/features/agent_skills/category_filter_bar.dart` | 8 |
| `lib/mobile/features/agent_skills/global_skill_setup_page.dart` | 14 |
| `lib/mobile/features/agent_skills/import_flow.dart` | 4 |
| `lib/mobile/features/agent_skills/install_conflict_dialog.dart` | 22 |
| `lib/mobile/features/agent_skills/installed_skill_detail_page.dart` | 53 |
| `lib/mobile/features/agent_skills/marketplace_tab.dart` | 31 |
| `lib/mobile/features/agent_skills/novel_agent_skill_manage_page.dart` | 86 |
| `lib/mobile/features/agent_skills/official_tab.dart` | 27 |
| `lib/mobile/features/agent_skills/skill_revision_history_page.dart` | 7 |
| `lib/mobile/features/agent_skills/tab_states.dart` | 5 |
| `lib/mobile/features/council/page.dart` | 4 |
| `lib/mobile/features/council/page_sections.dart` | 72 |
| `lib/mobile/features/council/page_widgets.dart` | 39 |
| `lib/mobile/features/cover_studio/bottom_bar.dart` | 8 |
| `lib/mobile/features/cover_studio/canvas.dart` | 11 |
| `lib/mobile/features/cover_studio/canvas_actions.dart` | 12 |
| `lib/mobile/features/cover_studio/designer_sheet.dart` | 25 |
| `lib/mobile/features/cover_studio/filmstrip.dart` | 14 |
| `lib/mobile/features/cover_studio/records_sheet.dart` | 12 |
| `lib/mobile/features/cover_studio/studio_page.dart` | 5 |
| `lib/mobile/features/library/filters.dart` | 3 |
| `lib/mobile/features/library/resume.dart` | 27 |
| `lib/mobile/features/library/shelf_options_sheet.dart` | 21 |
| `lib/mobile/features/map/bottom_bar.dart` | 18 |
| `lib/mobile/features/map/designer_sheet.dart` | 15 |
| `lib/mobile/features/map/history_sheet.dart` | 6 |
| `lib/mobile/features/map/location_tree.dart` | 18 |
| `lib/mobile/features/map/place_card.dart` | 16 |
| `lib/mobile/features/map/places_sheet.dart` | 14 |
| `lib/mobile/features/map/studio_page.dart` | 22 |
| `lib/mobile/features/monologue/page.dart` | 3 |
| `lib/mobile/features/monologue/page_sections.dart` | 33 |
| `lib/mobile/features/monologue/page_widgets.dart` | 31 |
| `lib/mobile/features/reading/reading_page.dart` | 77 |
| `lib/mobile/features/roleplay/page.dart` | 3 |
| `lib/mobile/features/roleplay/page_sections.dart` | 21 |
| `lib/mobile/features/roleplay/page_widgets.dart` | 17 |
| `lib/mobile/features/screenplay/assistant_bar.dart` | 12 |
| `lib/mobile/features/screenplay/beats_page.dart` | 24 |
| `lib/mobile/features/screenplay/editor_page.dart` | 8 |
| `lib/mobile/features/screenplay/element_bar.dart` | 6 |
| `lib/mobile/features/screenplay/episode_card.dart` | 12 |
| `lib/mobile/features/screenplay/episode_move_sheet.dart` | 2 |
| `lib/mobile/features/screenplay/episode_picker_sheet.dart` | 9 |
| `lib/mobile/features/screenplay/header.dart` | 7 |
| `lib/mobile/features/screenplay/library_meta.dart` | 2 |
| `lib/mobile/features/screenplay/outline_page.dart` | 20 |
| `lib/mobile/features/screenplay/overview.dart` | 8 |
| `lib/mobile/features/screenplay/overview_cards.dart` | 25 |
| `lib/mobile/features/screenplay/scene_editor.dart` | 2 |
| `lib/mobile/features/screenplay/scenes_page.dart` | 16 |
| `lib/mobile/features/screenplay/season_manage_sheet.dart` | 3 |
| `lib/mobile/features/screenplay/shared_content.dart` | 2 |
| `lib/mobile/features/screenplay/support.dart` | 15 |
| `lib/mobile/features/theater/page.dart` | 3 |
| `lib/mobile/features/theater/page_sections.dart` | 39 |
| `lib/mobile/features/theater/page_widgets.dart` | 35 |
| `lib/mobile/pages/account_page.dart` | 55 |
| `lib/mobile/pages/agent_model_settings_page.dart` | 35 |
| `lib/mobile/pages/agent_prompt_manage_page.dart` | 20 |
| `lib/mobile/pages/ai_providers_settings_page.dart` | 4 |
| `lib/mobile/pages/ai_shortcut_manage_page.dart` | 34 |
| `lib/mobile/pages/chapter_editor_page.dart` | 133 |
| `lib/mobile/pages/chapter_history_page.dart` | 10 |
| `lib/mobile/pages/chapter_preview_page.dart` | 11 |
| `lib/mobile/pages/character_editor_page.dart` | 95 |
| `lib/mobile/pages/chat_page.dart` | 36 |
| `lib/mobile/pages/chat_session_page.dart` | 15 |
| `lib/mobile/pages/editor_settings_page.dart` | 5 |
| `lib/mobile/pages/entry_editor_page.dart` | 17 |
| `lib/mobile/pages/foreshadowing_editor_page.dart` | 15 |
| `lib/mobile/pages/library_drafts_page.dart` | 37 |
| `lib/mobile/pages/library_page.dart` | 92 |
| `lib/mobile/pages/location_editor_page.dart` | 43 |
| `lib/mobile/pages/novel_agent_rule_manage_page.dart` | 23 |
| `lib/mobile/pages/novel_chat_page.dart` | 153 |
| `lib/mobile/pages/novel_create_page.dart` | 82 |
| `lib/mobile/pages/novel_editor_page.dart` | 80 |
| `lib/mobile/pages/novel_import_page.dart` | 42 |
| `lib/mobile/pages/onboarding_page.dart` | 30 |
| `lib/mobile/pages/outline_beat_editor_page.dart` | 45 |
| `lib/mobile/pages/outline_editor_page.dart` | 49 |
| `lib/mobile/pages/settings_page.dart` | 66 |
| `lib/mobile/pages/subagent_manage_page.dart` | 47 |
| `lib/mobile/pages/subagent_prompt_edit_page.dart` | 12 |
| `lib/mobile/pages/usage_page.dart` | 4 |
| `lib/mobile/services/android_saf_directory_import.dart` | 2 |
| `lib/mobile/widgets/agent_edit_scaffold.dart` | 92 |
| `lib/mobile/widgets/agent_rule_copy_sheet.dart` | 59 |
| `lib/mobile/widgets/ai_session_history_sheet.dart` | 56 |
| `lib/mobile/widgets/assistant_hub.dart` | 50 |
| `lib/mobile/widgets/chapter_picker_sheet.dart` | 20 |
| `lib/mobile/widgets/chapter_toc_sheet.dart` | 34 |
| `lib/mobile/widgets/chapters_panel.dart` | 57 |
| `lib/mobile/widgets/character_image_actions.dart` | 7 |
| `lib/mobile/widgets/character_image_style_sheet.dart` | 10 |
| `lib/mobile/widgets/characters_panel.dart` | 8 |
| `lib/mobile/widgets/chat_composer.dart` | 36 |
| `lib/mobile/widgets/compendium_entry_row.dart` | 6 |
| `lib/mobile/widgets/compendium_panel.dart` | 23 |
| `lib/mobile/widgets/compendium_photos.dart` | 10 |
| `lib/mobile/widgets/detail_scaffold.dart` | 25 |
| `lib/mobile/widgets/document_folder_browser.dart` | 59 |
| `lib/mobile/widgets/editor_app_bar.dart` | 14 |
| `lib/mobile/widgets/entity_graph_panel.dart` | 47 |
| `lib/mobile/widgets/foreshadowings_panel.dart` | 12 |
| `lib/mobile/widgets/maps_panel.dart` | 13 |
| `lib/mobile/widgets/mobile_ai_mode.dart` | 5 |
| `lib/mobile/widgets/mobile_ai_mode_switch_strip.dart` | 15 |
| `lib/mobile/widgets/mobile_ai_session_app_bar.dart` | 18 |
| `lib/mobile/widgets/model_effort_sheet.dart` | 58 |
| `lib/mobile/widgets/model_selector.dart` | 27 |
| `lib/mobile/widgets/novel_cover.dart` | 4 |
| `lib/mobile/widgets/novel_export_sheet.dart` | 12 |
| `lib/mobile/widgets/outlines_panel.dart` | 10 |
| `lib/mobile/widgets/overview_panel.dart` | 184 |
| `lib/mobile/widgets/plugin_pages.dart` | 15 |
| `lib/mobile/widgets/relation_panel.dart` | 5 |
| `lib/mobile/widgets/section_panel.dart` | 4 |
| `lib/mobile/widgets/section_scaffold.dart` | 62 |
| `lib/mobile/widgets/segmented_tab_switcher.dart` | 1 |
| `lib/mobile/widgets/segmented_tabs.dart` | 7 |
| `lib/mobile/widgets/sheet.dart` | 20 |
| `lib/mobile/widgets/tab_bar.dart` | 15 |
| `lib/shared/agent/agent.dart` | 1 |
| `lib/shared/app_config.dart` | 12 |
| `lib/shared/components/collapsible_list_group.dart` | 10 |
| `lib/shared/components/dialog_feedback.dart` | 22 |
| `lib/shared/components/resizable_pane_divider.dart` | 3 |
| `lib/shared/components/reveric_autocomplete.dart` | 11 |
| `lib/shared/components/reveric_badge.dart` | 6 |
| `lib/shared/components/reveric_button.dart` | 26 |
| `lib/shared/components/reveric_checkbox.dart` | 5 |
| `lib/shared/components/reveric_color_picker_dialog.dart` | 3 |
| `lib/shared/components/reveric_context_menu.dart` | 49 |
| `lib/shared/components/reveric_dialog.dart` | 26 |
| `lib/shared/components/reveric_dropdowns.dart` | 44 |
| `lib/shared/components/reveric_filter_chip.dart` | 7 |
| `lib/shared/components/reveric_icon_button.dart` | 10 |
| `lib/shared/components/reveric_input_decoration.dart` | 6 |
| `lib/shared/components/reveric_inputs.dart` | 14 |
| `lib/shared/components/reveric_more_menu_button.dart` | 13 |
| `lib/shared/components/reveric_placeholder.dart` | 15 |
| `lib/shared/components/reveric_popover.dart` | 6 |
| `lib/shared/components/reveric_search_field.dart` | 21 |
| `lib/shared/components/reveric_segmented_control.dart` | 28 |
| `lib/shared/components/reveric_select.dart` | 73 |
| `lib/shared/components/reveric_slidable_delete.dart` | 11 |
| `lib/shared/components/reveric_spinner.dart` | 4 |
| `lib/shared/components/reveric_surfaces.dart` | 16 |
| `lib/shared/components/reveric_switch.dart` | 3 |
| `lib/shared/components/reveric_tags_editor.dart` | 39 |
| `lib/shared/components/reveric_text_field.dart` | 18 |
| `lib/shared/components/status_animation_clock.dart` | 1 |
| `lib/shared/components/waypoint_connection_style.dart` | 2 |
| `lib/shared/conditions/condition_builder.dart` | 41 |
| `lib/shared/database/app_database.dart` | 3 |
| `lib/shared/database/daos/novel_dao.dart` | 2 |
| `lib/shared/database/novel_content_database.dart` | 1 |
| `lib/shared/entity_graph/center_select.dart` | 7 |
| `lib/shared/entity_graph/colors.dart` | 9 |
| `lib/shared/entity_graph/depth_select.dart` | 13 |
| `lib/shared/entity_graph/entity_list_section.dart` | 37 |
| `lib/shared/entity_graph/entity_type_filter.dart` | 20 |
| `lib/shared/entity_graph/export_action.dart` | 2 |
| `lib/shared/entity_graph/graph_widget.dart` | 59 |
| `lib/shared/entity_graph/legend.dart` | 10 |
| `lib/shared/entity_graph/overview.dart` | 10 |
| `lib/shared/entity_graph/png_export.dart` | 12 |
| `lib/shared/form/hooked_text_form_field.dart` | 20 |
| `lib/shared/localization/locale_keys.dart` | 3 |
| `lib/shared/logger/log_manager.dart` | 2 |
| `lib/shared/logger/startup_failure_reporter.dart` | 2 |
| `lib/shared/models/app_settings_aggregate_data.dart` | 1 |
| `lib/shared/models/canvas_connection_path.dart` | 2 |
| `lib/shared/models/director/document.dart` | 3 |
| `lib/shared/models/director/schema.dart` | 1 |
| `lib/shared/models/editing/document.dart` | 2 |
| `lib/shared/models/object_storage_config.dart` | 1 |
| `lib/shared/models/plugin/ui_schema.dart` | 1 |
| `lib/shared/models/plugin/view.dart` | 2 |
| `lib/shared/models/provider_brand.dart` | 1 |
| `lib/shared/models/slash_entry.dart` | 1 |
| `lib/shared/providers/agent_skill_catalog_providers.dart` | 1 |
| `lib/shared/providers/ai_providers.dart` | 1 |
| `lib/shared/providers/depth.dart` | 5 |
| `lib/shared/providers/production_images.dart` | 1 |
| `lib/shared/providers/production_media.dart` | 1 |
| `lib/shared/providers/settings_providers.dart` | 17 |
| `lib/shared/providers/settings_providers.g.dart` | 17 |
| `lib/shared/providers/video_tasks.dart` | 2 |
| `lib/shared/services/agent_skill_catalog_service.dart` | 2 |
| `lib/shared/services/agent_skill_import_parser.dart` | 2 |
| `lib/shared/services/ai/assets/volcengine.dart` | 1 |
| `lib/shared/services/ai/chat_turn_runner.dart` | 3 |
| `lib/shared/services/ai/codex/credentials.dart` | 1 |
| `lib/shared/services/ai/ffmpeg/command.dart` | 1 |
| `lib/shared/services/ai/files/attachments.dart` | 1 |
| `lib/shared/services/ai/files/command_paths.dart` | 2 |
| `lib/shared/services/ai/files/management.dart` | 1 |
| `lib/shared/services/ai/files/session_files.dart` | 4 |
| `lib/shared/services/ai/image.dart` | 2 |
| `lib/shared/services/ai/image/client.dart` | 2 |
| `lib/shared/services/ai/media/production.dart` | 1 |
| `lib/shared/services/ai/tools_cross_work.dart` | 4 |
| `lib/shared/services/ai/tools_image.dart` | 2 |
| `lib/shared/services/ai/trace_reporter_service.dart` | 1 |
| `lib/shared/services/ai/video/task_service.dart` | 4 |
| `lib/shared/services/anonymous_outbox_service.dart` | 2 |
| `lib/shared/services/backup_service.dart` | 33 |
| `lib/shared/services/canvas_export/format.dart` | 1 |
| `lib/shared/services/canvas_export/schema.dart` | 1 |
| `lib/shared/services/canvas_export/svg.dart` | 1 |
| `lib/shared/services/canvas_export/validate.dart` | 1 |
| `lib/shared/services/cover_studio_orchestrator.dart` | 1 |
| `lib/shared/services/crash_reporting/native_crash_reporting.dart` | 1 |
| `lib/shared/services/debug/debug_ai_provider.dart` | 1 |
| `lib/shared/services/debug/debug_provider_client.dart` | 1 |
| `lib/shared/services/debug/sqlite_schema_repair_orchestrator.dart` | 1 |
| `lib/shared/services/demo_novel.dart` | 1 |
| `lib/shared/services/depth/native_runner.dart` | 2 |
| `lib/shared/services/diagnostics_export_orchestrator.dart` | 1 |
| `lib/shared/services/director/actor_models.dart` | 2 |
| `lib/shared/services/director/commands.dart` | 5 |
| `lib/shared/services/director/export_task.dart` | 4 |
| `lib/shared/services/director/renderer.dart` | 3 |
| `lib/shared/services/director/scene_builder.dart` | 4 |
| `lib/shared/services/director/session.dart` | 2 |
| `lib/shared/services/director/storage.dart` | 4 |
| `lib/shared/services/editing/render_service.dart` | 3 |
| `lib/shared/services/file_workspace_orchestrator.dart` | 10 |
| `lib/shared/services/generate_map_orchestrator.dart` | 2 |
| `lib/shared/services/image_library_service.dart` | 6 |
| `lib/shared/services/initialization/demo_screenplay.dart` | 1 |
| `lib/shared/services/item_photo_import_orchestrator.dart` | 1 |
| `lib/shared/services/lifecycle_visibility_guard.dart` | 2 |
| `lib/shared/services/mcp/oauth/callback.dart` | 1 |
| `lib/shared/services/network_image/disk_cache.dart` | 2 |
| `lib/shared/services/novel_actions.dart` | 3 |
| `lib/shared/services/novel_content.dart` | 1 |
| `lib/shared/services/novel_export.dart` | 1 |
| `lib/shared/services/object_storage/service.dart` | 2 |
| `lib/shared/services/plugins/host.dart` | 2 |
| `lib/shared/services/plugins/prelude.dart` | 3 |
| `lib/shared/services/plugins/registry.dart` | 1 |
| `lib/shared/services/plugins/sql_bridge.dart` | 5 |
| `lib/shared/services/plugins/sql_contract.dart` | 5 |
| `lib/shared/services/plugins/sqlite_worker.dart` | 4 |
| `lib/shared/services/production/audio_service.dart` | 2 |
| `lib/shared/services/production/backup_media.dart` | 2 |
| `lib/shared/services/production/builtin_voice_orchestrator.dart` | 1 |
| `lib/shared/services/production/canvas_service.dart` | 1 |
| `lib/shared/services/production/derived_placement.dart` | 4 |
| `lib/shared/services/production/director_output_orchestrator.dart` | 3 |
| `lib/shared/services/production/grid_orchestrator.dart` | 2 |
| `lib/shared/services/production/image_service.dart` | 7 |
| `lib/shared/services/production/import_orchestrator.dart` | 8 |
| `lib/shared/services/production/library_service.dart` | 1 |
| `lib/shared/services/production/media_service.dart` | 2 |
| `lib/shared/services/production/panorama_service.dart` | 1 |
| `lib/shared/services/production/result_service.dart` | 1 |
| `lib/shared/services/production/tidy_layout.dart` | 1 |
| `lib/shared/services/production/video_tool_orchestrator.dart` | 1 |
| `lib/shared/services/single_instance_service.dart` | 1 |
| `lib/shared/services/system_font_service.dart` | 1 |
| `lib/shared/services/system_notification_service.dart` | 2 |
| `lib/shared/services/system_tray_service.dart` | 10 |
| `lib/shared/services/system_ui_service.dart` | 2 |
| `lib/shared/services/update/update_service.dart` | 5 |
| `lib/shared/services/webdav_backup_service.dart` | 1 |
| `lib/shared/services/webdav_transport.dart` | 2 |
| `lib/shared/services/window_lifecycle_channel.dart` | 3 |
| `lib/shared/theme/canvas_card_metrics.dart` | 12 |
| `lib/shared/theme/canvas_colors.dart` | 21 |
| `lib/shared/theme/palette.dart` | 12 |
| `lib/shared/theme/reveric_colors.dart` | 9 |
| `lib/shared/theme/reveric_elevation.dart` | 7 |
| `lib/shared/theme/reveric_icons.dart` | 5 |
| `lib/shared/theme/reveric_spacing.dart` | 7 |
| `lib/shared/theme/reveric_theme.dart` | 59 |
| `lib/shared/theme/reveric_typography.dart` | 6 |
| `lib/shared/theme/theme.dart` | 6 |
| `lib/shared/utils/avatar_storage.dart` | 2 |
| `lib/shared/utils/storage_paths.dart` | 4 |
| `lib/shared/utils/text_input_formatters.dart` | 1 |
| `lib/shared/widgets/a2ui/catalog.dart` | 5 |
| `lib/shared/widgets/a2ui/components/button.dart` | 9 |
| `lib/shared/widgets/a2ui/components/choice_picker.dart` | 10 |
| `lib/shared/widgets/a2ui/components/container.dart` | 6 |
| `lib/shared/widgets/a2ui/components/display.dart` | 72 |
| `lib/shared/widgets/a2ui/components/field_frame.dart` | 6 |
| `lib/shared/widgets/a2ui/components/layout.dart` | 7 |
| `lib/shared/widgets/a2ui/components/text_field.dart` | 3 |
| `lib/shared/widgets/a2ui/components/toggle.dart` | 13 |
| `lib/shared/widgets/a2ui/node_view.dart` | 6 |
| `lib/shared/widgets/a2ui/preview/config_preview.dart` | 2 |
| `lib/shared/widgets/a2ui/preview/preview_layout.dart` | 12 |
| `lib/shared/widgets/a2ui/preview/preview_panel.dart` | 14 |
| `lib/shared/widgets/a2ui/session.dart` | 2 |
| `lib/shared/widgets/a2ui/surface_view.dart` | 6 |
| `lib/shared/widgets/agent_avatar.dart` | 3 |
| `lib/shared/widgets/agent_skill/marketplace_browser.dart` | 5 |
| `lib/shared/widgets/agent_skill/skill_revision_components.dart` | 34 |
| `lib/shared/widgets/agent_skill_export_dialog.dart` | 65 |
| `lib/shared/widgets/agent_skill_import_dialog.dart` | 55 |
| `lib/shared/widgets/agent_skill_import_source_form.dart` | 21 |
| `lib/shared/widgets/ai/agent_message_card.dart` | 23 |
| `lib/shared/widgets/ai/agent_message_menu.dart` | 11 |
| `lib/shared/widgets/ai/agent_round_detail_dialog.dart` | 18 |
| `lib/shared/widgets/ai/ai_avatar.dart` | 3 |
| `lib/shared/widgets/ai/ai_mode_error_notice.dart` | 9 |
| `lib/shared/widgets/ai/chat/assistant_empty_state.dart` | 23 |
| `lib/shared/widgets/ai/chat/attachment_body.dart` | 5 |
| `lib/shared/widgets/ai/chat/attachment_input.dart` | 1 |
| `lib/shared/widgets/ai/chat/background_agents.dart` | 47 |
| `lib/shared/widgets/ai/chat/chat_message_parts.dart` | 92 |
| `lib/shared/widgets/ai/chat/chat_message_view.dart` | 91 |
| `lib/shared/widgets/ai/chat/compaction_card.dart` | 27 |
| `lib/shared/widgets/ai/chat/composer_controller.dart` | 3 |
| `lib/shared/widgets/ai/chat/continue_session_offer_bar.dart` | 17 |
| `lib/shared/widgets/ai/chat/feedback_dialog.dart` | 21 |
| `lib/shared/widgets/ai/chat/next_action_bar.dart` | 26 |
| `lib/shared/widgets/ai/chat/todo_panel.dart` | 50 |
| `lib/shared/widgets/ai/chat/tool_operation_strip.dart` | 26 |
| `lib/shared/widgets/ai/chat/typing_indicator.dart` | 4 |
| `lib/shared/widgets/ai/council/message_card.dart` | 10 |
| `lib/shared/widgets/ai/council/participant.dart` | 22 |
| `lib/shared/widgets/ai/council/summary_card.dart` | 15 |
| `lib/shared/widgets/ai/council/timeline.dart` | 24 |
| `lib/shared/widgets/ai/diff/diff_detail_dialog.dart` | 8 |
| `lib/shared/widgets/ai/diff/diff_view.dart` | 43 |
| `lib/shared/widgets/ai/diff/recent_changes_log.dart` | 24 |
| `lib/shared/widgets/ai/diff/resource_type_tag.dart` | 4 |
| `lib/shared/widgets/ai/markdown_code_block.dart` | 16 |
| `lib/shared/widgets/ai/monologue_body.dart` | 8 |
| `lib/shared/widgets/ai/provider_model_icon.dart` | 11 |
| `lib/shared/widgets/ai/roleplay_message_card.dart` | 9 |
| `lib/shared/widgets/ai/theater_direction_note.dart` | 15 |
| `lib/shared/widgets/ai/theater_director_bar.dart` | 22 |
| `lib/shared/widgets/ai/theater_line_body.dart` | 2 |
| `lib/shared/widgets/ai/theater_write_button.dart` | 11 |
| `lib/shared/widgets/ai/thinking_card.dart` | 21 |
| `lib/shared/widgets/ai/tool_activity_group.dart` | 56 |
| `lib/shared/widgets/ai/tool_approval_card.dart` | 86 |
| `lib/shared/widgets/ai/tool_operation_activity.dart` | 1 |
| `lib/shared/widgets/ai/tool_permission_controls.dart` | 15 |
| `lib/shared/widgets/ai/tool_permission_editor.dart` | 34 |
| `lib/shared/widgets/ai/tools/ask_user_card.dart` | 67 |
| `lib/shared/widgets/ai/tools/character_image_tool_card.dart` | 64 |
| `lib/shared/widgets/ai/tools/codemode_detail_dialog.dart` | 16 |
| `lib/shared/widgets/ai/tools/create_tool_card_body.dart` | 5 |
| `lib/shared/widgets/ai/tools/edit_tool_card_body.dart` | 7 |
| `lib/shared/widgets/ai/tools/generic_tool_card_body.dart` | 5 |
| `lib/shared/widgets/ai/tools/glob_grep_tool_card_body.dart` | 14 |
| `lib/shared/widgets/ai/tools/graph_search_tool_card_body.dart` | 7 |
| `lib/shared/widgets/ai/tools/mcp_tool_card_body.dart` | 1 |
| `lib/shared/widgets/ai/tools/plugin_tool_card_body.dart` | 1 |
| `lib/shared/widgets/ai/tools/read_tool_card_body.dart` | 3 |
| `lib/shared/widgets/ai/tools/run_tool_card_body.dart` | 24 |
| `lib/shared/widgets/ai/tools/search_tool_card_body.dart` | 5 |
| `lib/shared/widgets/ai/tools/skill_tool_card_body.dart` | 4 |
| `lib/shared/widgets/ai/tools/spawn_agent_activity_line.dart` | 10 |
| `lib/shared/widgets/ai/tools/spawn_agent_identity.dart` | 21 |
| `lib/shared/widgets/ai/tools/spawn_agent_tool_card_body.dart` | 19 |
| `lib/shared/widgets/ai/tools/todo_tool_card.dart` | 41 |
| `lib/shared/widgets/ai/tools/tool_card_common.dart` | 47 |
| `lib/shared/widgets/ai/tools/tool_card_descriptor.dart` | 9 |
| `lib/shared/widgets/ai/tools/tool_detail_body.dart` | 20 |
| `lib/shared/widgets/ai/tools/tool_resource_resolver.dart` | 10 |
| `lib/shared/widgets/ai/tools/write_tool_card_body.dart` | 6 |
| `lib/shared/widgets/app_background.dart` | 5 |
| `lib/shared/widgets/brand_loader.dart` | 6 |
| `lib/shared/widgets/chapter/chapter_preview_stage.dart` | 7 |
| `lib/shared/widgets/chapter_copy_replace_panel.dart` | 37 |
| `lib/shared/widgets/character/character_profile_section.dart` | 30 |
| `lib/shared/widgets/character/character_relations_overview.dart` | 35 |
| `lib/shared/widgets/character/character_tag_fields.dart` | 8 |
| `lib/shared/widgets/character/picker.dart` | 37 |
| `lib/shared/widgets/collections/cover.dart` | 5 |
| `lib/shared/widgets/collections/empty.dart` | 5 |
| `lib/shared/widgets/collections/location.dart` | 4 |
| `lib/shared/widgets/collections/membership_picker.dart` | 16 |
| `lib/shared/widgets/collections/name_dialog.dart` | 5 |
| `lib/shared/widgets/collections/shelf.dart` | 38 |
| `lib/shared/widgets/collections/surface.dart` | 8 |
| `lib/shared/widgets/collections/work_menu.dart` | 6 |
| `lib/shared/widgets/collections/work_picker.dart` | 7 |
| `lib/shared/widgets/confirm_dialog.dart` | 20 |
| `lib/shared/widgets/cover_studio/batch_row.dart` | 14 |
| `lib/shared/widgets/cover_studio/brief_section.dart` | 39 |
| `lib/shared/widgets/cover_studio/chips.dart` | 26 |
| `lib/shared/widgets/cover_studio/generate_footer.dart` | 18 |
| `lib/shared/widgets/cover_studio/reference_section.dart` | 25 |
| `lib/shared/widgets/cover_studio/sections.dart` | 49 |
| `lib/shared/widgets/cover_studio/slot_view.dart` | 17 |
| `lib/shared/widgets/director/aspect.dart` | 24 |
| `lib/shared/widgets/director/camera_preview.dart` | 16 |
| `lib/shared/widgets/director/error_status.dart` | 3 |
| `lib/shared/widgets/director/frame_content.dart` | 2 |
| `lib/shared/widgets/director/gizmo.dart` | 2 |
| `lib/shared/widgets/director/header.dart` | 10 |
| `lib/shared/widgets/director/history_panel.dart` | 27 |
| `lib/shared/widgets/director/inspector.dart` | 5 |
| `lib/shared/widgets/director/inspector/camera.dart` | 14 |
| `lib/shared/widgets/director/inspector/controls.dart` | 30 |
| `lib/shared/widgets/director/inspector/cuts.dart` | 15 |
| `lib/shared/widgets/director/inspector/direction.dart` | 9 |
| `lib/shared/widgets/director/inspector/object.dart` | 13 |
| `lib/shared/widgets/director/inspector/pose.dart` | 28 |
| `lib/shared/widgets/director/inspector/property.dart` | 8 |
| `lib/shared/widgets/director/inspector/stage.dart` | 7 |
| `lib/shared/widgets/director/orientation.dart` | 4 |
| `lib/shared/widgets/director/overlay.dart` | 3 |
| `lib/shared/widgets/director/panels/actors.dart` | 18 |
| `lib/shared/widgets/director/panels/cameras.dart` | 3 |
| `lib/shared/widgets/director/panels/common.dart` | 50 |
| `lib/shared/widgets/director/panels/moves.dart` | 21 |
| `lib/shared/widgets/director/panels/objects.dart` | 11 |
| `lib/shared/widgets/director/panels/props.dart` | 2 |
| `lib/shared/widgets/director/paths/geometry.dart` | 7 |
| `lib/shared/widgets/director/paths/panel.dart` | 43 |
| `lib/shared/widgets/director/paths/viewport.dart` | 1 |
| `lib/shared/widgets/director/pointer_gesture.dart` | 4 |
| `lib/shared/widgets/director/session_host.dart` | 5 |
| `lib/shared/widgets/director/sidebar.dart` | 23 |
| `lib/shared/widgets/director/stage.dart` | 53 |
| `lib/shared/widgets/director/timeline.dart` | 45 |
| `lib/shared/widgets/director/timeline_bar.dart` | 35 |
| `lib/shared/widgets/director/track_editor.dart` | 23 |
| `lib/shared/widgets/director/viewport.dart` | 10 |
| `lib/shared/widgets/director/workspace.dart` | 9 |
| `lib/shared/widgets/editor_line_numbers.dart` | 1 |
| `lib/shared/widgets/entity_card.dart` | 19 |
| `lib/shared/widgets/entity_search_selector.dart` | 22 |
| `lib/shared/widgets/file_workspace_startup_gate.dart` | 22 |
| `lib/shared/widgets/foreshadowing/position_links.dart` | 13 |
| `lib/shared/widgets/format_all_progress_dialog.dart` | 9 |
| `lib/shared/widgets/history/change_history_components.dart` | 47 |
| `lib/shared/widgets/map/image_map_canvas.dart` | 4 |
| `lib/shared/widgets/map/location_photos.dart` | 17 |
| `lib/shared/widgets/map/map_agent_draft_card.dart` | 14 |
| `lib/shared/widgets/map/map_generate_fields.dart` | 46 |
| `lib/shared/widgets/map/map_generate_footer.dart` | 6 |
| `lib/shared/widgets/map/map_history_tab.dart` | 17 |
| `lib/shared/widgets/map/map_location_children.dart` | 34 |
| `lib/shared/widgets/md/block/markdown_block_controller.dart` | 1 |
| `lib/shared/widgets/md/block/markdown_block_document.dart` | 1 |
| `lib/shared/widgets/md/block/markdown_block_list_view.dart` | 31 |
| `lib/shared/widgets/md/block/markdown_edit_patch_stack.dart` | 1 |
| `lib/shared/widgets/md/block/markdown_readonly_block.dart` | 2 |
| `lib/shared/widgets/md/markdown_span_builder.dart` | 8 |
| `lib/shared/widgets/md/reveric_markdown_editor.dart` | 56 |
| `lib/shared/widgets/media_asset_image.dart` | 1 |
| `lib/shared/widgets/metaarc_auth_dialog.dart` | 66 |
| `lib/shared/widgets/name_assistant_button.dart` | 34 |
| `lib/shared/widgets/novel/category_field.dart` | 17 |
| `lib/shared/widgets/novel/screenplay_kind_mark.dart` | 6 |
| `lib/shared/widgets/novel/start_banner.dart` | 11 |
| `lib/shared/widgets/novel_export_form.dart` | 51 |
| `lib/shared/widgets/novel_open_boundary.dart` | 1 |
| `lib/shared/widgets/plugin_view/host_ui.dart` | 8 |
| `lib/shared/widgets/plugin_view/input.dart` | 9 |
| `lib/shared/widgets/plugin_view/overlay.dart` | 15 |
| `lib/shared/widgets/plugin_view/page.dart` | 28 |
| `lib/shared/widgets/plugin_view/preview.dart` | 12 |
| `lib/shared/widgets/plugin_view/surface.dart` | 5 |
| `lib/shared/widgets/plugin_view/tree_view.dart` | 56 |
| `lib/shared/widgets/production/panorama/fullscreen.dart` | 9 |
| `lib/shared/widgets/production/panorama/viewer.dart` | 9 |
| `lib/shared/widgets/promo_badge.dart` | 7 |
| `lib/shared/widgets/quick_start_idea.dart` | 34 |
| `lib/shared/widgets/reading/reading_chapter_loading_placeholder.dart` | 1 |
| `lib/shared/widgets/reading/reading_font_family_picker.dart` | 10 |
| `lib/shared/widgets/reading/reading_settings_controls.dart` | 52 |
| `lib/shared/widgets/relation/actions.dart` | 23 |
| `lib/shared/widgets/relation/change_form.dart` | 42 |
| `lib/shared/widgets/relation/detail.dart` | 15 |
| `lib/shared/widgets/relation/evidence.dart` | 6 |
| `lib/shared/widgets/relation/history.dart` | 15 |
| `lib/shared/widgets/relation/list_region.dart` | 25 |
| `lib/shared/widgets/relation_edit_dialog.dart` | 5 |
| `lib/shared/widgets/screenplay/backspace_target.dart` | 1 |
| `lib/shared/widgets/screenplay/character_picker.dart` | 31 |
| `lib/shared/widgets/screenplay/chips.dart` | 13 |
| `lib/shared/widgets/screenplay/director_export.dart` | 29 |
| `lib/shared/widgets/screenplay/document_heading.dart` | 2 |
| `lib/shared/widgets/screenplay/document_rows.dart` | 18 |
| `lib/shared/widgets/screenplay/document_toolbar.dart` | 27 |
| `lib/shared/widgets/screenplay/editing_row.dart` | 1 |
| `lib/shared/widgets/screenplay/element_layout.dart` | 8 |
| `lib/shared/widgets/screenplay/element_options.dart` | 8 |
| `lib/shared/widgets/screenplay/emotion_badges.dart` | 7 |
| `lib/shared/widgets/screenplay/episode_count.dart` | 7 |
| `lib/shared/widgets/screenplay/inline_stat.dart` | 2 |
| `lib/shared/widgets/screenplay/loading.dart` | 5 |
| `lib/shared/widgets/screenplay/readonly_element.dart` | 1 |
| `lib/shared/widgets/screenplay/scene_events_editor.dart` | 25 |
| `lib/shared/widgets/screenplay/scene_properties.dart` | 1 |
| `lib/shared/widgets/screenplay/scene_properties_form.dart` | 51 |
| `lib/shared/widgets/screenplay/scene_stage_cells.dart` | 1 |
| `lib/shared/widgets/screenplay/season_edit_form.dart` | 6 |
| `lib/shared/widgets/screenplay/season_manager.dart` | 44 |
| `lib/shared/widgets/screenplay/text_field.dart` | 1 |
| `lib/shared/widgets/screenplay/text_styles.dart` | 4 |
| `lib/shared/widgets/screenplay/time_field.dart` | 3 |
| `lib/shared/widgets/settings/about_settings_section.dart` | 109 |
| `lib/shared/widgets/settings/ai_agents_settings_section.dart` | 43 |
| `lib/shared/widgets/settings/ai_providers_section.dart` | 59 |
| `lib/shared/widgets/settings/appearance_settings_section.dart` | 94 |
| `lib/shared/widgets/settings/backup_restore_page.dart` | 41 |
| `lib/shared/widgets/settings/backup_settings_section.dart` | 83 |
| `lib/shared/widgets/settings/codex_connection.dart` | 6 |
| `lib/shared/widgets/settings/custom_themes_section.dart` | 15 |
| `lib/shared/widgets/settings/debug_settings_section.dart` | 36 |
| `lib/shared/widgets/settings/diagnostics_upload_button.dart` | 7 |
| `lib/shared/widgets/settings/editor_settings_section.dart` | 68 |
| `lib/shared/widgets/settings/general_settings_section.dart` | 9 |
| `lib/shared/widgets/settings/mcp/notice.dart` | 9 |
| `lib/shared/widgets/settings/mcp/section.dart` | 12 |
| `lib/shared/widgets/settings/mcp/server_editor.dart` | 70 |
| `lib/shared/widgets/settings/mcp/server_row.dart` | 43 |
| `lib/shared/widgets/settings/mobile_provider_list.dart` | 32 |
| `lib/shared/widgets/settings/object_storage_form.dart` | 38 |
| `lib/shared/widgets/settings/plugins/config_form.dart` | 6 |
| `lib/shared/widgets/settings/plugins/config_panel.dart` | 2 |
| `lib/shared/widgets/settings/plugins/detail_page.dart` | 10 |
| `lib/shared/widgets/settings/plugins/enable_switch.dart` | 2 |
| `lib/shared/widgets/settings/plugins/install_button.dart` | 3 |
| `lib/shared/widgets/settings/plugins/navigation.dart` | 2 |
| `lib/shared/widgets/settings/plugins/overview.dart` | 16 |
| `lib/shared/widgets/settings/plugins/permissions.dart` | 14 |
| `lib/shared/widgets/settings/plugins/preview_page.dart` | 12 |
| `lib/shared/widgets/settings/plugins/row.dart` | 14 |
| `lib/shared/widgets/settings/plugins/section.dart` | 7 |
| `lib/shared/widgets/settings/plugins/status.dart` | 1 |
| `lib/shared/widgets/settings/plugins/subpage.dart` | 25 |
| `lib/shared/widgets/settings/plugins/tasks_panel.dart` | 26 |
| `lib/shared/widgets/settings/plugins/tools_section.dart` | 12 |
| `lib/shared/widgets/settings/provider_actions.dart` | 11 |
| `lib/shared/widgets/settings/provider_config_panel.dart` | 91 |
| `lib/shared/widgets/settings/provider_draft.dart` | 19 |
| `lib/shared/widgets/settings/provider_logo.dart` | 7 |
| `lib/shared/widgets/settings/provider_models_editor.dart` | 20 |
| `lib/shared/widgets/settings/provider_overview.dart` | 8 |
| `lib/shared/widgets/settings/provider_type_picker.dart` | 40 |
| `lib/shared/widgets/settings/provider_video_highlights.dart` | 15 |
| `lib/shared/widgets/settings/providers/metaso.dart` | 42 |
| `lib/shared/widgets/settings/proxy_settings_section.dart` | 13 |
| `lib/shared/widgets/settings/reading_settings_section.dart` | 32 |
| `lib/shared/widgets/settings/remote_bridge_settings_section.dart` | 103 |
| `lib/shared/widgets/settings/settings_section_widgets.dart` | 15 |
| `lib/shared/widgets/settings/usage_sessions_view.dart` | 117 |
| `lib/shared/widgets/settings/usage_view.dart` | 167 |
| `lib/shared/widgets/settings/webdav_backup_settings.dart` | 38 |
| `lib/shared/widgets/settings/webdav_restore_page.dart` | 16 |
| `lib/shared/widgets/story_progress_panel.dart` | 55 |
| `lib/shared/widgets/subject_photo_name.dart` | 17 |
| `lib/shared/widgets/subject_picker.dart` | 35 |
| `lib/shared/widgets/text_find_replace_scope.dart` | 30 |
| `lib/shared/widgets/unsaved_changes_dialog.dart` | 10 |
| `lib/shared/widgets/update/badge.dart` | 5 |
| `lib/shared/widgets/update/reminder.dart` | 28 |
| `lib/shared/widgets/user_profile_edit_dialog.dart` | 24 |
| `lib/third/flow/vyuh_node_flow/lib/src/connections/effects/effects.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/lib/src/editor/controller/connection_api.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/lib/vyuh_node_flow.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/behavior/auto_pan/auto_pan_speed_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/behavior/auto_pan/auto_pan_zones_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/behavior/connections/connection_creation_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/behavior/connections/cycle_detection_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/behavior/dragging/node_drag_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/behavior/selection/connection_selection_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/behavior/selection/node_selection_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/behavior/viewport/viewport_behavior_test.dart` | 2 |
| `lib/third/flow/vyuh_node_flow/test/edge_cases/boundary_conditions_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/edge_cases/concurrent_operations_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/edge_cases/invalid_operations_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/helpers/test_factories.dart` | 3 |
| `lib/third/flow/vyuh_node_flow/test/helpers/test_utils.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/integration/graph_operations_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/integration/state_consistency_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/performance/culling_test.dart` | 2 |
| `lib/third/flow/vyuh_node_flow/test/performance/large_graph_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/performance/memory_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/performance/rapid_operations_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/performance/spatial_index_performance_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/plugins/plugin_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/auto_pan/auto_pan_config_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/config/debug_mode_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/connections/connection_labels_validation_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/connections/connection_painter_test.dart` | 2 |
| `lib/third/flow/vyuh_node_flow/test/unit/connections/connection_path_cache_test.dart` | 2 |
| `lib/third/flow/vyuh_node_flow/test/unit/connections/connection_rules_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/connections/label_calculator_test.dart` | 2 |
| `lib/third/flow/vyuh_node_flow/test/unit/connections/temporary_connection_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/connections/waypoint_builder_test.dart` | 2 |
| `lib/third/flow/vyuh_node_flow/test/unit/controller/animation_handler_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/controller/connection_api_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/controller/controller_api_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/controller/controller_init_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/controller/controller_plugins_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/controller/dirty_tracking_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/controller/editor_init_api_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/controller/graph_api_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/controller/node_api_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/controller/viewport_api_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/drag/auto_pan_mixin_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/drag/drag_operations_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/editor/auto_pan_mixin_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/editor/connections_layer_test.dart` | 3 |
| `lib/third/flow/vyuh_node_flow/test/unit/editor/editor_behavior_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/editor/editor_hit_testing_test.dart` | 2 |
| `lib/third/flow/vyuh_node_flow/test/unit/editor/element_scope_test.dart` | 3 |
| `lib/third/flow/vyuh_node_flow/test/unit/editor/hit_testing_test.dart` | 2 |
| `lib/third/flow/vyuh_node_flow/test/unit/editor/interaction_layer_test.dart` | 2 |
| `lib/third/flow/vyuh_node_flow/test/unit/editor/keyboard_actions_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/editor/node_flow_actions_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/editor/node_flow_config_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/editor/widget_handlers_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/effects/connection_effects_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/effects/gradient_particle_effects_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/effects/pulse_effect_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/events/event_emission_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/events/node_flow_events_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/events/plugin_events_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/gestures/auto_pan_mixin_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/gestures/gesture_recognizer_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/gestures/hit_testing_test.dart` | 2 |
| `lib/third/flow/vyuh_node_flow/test/unit/graph/coordinates_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/graph/graph_analysis_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/graph/graph_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/lod/detail_visibility_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/lod/lod_plugin_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/lod/lod_state_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/models/connection_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/models/node_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/models/port_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/models/viewport_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/nodes/comment_node_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/nodes/group_node_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/nodes/groupable_mixin_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/nodes/interaction_state_test.dart` | 4 |
| `lib/third/flow/vyuh_node_flow/test/unit/nodes/node_container_test.dart` | 4 |
| `lib/third/flow/vyuh_node_flow/test/unit/nodes/node_data_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/nodes/node_shape_painter_test.dart` | 2 |
| `lib/third/flow/vyuh_node_flow/test/unit/nodes/node_widget_test.dart` | 4 |
| `lib/third/flow/vyuh_node_flow/test/unit/nodes/resizable_mixin_test.dart` | 2 |
| `lib/third/flow/vyuh_node_flow/test/unit/nodes/special_nodes_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/nodes/zindex_ordering_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/plugins/builtin_plugins_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/plugins/debug_overlays_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/plugins/minimap_widget_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/plugins/spatial_debug_painter_test.dart` | 2 |
| `lib/third/flow/vyuh_node_flow/test/unit/plugins/stats_plugin_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/ports/capsule_half_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/ports/port_functionality_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/ports/port_widget_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/resize/resize_api_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/selection/interaction_state_selection_test.dart` | 2 |
| `lib/third/flow/vyuh_node_flow/test/unit/selection/node_selection_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/shapes/marker_shapes_rendering_test.dart` | 8 |
| `lib/third/flow/vyuh_node_flow/test/unit/shapes/marker_shapes_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/shapes/node_shapes_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/spatial/graph_spatial_index_test.dart` | 3 |
| `lib/third/flow/vyuh_node_flow/test/unit/spatial/spatial_grid_test.dart` | 2 |
| `lib/third/flow/vyuh_node_flow/test/unit/spatial/spatial_item_test.dart` | 2 |
| `lib/third/flow/vyuh_node_flow/test/unit/styles/bezier_connection_style_test.dart` | 3 |
| `lib/third/flow/vyuh_node_flow/test/unit/styles/connection_path_styles_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/styles/connection_styles_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/styles/editable_smooth_step_style_test.dart` | 2 |
| `lib/third/flow/vyuh_node_flow/test/unit/styles/grid_painting_styles_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/styles/grid_styles_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/themes/all_themes_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/themes/minimap_theme_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/themes/node_flow_theme_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/themes/port_node_label_themes_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/unit/viewport/viewport_animation_mixin_test.dart` | 2 |
| `lib/third/flow/vyuh_node_flow/test/unit/viewport/viewport_transform_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/widget/connection_painter_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/widget/minimap_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/widget/node_flow_editor_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/widget/node_flow_viewer_test.dart` | 1 |
| `lib/third/flow/vyuh_node_flow/test/widget/node_widget_test.dart` | 1 |
| `lib/third/form/flutter_hook_form.dart` | 1 |
| `linux/CMakeLists.txt` | 2 |
| `linux/runner/my_application.cc` | 2 |
| `macos/Runner.xcodeproj/project.pbxproj` | 15 |
| `macos/Runner.xcodeproj/xcshareddata/xcschemes/Runner.xcscheme` | 5 |
| `macos/Runner/Configs/AppInfo.xcconfig` | 1 |
| `macos/Runner/MainFlutterWindow.swift` | 5 |
| `macos/RunnerTests/RunnerTests.swift` | 1 |
| `patrol_test/canvas_ai_follow_test.dart` | 23 |
| `patrol_test/chat_cross_response_merge_test.dart` | 28 |
| `patrol_test/chat_model_switch_test.dart` | 21 |
| `patrol_test/chat_stream_timeout_test.dart` | 25 |
| `patrol_test/expert_management_test.dart` | 16 |
| `patrol_test/mobile_character_editor_test.dart` | 10 |
| `patrol_test/mobile_maps_test.dart` | 13 |
| `patrol_test/mobile_reading_controls_test.dart` | 14 |
| `patrol_test/reading_continuous_restore_test.dart` | 10 |
| `patrol_test/storage_paths_desktop_test.dart` | 13 |
| `plugins/README.md` | 18 |
| `plugins/build.mjs` | 2 |
| `plugins/deepseek/plugin.json` | 1 |
| `plugins/deepseek/src/index.ts` | 1 |
| `plugins/deepseek/test/deepseek.test.ts` | 2 |
| `plugins/memory/plugin.json` | 2 |
| `plugins/memory/src/data.ts` | 1 |
| `plugins/memory/src/index.ts` | 1 |
| `plugins/memory/src/organize.ts` | 1 |
| `plugins/memory/src/views/manage.tsx` | 2 |
| `plugins/memory/test/memory.test.ts` | 1 |
| `plugins/package-lock.json` | 5 |
| `plugins/package.json` | 1 |
| `plugins/sdk/LICENSE` | 1 |
| `plugins/sdk/README.md` | 29 |
| `plugins/sdk/build_fixture.mjs` | 1 |
| `plugins/sdk/build_performance.mjs` | 1 |
| `plugins/sdk/builder.mjs` | 9 |
| `plugins/sdk/builder.test.mjs` | 9 |
| `plugins/sdk/cli.mjs` | 3 |
| `plugins/sdk/fixtures/counter.tsx` | 1 |
| `plugins/sdk/fixtures/performance.tsx` | 1 |
| `plugins/sdk/generate_ui.mjs` | 3 |
| `plugins/sdk/index.d.ts` | 4 |
| `plugins/sdk/package.json` | 5 |
| `plugins/sdk/sqlite_runtime.js` | 5 |
| `plugins/sdk/sqlite_runtime.test.mjs` | 7 |
| `plugins/sdk/tsx_transform.mjs` | 10 |
| `plugins/sdk/tsx_transform.test.mjs` | 17 |
| `plugins/sdk/ui.schema.json` | 1 |
| `plugins/web/README.md` | 1 |
| `plugins/web/performance_test.dart` | 4 |
| `plugins/web/plugin.json` | 1 |
| `plugins/web/probe_test.dart` | 7 |
| `plugins/web/src/fetch.ts` | 1 |
| `plugins/web/src/index.ts` | 1 |
| `plugins/web/src/page.ts` | 1 |
| `plugins/web/src/search.ts` | 1 |
| `plugins/web/test/web.test.ts` | 10 |
| `pubspec.yaml` | 18 |
| `reveric.code-workspace` | 0 |
| `scripts/generate_rounded_icon.py` | 2 |
| `scripts/generate_windows_icon.py` | 2 |
| `scripts/tests/test_macos_architectures.py` | 2 |
| `scripts/tests/test_windows_runtime.py` | 1 |
| `server/cf/workers/diagnostics/README.md` | 3 |
| `server/cf/workers/diagnostics/package-lock.json` | 2 |
| `server/cf/workers/diagnostics/package.json` | 1 |
| `server/cf/workers/diagnostics/wrangler.jsonc` | 3 |
| `server/metaarc/README.md` | 1 |
| `server/metaarc/public/index.html` | 1 |
| `server/metaarc/test/auth_routes.test.ts` | 1 |
| `server/metaarc/test/updates.test.ts` | 1 |
| `site/README.md` | 6 |
| `site/build.mjs` | 2 |
| `site/static/robots.txt` | 1 |
| `site/static/sitemap.xml` | 1 |
| `test/agent/agent_loop_detection_test.dart` | 6 |
| `test/agent/agent_test.dart` | 16 |
| `test/agent/client/anthropic_client_test.dart` | 8 |
| `test/agent/client/codex_client_test.dart` | 11 |
| `test/agent/client/gemini_client_test.dart` | 3 |
| `test/agent/client/openai_client_test.dart` | 7 |
| `test/agent/client/openai_responses_client_test.dart` | 6 |
| `test/agent/client/openrouter_client_test.dart` | 7 |
| `test/agent/client/partial_json_test.dart` | 1 |
| `test/agent/client/provider_history_preflight_test.dart` | 2 |
| `test/agent/client/retry_decorator_test.dart` | 4 |
| `test/agent/client/sanitize_test.dart` | 1 |
| `test/agent/fake_agent_test.dart` | 5 |
| `test/agent/loop_detector_test.dart` | 2 |
| `test/agent/message_test.dart` | 1 |
| `test/agent/round_assembler_test.dart` | 3 |
| `test/agent/surrogate_carry_test.dart` | 1 |
| `test/desktop/director/actor_catalog_test.dart` | 6 |
| `test/desktop/director/camera_editing_test.dart` | 12 |
| `test/desktop/director/controls_test.dart` | 6 |
| `test/desktop/director/harness.dart` | 4 |
| `test/desktop/director/layout_test.dart` | 18 |
| `test/desktop/director/path_editing_test.dart` | 5 |
| `test/desktop/director/pose_editing_test.dart` | 5 |
| `test/desktop/director/timeline_test.dart` | 4 |
| `test/desktop/director/workspace_test.dart` | 11 |
| `test/desktop/features/agent_skills/agent_skill_reference_file_tree_test.dart` | 8 |
| `test/desktop/features/agent_skills/install_conflict_dialog_test.dart` | 10 |
| `test/desktop/features/agent_skills/installed_skill_detail_panel_test.dart` | 8 |
| `test/desktop/features/agent_skills/marketplace_catalog_tab_test.dart` | 1 |
| `test/desktop/features/agent_skills/official_catalog_tab_test.dart` | 14 |
| `test/desktop/features/agent_skills/setup_edit_panel_test.dart` | 15 |
| `test/desktop/features/agent_skills/setup_panel_test.dart` | 14 |
| `test/desktop/features/agent_skills/skill_revision_history_dialog_golden_test.dart` | 12 |
| `test/desktop/features/asset/playback_controls_test.dart` | 1 |
| `test/desktop/features/canvas/canvas_action_toolbar_test.dart` | 18 |
| `test/desktop/features/canvas/canvas_ai_director_test.dart` | 12 |
| `test/desktop/features/canvas/canvas_auto_layout_golden_test.dart` | 14 |
| `test/desktop/features/canvas/canvas_board_signature_test.dart` | 3 |
| `test/desktop/features/canvas/canvas_camera_policy_test.dart` | 1 |
| `test/desktop/features/canvas/canvas_connection_golden_test.dart` | 17 |
| `test/desktop/features/canvas/canvas_detail_layer_test.dart` | 13 |
| `test/desktop/features/canvas/canvas_edge_flow_highlight_test.dart` | 8 |
| `test/desktop/features/canvas/canvas_flow_adapter_test.dart` | 9 |
| `test/desktop/features/canvas/canvas_mixed_direction_golden_test.dart` | 17 |
| `test/desktop/features/canvas/canvas_node_golden_test.dart` | 10 |
| `test/desktop/features/canvas/canvas_palette_test.dart` | 11 |
| `test/desktop/features/canvas/canvas_scene_reference_test.dart` | 17 |
| `test/desktop/features/canvas/edit_session_test.dart` | 13 |
| `test/desktop/features/canvas/export_preview_test.dart` | 17 |
| `test/desktop/features/canvas/export_test.dart` | 14 |
| `test/desktop/features/canvas/layout_menu_test.dart` | 10 |
| `test/desktop/features/council/council_initialization_failure_test.dart` | 14 |
| `test/desktop/features/council/council_replay_controller_test.dart` | 2 |
| `test/desktop/features/council/council_topic_cap_test.dart` | 13 |
| `test/desktop/features/cover_studio/canvas_test.dart` | 11 |
| `test/desktop/features/cover_studio/cover_fit_zoom_test.dart` | 1 |
| `test/desktop/features/cover_studio/designer_test.dart` | 22 |
| `test/desktop/features/cover_studio/records_back_test.dart` | 14 |
| `test/desktop/features/cover_studio/studio_page_test.dart` | 13 |
| `test/desktop/features/editing/export_dialog_test.dart` | 24 |
| `test/desktop/features/editing/import_test.dart` | 17 |
| `test/desktop/features/editing/inspector_test.dart` | 18 |
| `test/desktop/features/editing/region_test.dart` | 21 |
| `test/desktop/features/editing/shell_test.dart` | 8 |
| `test/desktop/features/map/location_name_validation_test.dart` | 11 |
| `test/desktop/features/map/map_agent_contract_test.dart` | 4 |
| `test/desktop/features/map/map_cartographer_panel_test.dart` | 15 |
| `test/desktop/features/map/map_studio_page_test.dart` | 12 |
| `test/desktop/features/map/map_studio_submap_test.dart` | 9 |
| `test/desktop/features/narration/dialog_test.dart` | 14 |
| `test/desktop/features/narration/player_test.dart` | 4 |
| `test/desktop/features/narration/voice_test.dart` | 3 |
| `test/desktop/features/production/board_test.dart` | 27 |
| `test/desktop/features/production/builtin_voices_test.dart` | 9 |
| `test/desktop/features/production/camera_picker_test.dart` | 3 |
| `test/desktop/features/production/connection_flow_test.dart` | 5 |
| `test/desktop/features/production/connection_style_test.dart` | 2 |
| `test/desktop/features/production/depth_dialog_test.dart` | 19 |
| `test/desktop/features/production/derived_placement_test.dart` | 3 |
| `test/desktop/features/production/error_test.dart` | 12 |
| `test/desktop/features/production/grid_entry_test.dart` | 20 |
| `test/desktop/features/production/grid_split_test.dart` | 4 |
| `test/desktop/features/production/group_board_test.dart` | 23 |
| `test/desktop/features/production/image_method_test.dart` | 7 |
| `test/desktop/features/production/inline_media_test.dart` | 11 |
| `test/desktop/features/production/interaction_test.dart` | 2 |
| `test/desktop/features/production/loading_test.dart` | 10 |
| `test/desktop/features/production/node_card_test.dart` | 20 |
| `test/desktop/features/production/panorama_gesture_test.dart` | 1 |
| `test/desktop/features/production/provider_refresh_test.dart` | 3 |
| `test/desktop/features/production/sample_choice_test.dart` | 2 |
| `test/desktop/features/production/scene_positions_test.dart` | 3 |
| `test/desktop/features/production/scene_recognition_test.dart` | 10 |
| `test/desktop/features/production/selection_layer_test.dart` | 6 |
| `test/desktop/features/production/speech_options_test.dart` | 4 |
| `test/desktop/features/production/style_editor_test.dart` | 7 |
| `test/desktop/features/production/style_picker_test.dart` | 29 |
| `test/desktop/features/production/task_status_test.dart` | 14 |
| `test/desktop/features/production/tidy_layout_test.dart` | 2 |
| `test/desktop/features/production/view_panel_test.dart` | 4 |
| `test/desktop/features/reading/reading_page_test.dart` | 11 |
| `test/desktop/features/roleplay/message_list_test.dart` | 6 |
| `test/desktop/features/screenplay/character_picker_test.dart` | 10 |
| `test/desktop/features/screenplay/context_panel_test.dart` | 14 |
| `test/desktop/features/screenplay/document_scale_test.dart` | 17 |
| `test/desktop/features/screenplay/overview_test.dart` | 16 |
| `test/desktop/features/screenplay/script_region_test.dart` | 21 |
| `test/desktop/features/screenplay/script_scroll_desync_test.dart` | 16 |
| `test/desktop/features/screenplay/script_scroll_sync_test.dart` | 16 |
| `test/desktop/features/storyboard/form_test.dart` | 17 |
| `test/desktop/features/storyboard/region_test.dart` | 20 |
| `test/desktop/pages/novel_editor_chapter_content_sync_test.dart` | 1 |
| `test/desktop/pages/novel_editor_map_studio_chrome_test.dart` | 3 |
| `test/desktop/pages/novel_editor_outline_save_test.dart` | 32 |
| `test/desktop/pages/novel_editor_screenplay_selection_test.dart` | 30 |
| `test/desktop/widgets/activation_failure_app_test.dart` | 2 |
| `test/desktop/widgets/agent_management/agent_model_settings_page_test.dart` | 12 |
| `test/desktop/widgets/agent_management/agent_rule_copy_dialog_golden_test.dart` | 13 |
| `test/desktop/widgets/agent_management/agent_rule_copy_dialog_test.dart` | 11 |
| `test/desktop/widgets/agent_management/agent_rule_create_after_guard_test.dart` | 13 |
| `test/desktop/widgets/agent_management/agent_rule_edit_panel_back_test.dart` | 7 |
| `test/desktop/widgets/agent_management/agent_rule_edit_panel_dirty_test.dart` | 7 |
| `test/desktop/widgets/agent_management/agent_rule_edit_panel_focus_test.dart` | 7 |
| `test/desktop/widgets/agent_management/agent_rule_edit_panel_layout_test.dart` | 10 |
| `test/desktop/widgets/agent_management/agent_rule_edit_panel_save_test.dart` | 8 |
| `test/desktop/widgets/agent_management/agent_rule_guard_repro_test.dart` | 7 |
| `test/desktop/widgets/agent_management/agent_rules_grid_page_delete_test.dart` | 10 |
| `test/desktop/widgets/agent_management/ai_shortcut_action_edit_panel_dirty_test.dart` | 7 |
| `test/desktop/widgets/agent_management/expert_team_page_test.dart` | 11 |
| `test/desktop/widgets/agent_management/subagent_edit_panel_dirty_test.dart` | 11 |
| `test/desktop/widgets/agent_management/subagent_prompt_edit_panel_test.dart` | 13 |
| `test/desktop/widgets/ai/chat/composer_test.dart` | 1 |
| `test/desktop/widgets/ai/chat/handoff_activation_test.dart` | 4 |
| `test/desktop/widgets/ai/chat/session_binding_test.dart` | 1 |
| `test/desktop/widgets/ai/chat/session_queued_message_store_test.dart` | 1 |
| `test/desktop/widgets/ai/chat/session_switcher_test.dart` | 9 |
| `test/desktop/widgets/ai/model/model_selector_test.dart` | 14 |
| `test/desktop/widgets/ai/tools/ask_user_card_test.dart` | 8 |
| `test/desktop/widgets/ai/tools/create_tool_card_body_test.dart` | 5 |
| `test/desktop/widgets/ai/tools/plugin_tool_card_body_test.dart` | 14 |
| `test/desktop/widgets/ai/tools/run_command_parser_test.dart` | 2 |
| `test/desktop/widgets/ai/tools/run_map_tool_card_test.dart` | 8 |
| `test/desktop/widgets/ai/tools/run_production_tool_card_test.dart` | 12 |
| `test/desktop/widgets/ai/tools/tool_activity_group_test.dart` | 10 |
| `test/desktop/widgets/ai/tools/tool_call_card_resource_label_test.dart` | 14 |
| `test/desktop/widgets/ai/tools/tool_incomplete_error_test.dart` | 10 |
| `test/desktop/widgets/ai/tools/write_tool_card_body_test.dart` | 8 |
| `test/desktop/widgets/desktop_save_shortcut_test.dart` | 1 |
| `test/desktop/widgets/desktop_window_frame_test.dart` | 6 |
| `test/desktop/widgets/entity_graph_panel_toolbar_test.dart` | 2 |
| `test/desktop/widgets/home/all_works_header_test.dart` | 10 |
| `test/desktop/widgets/home/library_home_panel_scope_test.dart` | 15 |
| `test/desktop/widgets/novel_editor/collapsed_ai_panel_test.dart` | 7 |
| `test/desktop/widgets/novel_form_dialog_ime_test.dart` | 16 |
| `test/desktop/widgets/novel_form_quick_start_test.dart` | 13 |
| `test/desktop/widgets/page_header_layout_test.dart` | 13 |
| `test/desktop/widgets/settings/settings_storage_section_test.dart` | 22 |
| `test/desktop/widgets/sidebar/chapter_tree_order_test.dart` | 11 |
| `test/desktop/widgets/sidebar/character_groups_golden_test.dart` | 13 |
| `test/desktop/widgets/sidebar/character_groups_test.dart` | 3 |
| `test/desktop/widgets/sidebar/compendium_panel_golden_test.dart` | 14 |
| `test/desktop/widgets/sidebar/material_edit_dialog_test.dart` | 13 |
| `test/desktop/widgets/sidebar/rail_groups_test.dart` | 3 |
| `test/desktop/widgets/sidebar/sidebar_collapse_button_test.dart` | 13 |
| `test/desktop/widgets/sidebar/sidebar_virtualized_list_test.dart` | 11 |
| `test/desktop/widgets/workspace/chapter_comment_test.dart` | 16 |
| `test/desktop/widgets/workspace/chapter_editor_test.dart` | 13 |
| `test/desktop/widgets/workspace/chapter_list_dropdown_test.dart` | 8 |
| `test/desktop/widgets/workspace/chapter_outline_window_test.dart` | 2 |
| `test/desktop/widgets/workspace/character_profile_editor_region_test.dart` | 20 |
| `test/desktop/widgets/workspace/character_profile_editor_test.dart` | 10 |
| `test/desktop/widgets/workspace/character_profile_hero_golden_test.dart` | 9 |
| `test/desktop/widgets/workspace/continue_writing_hero_test.dart` | 9 |
| `test/desktop/widgets/workspace/editor_focus_lines_layer_test.dart` | 1 |
| `test/desktop/widgets/workspace/novel_workspace_save_button_test.dart` | 6 |
| `test/desktop/widgets/workspace/novel_workspace_status_bar_test.dart` | 8 |
| `test/desktop/widgets/workspace/outline_global_view_golden_test.dart` | 7 |
| `test/desktop/widgets/workspace/outline_global_view_test.dart` | 7 |
| `test/desktop/widgets/workspace/story_progress_edit_golden_test.dart` | 9 |
| `test/desktop/widgets/workspace/story_progress_test.dart` | 21 |
| `test/desktop/widgets/workspace/workspace_compact_layout_test.dart` | 12 |
| `test/desktop/widgets/workspace/workspace_entry_editor_test.dart` | 11 |
| `test/fixtures/director/animated.dart` | 2 |
| `test/fixtures/director/motion.director.json` | 1 |
| `test/fixtures/director/scene.director.json` | 1 |
| `test/helpers/backup_fixture.dart` | 2 |
| `test/helpers/button_golden_theme.dart` | 1 |
| `test/helpers/markdown_editor_test_helper.dart` | 6 |
| `test/helpers/media_provider_types.dart` | 3 |
| `test/helpers/novel_fixture.dart` | 3 |
| `test/helpers/outline_fixture.dart` | 2 |
| `test/helpers/plugin_host.dart` | 2 |
| `test/helpers/spawn_agent_runtime_fixture.dart` | 12 |
| `test/helpers/working_change_test_helper.dart` | 2 |
| `test/mobile/features/agent_skills/install_conflict_dialog_test.dart` | 7 |
| `test/mobile/features/agent_skills/marketplace_tab_test.dart` | 1 |
| `test/mobile/features/agent_skills/official_tab_test.dart` | 14 |
| `test/mobile/features/agent_skills/skill_revision_history_page_golden_test.dart` | 11 |
| `test/mobile/features/cover_studio/studio_page_test.dart` | 13 |
| `test/mobile/features/map/draft_navigation_test.dart` | 1 |
| `test/mobile/features/map/studio_page_test.dart` | 15 |
| `test/mobile/features/reading/reading_page_test.dart` | 8 |
| `test/mobile/features/screenplay/document_editor_test.dart` | 20 |
| `test/mobile/features/screenplay/editor_page_test.dart` | 26 |
| `test/mobile/features/screenplay/episode_card_test.dart` | 9 |
| `test/mobile/features/screenplay/overview_test.dart` | 16 |
| `test/mobile/features/screenplay/season_manager_test.dart` | 18 |
| `test/mobile/pages/account_page_test.dart` | 7 |
| `test/mobile/pages/agent_model_settings_page_test.dart` | 13 |
| `test/mobile/pages/chapter_editor_page_test.dart` | 17 |
| `test/mobile/pages/character_editor_page_test.dart` | 14 |
| `test/mobile/pages/entry_editor_page_test.dart` | 17 |
| `test/mobile/pages/library_content_kind_test.dart` | 19 |
| `test/mobile/pages/library_page_layout_test.dart` | 17 |
| `test/mobile/pages/location_editor_page_test.dart` | 14 |
| `test/mobile/pages/novel_agent_rule_manage_page_test.dart` | 11 |
| `test/mobile/pages/novel_agent_skill_manage_page_test.dart` | 12 |
| `test/mobile/pages/novel_chat_work_loading_test.dart` | 14 |
| `test/mobile/pages/novel_create_quick_start_test.dart` | 11 |
| `test/mobile/pages/novel_editor_page_import_test.dart` | 1 |
| `test/mobile/pages/novel_form_scroll_test.dart` | 13 |
| `test/mobile/pages/onboarding_page_test.dart` | 10 |
| `test/mobile/pages/outline_editor_page_test.dart` | 20 |
| `test/mobile/providers/ai_mode_session_memory_provider_test.dart` | 3 |
| `test/mobile/services/android_saf_directory_import_test.dart` | 3 |
| `test/mobile/services/document_import_orchestrator_test.dart` | 6 |
| `test/mobile/widgets/agent_edit_scaffold_test.dart` | 7 |
| `test/mobile/widgets/character_image_actions_test.dart` | 22 |
| `test/mobile/widgets/chat_composer_test.dart` | 9 |
| `test/mobile/widgets/compendium_panel_test.dart` | 9 |
| `test/mobile/widgets/cover_picker_test.dart` | 15 |
| `test/mobile/widgets/document_folder_browser_test.dart` | 10 |
| `test/mobile/widgets/editor_focus_lines_test.dart` | 2 |
| `test/mobile/widgets/foreshadowings_panel_test.dart` | 9 |
| `test/mobile/widgets/mobile_ai_session_app_bar_test.dart` | 11 |
| `test/mobile/widgets/sheet_test.dart` | 14 |
| `test/shared/agent/agent_context_manager_test.dart` | 5 |
| `test/shared/agent/agent_conversation_carry_over_test.dart` | 3 |
| `test/shared/agent/agent_image_input_test.dart` | 2 |
| `test/shared/agent/agent_max_tokens_test.dart` | 3 |
| `test/shared/agent/agent_orchestrator_test.dart` | 4 |
| `test/shared/agent/agent_request_dispatcher_test.dart` | 4 |
| `test/shared/agent/client/anthropic_cache_control_test.dart` | 2 |
| `test/shared/agent/client/trace_headers_http_client_test.dart` | 1 |
| `test/shared/agent/hooks/todo_continuation_hook_test.dart` | 8 |
| `test/shared/agent/trace_hook_test.dart` | 16 |
| `test/shared/components/dialog_feedback_test.dart` | 12 |
| `test/shared/components/horizontal_wheel_scroll_test.dart` | 1 |
| `test/shared/components/presentation_components_golden_test.dart` | 33 |
| `test/shared/components/presentation_components_test.dart` | 35 |
| `test/shared/components/resizable_pane_divider_test.dart` | 6 |
| `test/shared/components/reveric_button_golden_test.dart` | 43 |
| `test/shared/components/reveric_button_test.dart` | 35 |
| `test/shared/components/reveric_checkbox_test.dart` | 14 |
| `test/shared/components/reveric_search_field_test.dart` | 13 |
| `test/shared/components/reveric_slidable_delete_test.dart` | 9 |
| `test/shared/components/reveric_spinner_test.dart` | 4 |
| `test/shared/components/reveric_tags_editor_test.dart` | 8 |
| `test/shared/components/standard_controls_golden_test.dart` | 38 |
| `test/shared/components/standard_controls_test.dart` | 30 |
| `test/shared/components/status_animation_clock_test.dart` | 6 |
| `test/shared/conditions/condition_evaluator_test.dart` | 1 |
| `test/shared/database/ai_chat_session_dao_test.dart` | 2 |
| `test/shared/database/app_database_schema_test.dart` | 2 |
| `test/shared/database/app_database_shutdown_test.dart` | 1 |
| `test/shared/database/asset_dao_test.dart` | 2 |
| `test/shared/database/canvas_dao_test.dart` | 1 |
| `test/shared/database/chapter_dao_test.dart` | 3 |
| `test/shared/database/collection_filter_test.dart` | 4 |
| `test/shared/database/collection_query_cost_test.dart` | 3 |
| `test/shared/database/collection_test_helpers.dart` | 2 |
| `test/shared/database/daos/assistant_session_dao_compaction_test.dart` | 5 |
| `test/shared/database/entity_relation_history_converter_test.dart` | 2 |
| `test/shared/database/generation_task_dao_test.dart` | 6 |
| `test/shared/database/json_map_converter_test.dart` | 1 |
| `test/shared/database/novel_agent_skill_revision_dao_test.dart` | 4 |
| `test/shared/database/novel_collection_test.dart` | 3 |
| `test/shared/database/novel_content_database_shutdown_test.dart` | 4 |
| `test/shared/database/novel_content_database_test.dart` | 2 |
| `test/shared/database/plugin_dao_test.dart` | 1 |
| `test/shared/database/plugin_task_dao_test.dart` | 2 |
| `test/shared/database/reading_progress_dao_test.dart` | 1 |
| `test/shared/database/session_subscriptions_dao_test.dart` | 1 |
| `test/shared/database/subject_photo_test.dart` | 4 |
| `test/shared/director/actor_catalog_test.dart` | 4 |
| `test/shared/director/animation_test.dart` | 5 |
| `test/shared/director/aspect_ratio_test.dart` | 4 |
| `test/shared/director/bake_test.dart` | 4 |
| `test/shared/director/batch_commands_test.dart` | 5 |
| `test/shared/director/camera_test.dart` | 1 |
| `test/shared/director/commands_test.dart` | 5 |
| `test/shared/director/contract_test.dart` | 2 |
| `test/shared/director/control_handover_test.dart` | 4 |
| `test/shared/director/document_test.dart` | 2 |
| `test/shared/director/export_task_test.dart` | 4 |
| `test/shared/director/file_output_test.dart` | 5 |
| `test/shared/director/gizmo_test.dart` | 4 |
| `test/shared/director/history_test.dart` | 4 |
| `test/shared/director/moves_test.dart` | 5 |
| `test/shared/director/path_test.dart` | 2 |
| `test/shared/director/poses_test.dart` | 4 |
| `test/shared/director/preview_test.dart` | 7 |
| `test/shared/director/prop_catalog_test.dart` | 5 |
| `test/shared/director/rig_test.dart` | 4 |
| `test/shared/director/staging_test.dart` | 6 |
| `test/shared/director/tracks_test.dart` | 2 |
| `test/shared/entity_graph/center_select_test.dart` | 13 |
| `test/shared/entity_graph/colors_test.dart` | 4 |
| `test/shared/entity_graph/data_test.dart` | 2 |
| `test/shared/entity_graph/depth_select_test.dart` | 12 |
| `test/shared/entity_graph/entity_list_section_test.dart` | 7 |
| `test/shared/entity_graph/graph_widget_export_test.dart` | 11 |
| `test/shared/entity_graph/graph_widget_test.dart` | 10 |
| `test/shared/entity_graph/layout_test.dart` | 5 |
| `test/shared/entity_graph/png_export_test.dart` | 4 |
| `test/shared/form/field_lifecycle_test.dart` | 5 |
| `test/shared/form/hooked_text_form_field_test.dart` | 5 |
| `test/shared/heuristic/chat_next_action_test.dart` | 3 |
| `test/shared/hooks/use_production_subpage_test.dart` | 2 |
| `test/shared/localization/ai_run_failure_localization_test.dart` | 4 |
| `test/shared/localization/ark_error_localization_test.dart` | 3 |
| `test/shared/localization/commit_message_localization_test.dart` | 6 |
| `test/shared/localization/run_subcommand_localization_test.dart` | 3 |
| `test/shared/logger/flutter_error_logger_test.dart` | 1 |
| `test/shared/logger/log_manager_test.dart` | 5 |
| `test/shared/logger/startup_failure_reporter_test.dart` | 7 |
| `test/shared/models/agent_skill_reference_test.dart` | 4 |
| `test/shared/models/ai_agent_next_action_settings_test.dart` | 1 |
| `test/shared/models/ai_message_block_test.dart` | 1 |
| `test/shared/models/ai_provider_test.dart` | 7 |
| `test/shared/models/ai_session_context_test.dart` | 3 |
| `test/shared/models/ask_user_models_test.dart` | 2 |
| `test/shared/models/audio/atlascloud_client_test.dart` | 5 |
| `test/shared/models/audio/channels_test.dart` | 4 |
| `test/shared/models/audio/client_test.dart` | 6 |
| `test/shared/models/audio/minimax_client_test.dart` | 6 |
| `test/shared/models/audio/qwen_client_test.dart` | 7 |
| `test/shared/models/audio/speech_test.dart` | 7 |
| `test/shared/models/canvas_auto_layout_test.dart` | 2 |
| `test/shared/models/canvas_layout_test.dart` | 1 |
| `test/shared/models/canvas_tree_layout_test.dart` | 2 |
| `test/shared/models/catalog_skill_installation_state_test.dart` | 2 |
| `test/shared/models/collections/filter_test.dart` | 1 |
| `test/shared/models/entity_relation_history_test.dart` | 1 |
| `test/shared/models/image/catalog_test.dart` | 4 |
| `test/shared/models/map_place_recognition_test.dart` | 2 |
| `test/shared/models/map_studio_models_test.dart` | 3 |
| `test/shared/models/map_studio_nav_test.dart` | 2 |
| `test/shared/models/metaarc_account_test.dart` | 1 |
| `test/shared/models/models_catalog_test.dart` | 4 |
| `test/shared/models/narration_test.dart` | 4 |
| `test/shared/models/novel_list_x_test.dart` | 5 |
| `test/shared/models/novel_type_test.dart` | 3 |
| `test/shared/models/novel_workspace_state_test.dart` | 2 |
| `test/shared/models/novel_workspace_test.dart` | 1 |
| `test/shared/models/plugin/setting_field_test.dart` | 1 |
| `test/shared/models/plugin/text_test.dart` | 1 |
| `test/shared/models/plugin/ui_tree_test.dart` | 1 |
| `test/shared/models/production/default_style_test.dart` | 2 |
| `test/shared/models/queued_chat_message_test.dart` | 2 |
| `test/shared/models/remote_bridge_settings_data_test.dart` | 1 |
| `test/shared/models/screenplay_document_test.dart` | 5 |
| `test/shared/models/screenplay_editing_test.dart` | 2 |
| `test/shared/models/screenplay_element_render_test.dart` | 2 |
| `test/shared/models/video/capabilities_test.dart` | 3 |
| `test/shared/models/video/catalog_test.dart` | 1 |
| `test/shared/models/video/channels_test.dart` | 5 |
| `test/shared/models/webdav_backup_config_test.dart` | 3 |
| `test/shared/pages/workspace_editor_page_test.dart` | 12 |
| `test/shared/production/asset_content_test.dart` | 2 |
| `test/shared/production/audio_generation_test.dart` | 33 |
| `test/shared/production/builtin_voices_test.dart` | 7 |
| `test/shared/production/canvas_service_test.dart` | 44 |
| `test/shared/production/depth_native_test.dart` | 6 |
| `test/shared/production/depth_task_test.dart` | 13 |
| `test/shared/production/depth_test.dart` | 5 |
| `test/shared/production/director_backup_test.dart` | 5 |
| `test/shared/production/director_output_test.dart` | 11 |
| `test/shared/production/editing/agent_test.dart` | 27 |
| `test/shared/production/editing/commands_test.dart` | 5 |
| `test/shared/production/editing/lifecycle_test.dart` | 10 |
| `test/shared/production/editing/persistence_test.dart` | 11 |
| `test/shared/production/editing/source_test.dart` | 11 |
| `test/shared/production/ffmpeg_processing_native_test.dart` | 7 |
| `test/shared/production/ffmpeg_runner_test.dart` | 1 |
| `test/shared/production/ffmpeg_session_native_test.dart` | 1 |
| `test/shared/production/frames_native_test.dart` | 17 |
| `test/shared/production/grid_split_test.dart` | 11 |
| `test/shared/production/grid_stitch_test.dart` | 2 |
| `test/shared/production/group_service_test.dart` | 14 |
| `test/shared/production/image_generation_test.dart` | 32 |
| `test/shared/production/library_service_test.dart` | 7 |
| `test/shared/production/media_service_test.dart` | 3 |
| `test/shared/production/panorama_capture_test.dart` | 15 |
| `test/shared/production/panorama_test.dart` | 3 |
| `test/shared/production/style_service_test.dart` | 3 |
| `test/shared/production/view_presets_test.dart` | 3 |
| `test/shared/providers/agent_council_providers_test.dart` | 16 |
| `test/shared/providers/agent_skill_catalog_providers_test.dart` | 4 |
| `test/shared/providers/agent_skill_providers_test.dart` | 3 |
| `test/shared/providers/ai_assistant_message_tool_calls_test.dart` | 2 |
| `test/shared/providers/ai_chat_background_lifecycle_test.dart` | 9 |
| `test/shared/providers/ai_chat_family_test.dart` | 7 |
| `test/shared/providers/ai_chat_stream_coalescing_test.dart` | 1 |
| `test/shared/providers/ai_mode_background_hydration_test.dart` | 7 |
| `test/shared/providers/ai_mode_error_state_test.dart` | 22 |
| `test/shared/providers/ai_mode_run_lifecycle_test.dart` | 21 |
| `test/shared/providers/ai_service_stream_rebuild_test.dart` | 7 |
| `test/shared/providers/anonymous_reporting_consent_test.dart` | 1 |
| `test/shared/providers/app_settings_aggregate_persistence_test.dart` | 18 |
| `test/shared/providers/async_read_test.dart` | 1 |
| `test/shared/providers/auto_backup_scheduler_provider_test.dart` | 4 |
| `test/shared/providers/canvas_ai_activity_notifier_test.dart` | 2 |
| `test/shared/providers/canvas_scene_references_test.dart` | 9 |
| `test/shared/providers/chat_continue_offer_provider_test.dart` | 4 |
| `test/shared/providers/cover_studio_image_model_selection_test.dart` | 5 |
| `test/shared/providers/dictionary_providers_test.dart` | 3 |
| `test/shared/providers/editor_settings_persistence_test.dart` | 3 |
| `test/shared/providers/map_agent_providers_test.dart` | 4 |
| `test/shared/providers/map_studio_controller_test.dart` | 14 |
| `test/shared/providers/mcp_providers_test.dart` | 5 |
| `test/shared/providers/novel_agent_skill_install_flow_test.dart` | 7 |
| `test/shared/providers/novel_agent_skill_revision_flow_test.dart` | 7 |
| `test/shared/providers/novel_collection_providers_test.dart` | 5 |
| `test/shared/providers/novel_workspace_state_provider_test.dart` | 4 |
| `test/shared/providers/official_skill_sync_providers_test.dart` | 12 |
| `test/shared/providers/production_audio_test.dart` | 4 |
| `test/shared/providers/production_result_service_test.dart` | 8 |
| `test/shared/providers/remote_bridge_providers_test.dart` | 3 |
| `test/shared/providers/roleplay_family_test.dart` | 18 |
| `test/shared/providers/screenplay_workspace_state_provider_test.dart` | 7 |
| `test/shared/providers/settings_providers_test.dart` | 3 |
| `test/shared/providers/spawn_agent_run_providers_test.dart` | 10 |
| `test/shared/providers/subagent_providers_test.dart` | 5 |
| `test/shared/providers/todo_providers_test.dart` | 4 |
| `test/shared/providers/update_providers_test.dart` | 3 |
| `test/shared/services/agent_skill_catalog_service_test.dart` | 1 |
| `test/shared/services/agent_skill_import_orchestrator_test.dart` | 3 |
| `test/shared/services/agent_skill_import_parser_test.dart` | 1 |
| `test/shared/services/agent_skill_import_source_test.dart` | 1 |
| `test/shared/services/agent_skill_transfer_test.dart` | 3 |
| `test/shared/services/ai/agent_council_orchestrator_test.dart` | 6 |
| `test/shared/services/ai/agent_message_mapping_test.dart` | 6 |
| `test/shared/services/ai/agent_skills_run_command_handler_test.dart` | 9 |
| `test/shared/services/ai/ai_http_client_lease_test.dart` | 2 |
| `test/shared/services/ai/assets/certification_test.dart` | 9 |
| `test/shared/services/ai/assistant/coordinator_test.dart` | 7 |
| `test/shared/services/ai/assistant/tool_dispatcher_test.dart` | 1 |
| `test/shared/services/ai/atlascloud_image_test.dart` | 6 |
| `test/shared/services/ai/builtin_agent_tools_test.dart` | 3 |
| `test/shared/services/ai/chat_agent_tool_dispatcher_test.dart` | 8 |
| `test/shared/services/ai/chat_attachments_test.dart` | 6 |
| `test/shared/services/ai/chat_blocked_failure_code_test.dart` | 1 |
| `test/shared/services/ai/chat_context_file_test.dart` | 2 |
| `test/shared/services/ai/chat_prompt_builder_test.dart` | 11 |
| `test/shared/services/ai/chat_prompt_cover_fact_test.dart` | 6 |
| `test/shared/services/ai/chat_session_controller_handoff_test.dart` | 23 |
| `test/shared/services/ai/chat_session_controller_rollback_test.dart` | 37 |
| `test/shared/services/ai/chat_session_controller_workspace_context_test.dart` | 13 |
| `test/shared/services/ai/chat_sub_session_client_test.dart` | 4 |
| `test/shared/services/ai/chat_turn_runner_characterization_test.dart` | 30 |
| `test/shared/services/ai/chronicler_character_contract_test.dart` | 6 |
| `test/shared/services/ai/codemode/history_test.dart` | 6 |
| `test/shared/services/ai/codemode/operation_results_test.dart` | 5 |
| `test/shared/services/ai/codemode/privacy_test.dart` | 5 |
| `test/shared/services/ai/codemode/run_test.dart` | 19 |
| `test/shared/services/ai/codemode/scheduler_test.dart` | 2 |
| `test/shared/services/ai/codemode/source_test.dart` | 1 |
| `test/shared/services/ai/codex/credentials_test.dart` | 2 |
| `test/shared/services/ai/codex/image_client_test.dart` | 7 |
| `test/shared/services/ai/codex/image_live_test.dart` | 5 |
| `test/shared/services/ai/context_message_matcher_test.dart` | 4 |
| `test/shared/services/ai/context_summarizer_test.dart` | 10 |
| `test/shared/services/ai/council_moderation_test.dart` | 19 |
| `test/shared/services/ai/council_session_codec_test.dart` | 4 |
| `test/shared/services/ai/dump_tool_defs_test.dart` | 16 |
| `test/shared/services/ai/ffmpeg/command_test.dart` | 7 |
| `test/shared/services/ai/ffmpeg/frames_test.dart` | 4 |
| `test/shared/services/ai/ffmpeg/processing_test.dart` | 7 |
| `test/shared/services/ai/ffmpeg/sequence_test.dart` | 5 |
| `test/shared/services/ai/files/command_paths_test.dart` | 7 |
| `test/shared/services/ai/files/command_results_test.dart` | 8 |
| `test/shared/services/ai/files/management_test.dart` | 3 |
| `test/shared/services/ai/files/session_files_test.dart` | 7 |
| `test/shared/services/ai/handoff_service_test.dart` | 2 |
| `test/shared/services/ai/headless_session_turn_test.dart` | 24 |
| `test/shared/services/ai/image_channels_test.dart` | 11 |
| `test/shared/services/ai/image_nodes_test.dart` | 33 |
| `test/shared/services/ai/image_reference_compression_test.dart` | 1 |
| `test/shared/services/ai/image_url_response_test.dart` | 6 |
| `test/shared/services/ai/interaction_mode_error_test.dart` | 22 |
| `test/shared/services/ai/interaction_mode_prompt_context_test.dart` | 21 |
| `test/shared/services/ai/mcp/agent_scope_test.dart` | 16 |
| `test/shared/services/ai/media_output_test.dart` | 5 |
| `test/shared/services/ai/mode_output_parser_test.dart` | 1 |
| `test/shared/services/ai/mode_run_resources_test.dart` | 5 |
| `test/shared/services/ai/monologue_session_codec_test.dart` | 4 |
| `test/shared/services/ai/new_api_media_test.dart` | 15 |
| `test/shared/services/ai/new_api_test.dart` | 9 |
| `test/shared/services/ai/openrouter_media_test.dart` | 12 |
| `test/shared/services/ai/panorama_nodes_test.dart` | 27 |
| `test/shared/services/ai/pending_ask_user_test.dart` | 2 |
| `test/shared/services/ai/production_nodes_test.dart` | 25 |
| `test/shared/services/ai/prompt_registry_test.dart` | 1 |
| `test/shared/services/ai/prompt_template_test.dart` | 4 |
| `test/shared/services/ai/prompt_token_baseline_test.dart` | 12 |
| `test/shared/services/ai/prompt_tool_guidelines_test.dart` | 10 |
| `test/shared/services/ai/provider_initializer_test.dart` | 4 |
| `test/shared/services/ai/providers_run_command_handler_test.dart` | 11 |
| `test/shared/services/ai/qwen_segmenter_test.dart` | 5 |
| `test/shared/services/ai/roleplay_prompt_test.dart` | 1 |
| `test/shared/services/ai/roleplay_session_codec_test.dart` | 5 |
| `test/shared/services/ai/run_command_parser_test.dart` | 2 |
| `test/shared/services/ai/session_persistence_test.dart` | 14 |
| `test/shared/services/ai/sessions/run_command_handler_test.dart` | 6 |
| `test/shared/services/ai/sessions/transcript_test.dart` | 3 |
| `test/shared/services/ai/setup_phase_gate_test.dart` | 1 |
| `test/shared/services/ai/short_entity_id_registry_test.dart` | 2 |
| `test/shared/services/ai/spawn_agent_handler_test.dart` | 37 |
| `test/shared/services/ai/spawn_agent_message_persistence_test.dart` | 3 |
| `test/shared/services/ai/spawn_agent_resources_test.dart` | 17 |
| `test/shared/services/ai/subagents_run_command_handler_test.dart` | 3 |
| `test/shared/services/ai/suggest_next_action_context_test.dart` | 4 |
| `test/shared/services/ai/theater_director_test.dart` | 15 |
| `test/shared/services/ai/theater_session_codec_test.dart` | 4 |
| `test/shared/services/ai/tool_error_normalize_test.dart` | 1 |
| `test/shared/services/ai/tool_operations_test.dart` | 9 |
| `test/shared/services/ai/tool_search_test.dart` | 6 |
| `test/shared/services/ai/tools_ask_user_test.dart` | 9 |
| `test/shared/services/ai/tools_canvas_test.dart` | 10 |
| `test/shared/services/ai/tools_character_profile_test.dart` | 8 |
| `test/shared/services/ai/tools_create_test.dart` | 9 |
| `test/shared/services/ai/tools_cross_work_test.dart` | 11 |
| `test/shared/services/ai/tools_design_test.dart` | 6 |
| `test/shared/services/ai/tools_edit_field_path_test.dart` | 6 |
| `test/shared/services/ai/tools_enum_validation_test.dart` | 7 |
| `test/shared/services/ai/tools_glob_test.dart` | 6 |
| `test/shared/services/ai/tools_graph_test.dart` | 6 |
| `test/shared/services/ai/tools_grep_test.dart` | 6 |
| `test/shared/services/ai/tools_input_compatibility_test.dart` | 6 |
| `test/shared/services/ai/tools_item_path_test.dart` | 6 |
| `test/shared/services/ai/tools_location_photos_test.dart` | 10 |
| `test/shared/services/ai/tools_outline_test.dart` | 7 |
| `test/shared/services/ai/tools_output_schema_test.dart` | 10 |
| `test/shared/services/ai/tools_production_test.dart` | 26 |
| `test/shared/services/ai/tools_read_pagination_fidelity_test.dart` | 6 |
| `test/shared/services/ai/tools_read_query_test.dart` | 6 |
| `test/shared/services/ai/tools_relation_history_test.dart` | 6 |
| `test/shared/services/ai/tools_remove_test.dart` | 6 |
| `test/shared/services/ai/tools_replace_test.dart` | 10 |
| `test/shared/services/ai/tools_resource_links_test.dart` | 7 |
| `test/shared/services/ai/tools_run_test.dart` | 36 |
| `test/shared/services/ai/tools_schema_test.dart` | 7 |
| `test/shared/services/ai/tools_scope_test.dart` | 9 |
| `test/shared/services/ai/tools_screenplay_test.dart` | 11 |
| `test/shared/services/ai/tools_skill_test.dart` | 2 |
| `test/shared/services/ai/tools_story_state_test.dart` | 6 |
| `test/shared/services/ai/tools_styles_test.dart` | 14 |
| `test/shared/services/ai/tools_suggest_next_action_test.dart` | 7 |
| `test/shared/services/ai/tools_unique_title_test.dart` | 6 |
| `test/shared/services/ai/tools_volume_routing_test.dart` | 6 |
| `test/shared/services/ai/tools_write_avatar_test.dart` | 13 |
| `test/shared/services/ai/tools_write_novel_metadata_test.dart` | 9 |
| `test/shared/services/ai/tools_write_null_contract_test.dart` | 7 |
| `test/shared/services/ai/trace_error_classify_test.dart` | 3 |
| `test/shared/services/ai/trace_reporter_service_test.dart` | 7 |
| `test/shared/services/ai/usage_service_test.dart` | 6 |
| `test/shared/services/ai/video/ark_draft_test.dart` | 3 |
| `test/shared/services/ai/video/atlascloud_test.dart` | 6 |
| `test/shared/services/ai/video/client_test.dart` | 13 |
| `test/shared/services/ai/video/draft_test.dart` | 3 |
| `test/shared/services/ai/video/metaso_test.dart` | 6 |
| `test/shared/services/ai/video/reference_storage_service_test.dart` | 5 |
| `test/shared/services/ai/video_draft_commands_test.dart` | 27 |
| `test/shared/services/ai_image_error_classify_test.dart` | 1 |
| `test/shared/services/anonymous_file_service_test.dart` | 6 |
| `test/shared/services/anonymous_outbox_service_test.dart` | 2 |
| `test/shared/services/app_initialization_test.dart` | 2 |
| `test/shared/services/ask_user_notification_test.dart` | 5 |
| `test/shared/services/auto_backup_scheduler_test.dart` | 2 |
| `test/shared/services/backup_orchestrator_test.dart` | 9 |
| `test/shared/services/backup_service_test.dart` | 50 |
| `test/shared/services/bundled_control_skills_test.dart` | 5 |
| `test/shared/services/bundled_official_skills_test.dart` | 1 |
| `test/shared/services/canvas_export_save_test.dart` | 2 |
| `test/shared/services/canvas_export_test.dart` | 13 |
| `test/shared/services/canvas_service_test.dart` | 5 |
| `test/shared/services/chapter_content_update_test.dart` | 4 |
| `test/shared/services/chapter_format_all_test.dart` | 3 |
| `test/shared/services/chapter_save_test.dart` | 6 |
| `test/shared/services/cover_brief_service_test.dart` | 4 |
| `test/shared/services/cover_prompt_builder_test.dart` | 2 |
| `test/shared/services/cover_studio_orchestrator_test.dart` | 8 |
| `test/shared/services/crash_reporting/crash_sentinel_test.dart` | 2 |
| `test/shared/services/crash_reporting/native_crash_reporting_test.dart` | 3 |
| `test/shared/services/debug/debug_provider_test.dart` | 6 |
| `test/shared/services/debug/sqlite_schema_repair_orchestrator_test.dart` | 2 |
| `test/shared/services/demo_novel_short_id_test.dart` | 9 |
| `test/shared/services/device_id_service_test.dart` | 1 |
| `test/shared/services/diagnostics_export_orchestrator_test.dart` | 1 |
| `test/shared/services/diagnostics_upload_orchestrator_test.dart` | 2 |
| `test/shared/services/document_save_coordinator_test.dart` | 1 |
| `test/shared/services/documents_service_test.dart` | 7 |
| `test/shared/services/entity_delete_relations_test.dart` | 2 |
| `test/shared/services/entity_relations_service_test.dart` | 4 |
| `test/shared/services/file_workspace_orchestrator_test.dart` | 28 |
| `test/shared/services/image_library_service_test.dart` | 11 |
| `test/shared/services/initialization/agent_seeds_test.dart` | 2 |
| `test/shared/services/initialization/collection_seeds_test.dart` | 2 |
| `test/shared/services/initialization/demo_screenplay_test.dart` | 10 |
| `test/shared/services/initialization/provider_seeds_test.dart` | 4 |
| `test/shared/services/lifecycle_visibility_guard_test.dart` | 2 |
| `test/shared/services/locations_service_test.dart` | 2 |
| `test/shared/services/map_place_name_reader_test.dart` | 4 |
| `test/shared/services/marketplace_catalog_test.dart` | 3 |
| `test/shared/services/mcp/adapter_test.dart` | 9 |
| `test/shared/services/mcp/catalog_test.dart` | 5 |
| `test/shared/services/mcp/concurrent_test.dart` | 5 |
| `test/shared/services/mcp/config_test.dart` | 3 |
| `test/shared/services/mcp/execution_test.dart` | 6 |
| `test/shared/services/mcp/history_test.dart` | 1 |
| `test/shared/services/mcp/http_budget_test.dart` | 3 |
| `test/shared/services/mcp/oauth_callback_test.dart` | 7 |
| `test/shared/services/mcp/oauth_test.dart` | 11 |
| `test/shared/services/mcp/runtime_test.dart` | 3 |
| `test/shared/services/mcp/sdk_redirect_test.dart` | 12 |
| `test/shared/services/mcp/settings_test.dart` | 6 |
| `test/shared/services/mcp/stdio_limit_test.dart` | 5 |
| `test/shared/services/mcp/subscription_test.dart` | 3 |
| `test/shared/services/narration_orchestrator_test.dart` | 2 |
| `test/shared/services/narration_service_test.dart` | 6 |
| `test/shared/services/network_image/disk_cache_test.dart` | 4 |
| `test/shared/services/novel_actions_test.dart` | 30 |
| `test/shared/services/novel_content_character_profile_test.dart` | 2 |
| `test/shared/services/novel_content_test.dart` | 2 |
| `test/shared/services/novel_export_test.dart` | 14 |
| `test/shared/services/novel_import_test.dart` | 11 |
| `test/shared/services/novel_maintenance_coordinator_test.dart` | 1 |
| `test/shared/services/object_storage/s3_test.dart` | 2 |
| `test/shared/services/object_storage/service_test.dart` | 3 |
| `test/shared/services/official_skill_sync_test.dart` | 3 |
| `test/shared/services/outline_service_test.dart` | 4 |
| `test/shared/services/plugins/agent_dispatcher_test.dart` | 7 |
| `test/shared/services/plugins/ai_test.dart` | 10 |
| `test/shared/services/plugins/config_test.dart` | 7 |
| `test/shared/services/plugins/data_test.dart` | 11 |
| `test/shared/services/plugins/database_install_test.dart` | 10 |
| `test/shared/services/plugins/deepseek_test.dart` | 13 |
| `test/shared/services/plugins/host_test.dart` | 26 |
| `test/shared/services/plugins/http_test.dart` | 2 |
| `test/shared/services/plugins/installer_test.dart` | 5 |
| `test/shared/services/plugins/memory_test.dart` | 19 |
| `test/shared/services/plugins/package_archive_test.dart` | 2 |
| `test/shared/services/plugins/page_close_test.dart` | 8 |
| `test/shared/services/plugins/pages_test.dart` | 11 |
| `test/shared/services/plugins/prompt_queue_test.dart` | 3 |
| `test/shared/services/plugins/prompt_test.dart` | 10 |
| `test/shared/services/plugins/runtime_test.dart` | 19 |
| `test/shared/services/plugins/source_map_test.dart` | 3 |
| `test/shared/services/plugins/sqlite_host_test.dart` | 11 |
| `test/shared/services/plugins/sqlite_test.dart` | 3 |
| `test/shared/services/plugins/sqlite_worker_test.dart` | 7 |
| `test/shared/services/plugins/storage_test.dart` | 2 |
| `test/shared/services/plugins/task_host_test.dart` | 10 |
| `test/shared/services/plugins/task_runtime_test.dart` | 4 |
| `test/shared/services/plugins/tasks_test.dart` | 4 |
| `test/shared/services/proxy_client_test.dart` | 3 |
| `test/shared/services/remote/remote_bridge_service_test.dart` | 3 |
| `test/shared/services/remote/wechat_adapter_test.dart` | 2 |
| `test/shared/services/remote/wechat_api_test.dart` | 1 |
| `test/shared/services/screenplay_edit_orchestrator_test.dart` | 11 |
| `test/shared/services/screenplay_outline_save_test.dart` | 7 |
| `test/shared/services/screenplay_service_test.dart` | 7 |
| `test/shared/services/screenplay_short_ids_test.dart` | 6 |
| `test/shared/services/short_entity_id_services_test.dart` | 3 |
| `test/shared/services/single_instance_service_test.dart` | 2 |
| `test/shared/services/skill_proxy_test.dart` | 6 |
| `test/shared/services/storage_cleanup_service_test.dart` | 6 |
| `test/shared/services/system_tray_service_test.dart` | 2 |
| `test/shared/services/themes_orchestrator_test.dart` | 10 |
| `test/shared/services/tool_permissions_test.dart` | 6 |
| `test/shared/services/update/custom_api_source_test.dart` | 3 |
| `test/shared/services/update/github_releases_source_test.dart` | 1 |
| `test/shared/services/update/macos_restart_script_test.dart` | 5 |
| `test/shared/services/update/restart_exit_test.dart` | 2 |
| `test/shared/services/video_task_recovery_test.dart` | 28 |
| `test/shared/services/webdav_backup_service_test.dart` | 3 |
| `test/shared/services/webdav_transport_test.dart` | 10 |
| `test/shared/services/working_overlay_screenplay_test.dart` | 10 |
| `test/shared/services/working_overlay_test.dart` | 5 |
| `test/shared/storyboard/backup_test.dart` | 5 |
| `test/shared/storyboard/persistence_test.dart` | 1 |
| `test/shared/storyboard/production_test.dart` | 15 |
| `test/shared/storyboard/settings_state_test.dart` | 3 |
| `test/shared/theme/reveric_theme_test.dart` | 13 |
| `test/shared/utils/ai_error_test.dart` | 2 |
| `test/shared/utils/ai_nickname_test.dart` | 1 |
| `test/shared/utils/chapter_comment_anchor_test.dart` | 2 |
| `test/shared/utils/chapter_entity_recognition_test.dart` | 3 |
| `test/shared/utils/chapter_last_sentence_test.dart` | 1 |
| `test/shared/utils/chapter_text_formatter_test.dart` | 1 |
| `test/shared/utils/chapter_tree_layout_test.dart` | 3 |
| `test/shared/utils/entity_relation_types_test.dart` | 2 |
| `test/shared/utils/line_accept_test.dart` | 2 |
| `test/shared/utils/number_format_test.dart` | 1 |
| `test/shared/utils/punctuation_replace_test.dart` | 1 |
| `test/shared/utils/route_pop_test.dart` | 1 |
| `test/shared/utils/short_entity_id_allocator_test.dart` | 2 |
| `test/shared/utils/short_entity_id_test.dart` | 1 |
| `test/shared/utils/simple_diff_test.dart` | 1 |
| `test/shared/utils/storage_paths_test.dart` | 44 |
| `test/shared/utils/text_input_composing_test.dart` | 1 |
| `test/shared/utils/text_input_formatters_test.dart` | 1 |
| `test/shared/utils/text_unit_count_test.dart` | 1 |
| `test/shared/utils/utf16_safe_text_test.dart` | 1 |
| `test/shared/widgets/a2ui/components_test.dart` | 27 |
| `test/shared/widgets/a2ui/preview_test.dart` | 9 |
| `test/shared/widgets/a2ui/session_test.dart` | 5 |
| `test/shared/widgets/agent_skill/import_scripts_warning_test.dart` | 4 |
| `test/shared/widgets/agent_skill/marketplace_test_support.dart` | 11 |
| `test/shared/widgets/agent_skill/skill_revision_components_test.dart` | 12 |
| `test/shared/widgets/agent_skill_import_source_form_test.dart` | 22 |
| `test/shared/widgets/ai/ai_mode_error_notice_test.dart` | 12 |
| `test/shared/widgets/ai/attachment_input_test.dart` | 1 |
| `test/shared/widgets/ai/background_agents_test.dart` | 28 |
| `test/shared/widgets/ai/chat/auto_scroll_hook_test.dart` | 3 |
| `test/shared/widgets/ai/chat/chat_message_view_test.dart` | 10 |
| `test/shared/widgets/ai/chat/chat_send_completion_guard_test.dart` | 1 |
| `test/shared/widgets/ai/chat/collapsible_text_block_test.dart` | 6 |
| `test/shared/widgets/ai/chat/compacting_context_indicator_test.dart` | 13 |
| `test/shared/widgets/ai/chat/compaction_card_test.dart` | 6 |
| `test/shared/widgets/ai/chat/generated_image_paths_test.dart` | 16 |
| `test/shared/widgets/ai/chat/message_action_confirm_dialog_test.dart` | 6 |
| `test/shared/widgets/ai/chat/next_action_bar_test.dart` | 11 |
| `test/shared/widgets/ai/chat/next_action_states_golden_test.dart` | 23 |
| `test/shared/widgets/ai/chat/todo_panel_test.dart` | 8 |
| `test/shared/widgets/ai/chat/tool_operation_strip_test.dart` | 10 |
| `test/shared/widgets/ai/chat/typing_indicator_test.dart` | 5 |
| `test/shared/widgets/ai/chat/ui_message_grouping_test.dart` | 2 |
| `test/shared/widgets/ai/codemode_tool_test.dart` | 12 |
| `test/shared/widgets/ai/composer_controller_test.dart` | 2 |
| `test/shared/widgets/ai/council/timeline_test.dart` | 9 |
| `test/shared/widgets/ai/diff/change_field_render_test.dart` | 1 |
| `test/shared/widgets/ai/diff/change_labels_test.dart` | 17 |
| `test/shared/widgets/ai/diff/diff_view_review_test.dart` | 9 |
| `test/shared/widgets/ai/diff/diff_view_test.dart` | 6 |
| `test/shared/widgets/ai/diff/historical_rollback_test.dart` | 17 |
| `test/shared/widgets/ai/markdown_text_test.dart` | 6 |
| `test/shared/widgets/ai/spawn_agent_activity_line_test.dart` | 9 |
| `test/shared/widgets/ai/spawn_agent_row_golden_test.dart` | 10 |
| `test/shared/widgets/ai/spawn_agent_row_identity_test.dart` | 12 |
| `test/shared/widgets/ai/tool_approval_card_test.dart` | 8 |
| `test/shared/widgets/ai/tool_permission_ui_test.dart` | 14 |
| `test/shared/widgets/ai/user_respecting_auto_scroll_controller_test.dart` | 1 |
| `test/shared/widgets/ai_feedback_dialog_test.dart` | 11 |
| `test/shared/widgets/app_background_test.dart` | 5 |
| `test/shared/widgets/app_startup_gate_test.dart` | 1 |
| `test/shared/widgets/brand_loader_test.dart` | 7 |
| `test/shared/widgets/chapter/chapter_preview_switch_test.dart` | 10 |
| `test/shared/widgets/collections/library_test.dart` | 24 |
| `test/shared/widgets/confirm_dialog_golden_test.dart` | 12 |
| `test/shared/widgets/confirm_dialog_test.dart` | 7 |
| `test/shared/widgets/foreshadowing/position_links_test.dart` | 14 |
| `test/shared/widgets/frame_safe_text_editing_value_builder_test.dart` | 1 |
| `test/shared/widgets/map/image_map_canvas_test.dart` | 1 |
| `test/shared/widgets/map/location_photos_test.dart` | 16 |
| `test/shared/widgets/map/map_generate_footer_test.dart` | 8 |
| `test/shared/widgets/map/map_location_children_test.dart` | 7 |
| `test/shared/widgets/md/block/markdown_block_controller_test.dart` | 2 |
| `test/shared/widgets/md/block/markdown_block_document_test.dart` | 1 |
| `test/shared/widgets/md/block/markdown_edit_patch_stack_test.dart` | 1 |
| `test/shared/widgets/md/markdown_autoheight_touch_menu_test.dart` | 10 |
| `test/shared/widgets/md/markdown_block_editor_test.dart` | 14 |
| `test/shared/widgets/md/markdown_context_menu_golden_test.dart` | 13 |
| `test/shared/widgets/md/markdown_touch_empty_caret_menu_test.dart` | 10 |
| `test/shared/widgets/md/reveric_markdown_editor_copy_test.dart` | 14 |
| `test/shared/widgets/md/reveric_markdown_editor_span_test.dart` | 7 |
| `test/shared/widgets/md/reveric_markdown_preview_test.dart` | 9 |
| `test/shared/widgets/novel_category_field_test.dart` | 9 |
| `test/shared/widgets/novel_export_dialog_test.dart` | 15 |
| `test/shared/widgets/novel_open_boundary_test.dart` | 7 |
| `test/shared/widgets/plugin_view/components_test.dart` | 7 |
| `test/shared/widgets/plugin_view/host_ui_test.dart` | 4 |
| `test/shared/widgets/plugin_view/input_test.dart` | 7 |
| `test/shared/widgets/plugin_view/native_test.dart` | 4 |
| `test/shared/widgets/plugin_view/page_test.dart` | 13 |
| `test/shared/widgets/production/panorama_viewer_test.dart` | 6 |
| `test/shared/widgets/quick_start_idea_test.dart` | 6 |
| `test/shared/widgets/reading/reading_chapter_loading_placeholder_test.dart` | 10 |
| `test/shared/widgets/reading/reading_continuous_chapter_stream_test.dart` | 10 |
| `test/shared/widgets/reading/reading_settings_controls_test.dart` | 13 |
| `test/shared/widgets/relation/change_form_test.dart` | 13 |
| `test/shared/widgets/relation/detail_test.dart` | 10 |
| `test/shared/widgets/relation/harness.dart` | 7 |
| `test/shared/widgets/relation/history_test.dart` | 3 |
| `test/shared/widgets/screenplay/character_picker_test.dart` | 9 |
| `test/shared/widgets/screenplay/document_feedback_test.dart` | 10 |
| `test/shared/widgets/screenplay/document_heading_test.dart` | 22 |
| `test/shared/widgets/screenplay/document_session_test.dart` | 10 |
| `test/shared/widgets/screenplay/editing_controller_test.dart` | 3 |
| `test/shared/widgets/screenplay/outline_sync_test.dart` | 24 |
| `test/shared/widgets/screenplay/scene_properties_test.dart` | 15 |
| `test/shared/widgets/screenplay/shortcuts_test.dart` | 10 |
| `test/shared/widgets/screenplay/time_field_test.dart` | 7 |
| `test/shared/widgets/settings/appearance_settings_section_test.dart` | 6 |
| `test/shared/widgets/settings/backup_restore_page_test.dart` | 9 |
| `test/shared/widgets/settings/backup_settings_section_test.dart` | 23 |
| `test/shared/widgets/settings/codex_connection_test.dart` | 8 |
| `test/shared/widgets/settings/custom_themes_section_test.dart` | 11 |
| `test/shared/widgets/settings/mcp/editor_test.dart` | 29 |
| `test/shared/widgets/settings/object_storage_form_test.dart` | 10 |
| `test/shared/widgets/settings/plugins/config_form_test.dart` | 30 |
| `test/shared/widgets/settings/plugins/config_panel_test.dart` | 13 |
| `test/shared/widgets/settings/plugins/tasks_panel_test.dart` | 9 |
| `test/shared/widgets/settings/plugins_section_test.dart` | 18 |
| `test/shared/widgets/settings/provider_actions_test.dart` | 16 |
| `test/shared/widgets/settings/provider_audio_models_test.dart` | 9 |
| `test/shared/widgets/settings/provider_config_panel_test.dart` | 7 |
| `test/shared/widgets/settings/provider_layout_test.dart` | 24 |
| `test/shared/widgets/settings/provider_proxy_section_test.dart` | 11 |
| `test/shared/widgets/settings/provider_video_models_test.dart` | 12 |
| `test/shared/widgets/settings/proxy_settings_section_test.dart` | 10 |
| `test/shared/widgets/settings/webdav_restore_page_test.dart` | 14 |
| `test/shared/widgets/stable_selection_area_test.dart` | 1 |
| `test/shared/widgets/subject_photo_name_test.dart` | 7 |
| `test/shared/widgets/text_find_replace_scope_test.dart` | 6 |
| `test/shared/widgets/update/about_settings_test.dart` | 12 |
| `test/shared/widgets/update/reminder_test.dart` | 9 |
| `test/third/flow/connection_animation_driver_test.dart` | 1 |
| `test/third/flow/connection_deletion_test.dart` | 1 |
| `test/third/flow/nodes_layer_test.dart` | 4 |
| `test/third/form/hooked_form_field_test.dart` | 1 |
| `test/widget_test.dart` | 5 |
| `third/ai_clients_dart/packages/anthropic_sdk_dart/lib/anthropic_sdk_dart.dart` | 1 |
| `third/ai_clients_dart/packages/anthropic_sdk_dart/lib/src/client/anthropic_client.dart` | 1 |
| `third/ai_clients_dart/packages/anthropic_sdk_dart/lib/src/resources/messages_resource.dart` | 1 |
| `third/ai_clients_dart/packages/googleai_dart/lib/googleai_dart.dart` | 1 |
| `third/ai_clients_dart/packages/googleai_dart/lib/src/client/googleai_client.dart` | 1 |
| `third/ai_clients_dart/packages/googleai_dart/lib/src/resources/models_resource.dart` | 1 |
| `third/ai_clients_dart/packages/open_responses/lib/open_responses.dart` | 1 |
| `third/ai_clients_dart/packages/open_responses/lib/src/resources/responses_resource.dart` | 1 |
| `third/ai_clients_dart/packages/openai_dart/lib/openai_dart.dart` | 1 |
| `third/ai_clients_dart/packages/openai_dart/lib/src/client/openai_client.dart` | 1 |
| `third/ai_clients_dart/packages/openai_dart/lib/src/resources/chat_resource.dart` | 1 |
| `third/ai_clients_dart/pubspec.yaml` | 1 |
| `third/ai_clients_dart_UPSTREAM.md` | 2 |
| `third/depth-native/CMakeLists.txt` | 5 |
| `third/depth-native/README.md` | 7 |
| `third/depth-native/depth.cpp` | 1 |
| `third/depth-native/embed-macos.sh` | 1 |
| `third/depth-native/main.cpp` | 1 |
| `third/depth-native/run-native.sh` | 1 |
| `third/depth-native_UPSTREAM.md` | 1 |
| `third/fjs/REVERIC_PATCH.md` | 3 |
| `third/fjs/libfjs/Cargo.toml` | 2 |
| `third/fjs/libfjs/src/api/module.rs` | 1 |
| `third/fjs/libfjs/src/api/runtime.rs` | 1 |
| `third/fjs/libfjs/src/api/ui.rs` | 6 |
| `third/fjs/libfjs/src/tests/mod.rs` | 2 |
| `third/fjs/libfjs/src/tests/runtime_tests.rs` | 1 |
| `third/fjs/libfjs/src/ui/bindings.rs` | 19 |
| `third/fjs/libfjs/src/ui/components.js` | 2 |
| `third/fjs/libfjs/src/ui/fixtures/counter.js` | 27 |
| `third/fjs/libfjs/src/ui/reactive.rs` | 1 |
| `third/fjs/libfjs/src/ui/sdk.js` | 19 |
| `third/fjs/libfjs/src/ui/session.rs` | 12 |
| `third/fjs/libfjs/src/ui/sqlite.js` | 5 |
| `third/fjs/tool/artifact.py` | 1 |
| `third/fjs/tool/build_runtime.sh` | 3 |
| `third/fjs_UPSTREAM.md` | 1 |
| `third/irondash_engine_context/REVERIC_PATCHES.md` | 0 |
| `third/mcp_dart/LOCAL_PATCHES.md` | 3 |
| `third/window_manager/REVERIC_PATCH.md` | 1 |
| `windows/CMakeLists.txt` | 3 |
| `windows/packaging/exe/make_config.yaml` | 1 |
| `windows/runner/Runner.rc` | 2 |
| `windows/runner/crash_handler.cpp` | 6 |
| `windows/runner/flutter_window.cpp` | 4 |

Text files listed: 2075. Matching lines: 25964.

## Appendix B — binaries whose names contain reveric

Pixel review is in section 1. The design-kit stacked lockups draw the word Reveric. `assets/logo/reveric_wordmark.png` draws MetaArc.

| File |
| --- |
| `assets/logo/reveric-raw.png` |
| `assets/logo/reveric_adaptive_icon_background_432.png` |
| `assets/logo/reveric_adaptive_icon_foreground_432.png` |
| `assets/logo/reveric_app_icon_512.png` |
| `assets/logo/reveric_app_icon_ios_1024.png` |
| `assets/logo/reveric_app_icon_macos_1024.png` |
| `assets/logo/reveric_app_icon_windows.ico` |
| `assets/logo/reveric_mark_1024.png` |
| `assets/logo/reveric_mark_128.png` |
| `assets/logo/reveric_mark_256.png` |
| `assets/logo/reveric_mark_32.ico` |
| `assets/logo/reveric_mark_32.png` |
| `assets/logo/reveric_mark_512.png` |
| `assets/logo/reveric_mark_64.png` |
| `assets/logo/reveric_wordmark.png` |
| `designs/desktop/assets/logo/reveric_app_icon_512.png` |
| `designs/desktop/assets/logo/reveric_logo_stacked_cream.png` |
| `designs/desktop/assets/logo/reveric_logo_stacked_transparent.png` |
| `designs/desktop/assets/logo/reveric_mark_128.png` |
| `designs/desktop/assets/logo/reveric_mark_256.png` |

Binary files listed: 20.
