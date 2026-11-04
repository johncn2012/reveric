#!/usr/bin/env node
// 构建官网静态产物：复制 designs/website 的页面与资源到 site/dist，并给样式和脚本加内容哈希。
// 静态下载区保持尚未发布。页面脚本只在同域更新清单返回允许的 Windows setup 时改成链接。
//
// 用法：
//   node site/build.mjs
//
// --version 会被忽略。构建不把版本号写成安装包地址。
// 无第三方依赖，Node 18+ 即可运行。

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SITE, '..');
const SRC = join(ROOT, 'designs', 'website');
const DIST = join(SITE, 'dist');

// 页面和它引用的资源；directions.html 等设计过程文件不发布
const PAGE_FILES = ['index.html', 'landing.css', 'landing.js', 'metaarc.css', 'metaarc.js', 'assets', 'fonts', 'vendor'];

// 这些字符串一旦出现，说明设计稿又把旧仓库安装包、假后台或演示配额写了回来。
const FORBIDDEN = [
  '/releases/download/',
  '/api/login',
  '/api/admin',
  '管理后台',
  '48.25M',
  '48,250,000',
];

function noteIgnoredVersion() {
  if (process.argv.includes('--version')) {
    console.log('已忽略 --version：构建不写入安装包链接');
  }
}

function cacheBust(html) {
  let out = html;
  for (const file of ['landing.css', 'landing.js']) {
    const hash = createHash('sha256').update(readFileSync(join(SRC, file))).digest('hex').slice(0, 10);
    const before = out;
    out = out.replace(`"${file}"`, `"${file}?v=${hash}"`);
    if (out === before) throw new Error(`页面里没有引用 ${file}`);
  }
  return out;
}

function assertHonest(html, script) {
  const blob = `${html}\n${script}`;
  for (const needle of FORBIDDEN) {
    if (blob.includes(needle)) throw new Error(`页面仍包含不应发布的内容：${needle}`);
  }
  if (!html.includes('尚未发布')) throw new Error('下载区缺少「尚未发布」占位');
  if (!html.includes('href="/account"')) throw new Error('顶栏缺少 /account 入口');
  if (!html.includes('https://github.com/looplj/reveric')) throw new Error('页脚缺少 Reveric 上游链接');
  if (!html.includes('AGPL-3.0')) throw new Error('页脚缺少 AGPL 署名');
  if (/github\.com\/looplj\/reveric\/releases/i.test(blob)) {
    throw new Error('页面把上游 Release 写成了下载入口');
  }
  if (!script.includes("fetch('/api/plans')")) throw new Error('套餐脚本未请求 /api/plans');
  if (!script.includes("/api/updates/latest?platform=windows&arch=x64")) {
    throw new Error('下载脚本未查询 Windows 更新清单');
  }
  const downloadLinks = html.match(/<a\b[^>]*\bdata-os=/g);
  if (downloadLinks) throw new Error('下载区静态 HTML 仍是可点击的安装包链接');
}

// 页面新增了字体子集里没有的字时提醒重新裁剪，否则这些字会回退到系统字体
function checkFontCoverage(html) {
  const covered = new Set(readFileSync(join(SRC, 'fonts', 'NotoSerifSC-subset.chars.txt'), 'utf8'));
  const text = html.replace(/<[^>]+>/g, ' ');
  const missing = [...new Set(text)].filter((c) => c.trim() && !covered.has(c));
  if (missing.length) {
    console.warn(`⚠ 字体子集缺少 ${missing.length} 个字：${missing.join('')}`);
    console.warn('  运行 site/scripts/subset_fonts.py 重新生成 designs/website/fonts/');
  }
}

noteIgnoredVersion();
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

for (const name of PAGE_FILES) {
  const from = join(SRC, name);
  if (!existsSync(from)) throw new Error(`缺少 ${from}`);
  cpSync(from, join(DIST, name), { recursive: true });
}
cpSync(join(SITE, 'static'), DIST, { recursive: true });

const html = readFileSync(join(SRC, 'index.html'), 'utf8');
const script = readFileSync(join(SRC, 'metaarc.js'), 'utf8');
checkFontCoverage(html);
const rendered = cacheBust(html);
assertHonest(rendered, script);
writeFileSync(join(DIST, 'index.html'), rendered);

const PUBLIC = join(ROOT, 'server', 'metaarc', 'public');
if (existsSync(PUBLIC)) {
  for (const name of [
    'index.html',
    'landing.css',
    'landing.js',
    'metaarc.css',
    'metaarc.js',
    'assets/icon-32.png',
    'assets/icon-180.png',
    'assets/icon-512.png',
    'assets/mark.svg',
    'assets/mark-black.svg',
    'assets/icon-dark.svg',
    'assets/icon-light.svg',
  ]) {
    cpSync(join(DIST, name), join(PUBLIC, name));
  }
  console.log('已同步首页和 L1 图标到 server/metaarc/public/。账号页不在这次复制里。');
}

console.log('site/dist 已生成。静态下载区未写入安装包链接。');
