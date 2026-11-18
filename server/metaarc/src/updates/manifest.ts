// 读取本机更新清单，只在安装包文件或允许的下载 URL 真实存在时返回更新。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export type UpdateQuery = {
  platform?: string;
  arch?: string;
  current?: string;
};

export type UpdatePayload = {
  has_update: boolean;
  status: 'unreleased' | 'current' | 'available';
  message?: string;
  version?: string;
  download_url?: string;
  file_size?: number;
  release_notes?: string;
  platform?: string;
  arch?: string;
  signed?: boolean;
  channel?: string;
};

export type UpdateServiceOptions = {
  manifestPath: string;
  downloadsDir: string;
  publicBaseUrl: string;
  extraDownloadHosts: string[];
};

type ReleaseEntry = {
  platform?: unknown;
  arch?: unknown;
  version?: unknown;
  file?: unknown;
  download_url?: unknown;
  release_notes?: unknown;
  signed?: unknown;
  file_size?: unknown;
  channel?: unknown;
};

type ParsedManifest = {
  channel?: string;
  signed: boolean;
  releases: ReleaseEntry[];
};

type ResolvedRelease = {
  version: string;
  downloadUrl: string;
  fileSize?: number;
  releaseNotes?: string;
  signed: boolean;
  channel: string;
};

const UNRELEASED_MESSAGE = '尚未发布';

export function serverPackageRoot(moduleUrl: string = import.meta.url): string {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), '../..');
}

export function defaultUpdateOptions(root: string = serverPackageRoot()): UpdateServiceOptions {
  return {
    manifestPath: path.join(root, 'updates', 'latest.json'),
    downloadsDir: path.join(root, 'downloads'),
    publicBaseUrl: 'https://metaarc.com.cn',
    extraDownloadHosts: [],
  };
}

export function updateServiceOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  root: string = serverPackageRoot(),
): UpdateServiceOptions {
  const defaults = defaultUpdateOptions(root);
  const extra = (env.UPDATE_DOWNLOAD_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0 && !isBlockedDownloadHost(host));
  const configuredBase = (env.UPDATE_PUBLIC_BASE_URL || env.APP_URL || '').trim();
  return {
    manifestPath: env.UPDATE_MANIFEST_PATH?.trim() || defaults.manifestPath,
    downloadsDir: env.DOWNLOADS_DIR?.trim() || defaults.downloadsDir,
    publicBaseUrl: configuredBase || defaults.publicBaseUrl,
    extraDownloadHosts: extra,
  };
}

export function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = versionParts(latest);
  const currentParts = versionParts(current);
  const length = Math.min(latestParts.length, currentParts.length);
  for (let index = 0; index < length; index += 1) {
    if (latestParts[index] !== currentParts[index]) {
      return latestParts[index] > currentParts[index];
    }
  }
  return latestParts.length > currentParts.length;
}

export function loadLatestUpdate(options: UpdateServiceOptions, query: UpdateQuery): UpdatePayload {
  const platform = normalizePlatform(query.platform ?? '');
  const arch = normalizeArch(query.arch ?? '');
  if (!platform || !arch) {
    return unreleased();
  }

  const manifest = readManifest(options.manifestPath);
  const parsed = parseManifest(manifest);
  if (!parsed) {
    return unreleased();
  }

  const matches: ResolvedRelease[] = [];
  for (const entry of parsed.releases) {
    const resolved = resolveRelease(entry, parsed, options, platform, arch);
    if (resolved) {
      matches.push(resolved);
    }
  }
  if (matches.length === 0) {
    return unreleased();
  }
  matches.sort((left, right) => {
    if (isNewerVersion(left.version, right.version)) return -1;
    if (isNewerVersion(right.version, left.version)) return 1;
    return 0;
  });
  const latest = matches[0];
  const current = canonicalVersion(query.current ?? '');
  if (current && !isNewerVersion(latest.version, current)) {
    return {
      has_update: false,
      status: 'current',
      version: latest.version,
    };
  }

  const payload: UpdatePayload = {
    has_update: true,
    status: 'available',
    version: latest.version,
    download_url: latest.downloadUrl,
    platform,
    arch,
    signed: latest.signed,
    channel: latest.channel,
  };
  if (latest.fileSize !== undefined) {
    payload.file_size = latest.fileSize;
  }
  if (latest.releaseNotes) {
    payload.release_notes = latest.releaseNotes;
  }
  return payload;
}

function unreleased(): UpdatePayload {
  return {
    has_update: false,
    status: 'unreleased',
    message: UNRELEASED_MESSAGE,
  };
}

function readManifest(manifestPath: string): unknown {
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseManifest(value: unknown): ParsedManifest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const releases = Array.isArray(record.releases) ? record.releases : [record];
  const entries = releases.filter((entry): entry is ReleaseEntry => {
    return Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry);
  });
  if (entries.length === 0) {
    return null;
  }
  return {
    channel: typeof record.channel === 'string' ? record.channel.trim() : undefined,
    signed: record.signed === true,
    releases: entries,
  };
}

function resolveRelease(
  entry: ReleaseEntry,
  manifest: ParsedManifest,
  options: UpdateServiceOptions,
  platform: string,
  arch: string,
): ResolvedRelease | null {
  if (normalizePlatform(stringValue(entry.platform)) !== platform) {
    return null;
  }
  if (normalizeArch(stringValue(entry.arch)) !== arch) {
    return null;
  }
  const version = canonicalVersion(stringValue(entry.version));
  if (!version) {
    return null;
  }
  const download = resolveDownload(entry, options, platform);
  if (!download) {
    return null;
  }
  const notes = stringValue(entry.release_notes);
  return {
    version,
    downloadUrl: download.url,
    fileSize: download.size,
    releaseNotes: notes || undefined,
    signed: entry.signed === true || (entry.signed === undefined && manifest.signed),
    channel: stringValue(entry.channel) || manifest.channel || 'internal',
  };
}

function resolveDownload(
  entry: ReleaseEntry,
  options: UpdateServiceOptions,
  platform: string,
): { url: string; size?: number } | null {
  const fileName = stringValue(entry.file);
  if (fileName) {
    const safeName = safePackageFileName(fileName, platform);
    if (!safeName) {
      return null;
    }
    const downloadsDir = path.resolve(options.downloadsDir);
    const absolute = path.resolve(downloadsDir, safeName);
    if (!isInsideDir(downloadsDir, absolute) || !fs.existsSync(absolute)) {
      return null;
    }
    const size = fs.statSync(absolute).size;
    if (!Number.isFinite(size) || size <= 0) {
      return null;
    }
    const url = publicDownloadUrl(options.publicBaseUrl, safeName);
    if (!url || !isAllowedDownloadUrl(url, platform, options)) {
      return null;
    }
    return { url, size };
  }

  const rawUrl = stringValue(entry.download_url);
  if (!rawUrl || !isAllowedDownloadUrl(rawUrl, platform, options)) {
    return null;
  }
  const declaredSize = entry.file_size;
  const size = typeof declaredSize === 'number' && Number.isInteger(declaredSize) && declaredSize > 0
    ? declaredSize
    : undefined;
  return { url: rawUrl, size };
}

function publicDownloadUrl(base: string, fileName: string): string | null {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const local = host === '127.0.0.1' || host === 'localhost';
  const metaArc = host === 'metaarc.com.cn' || host.endsWith('.metaarc.com.cn');
  if (url.protocol === 'https:' && !metaArc) {
    return null;
  }
  if (url.protocol === 'http:' && !local) {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }
  url.username = '';
  url.password = '';
  url.pathname = `/downloads/${fileName}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function isAllowedDownloadUrl(raw: string, platform: string, options: UpdateServiceOptions): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.username || url.password || url.hash) {
    return false;
  }
  let pathname = url.pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return false;
  }
  const lowered = pathname.toLowerCase();
  if (lowered.includes('..') || !packageExtensionMatches(lowered, platform)) {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (isBlockedDownloadHost(host)) {
    return false;
  }
  if (url.protocol === 'https:' && (host === 'metaarc.com.cn' || host.endsWith('.metaarc.com.cn'))) {
    return true;
  }
  if (url.protocol === 'http:' && (host === '127.0.0.1' || host === 'localhost')) {
    return true;
  }
  return url.protocol === 'https:' && options.extraDownloadHosts.includes(host);
}

function packageExtensionMatches(pathname: string, platform: string): boolean {
  if (platform === 'windows') {
    return pathname.endsWith('.exe') && pathname.includes('setup');
  }
  if (platform === 'android') {
    return pathname.endsWith('.apk');
  }
  if (platform === 'macos' || platform === 'linux') {
    return pathname.endsWith('.zip');
  }
  return false;
}

function safePackageFileName(name: string, platform: string): string | null {
  if (name !== path.posix.basename(name) || name !== path.win32.basename(name)) {
    return null;
  }
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    return null;
  }
  if (!/^[\w.+\-]+$/.test(name)) {
    return null;
  }
  if (!packageExtensionMatches(name.toLowerCase(), platform)) {
    return null;
  }
  return name;
}

function isInsideDir(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isBlockedDownloadHost(host: string): boolean {
  return host === 'github.com'
    || host.endsWith('.github.com')
    || host.endsWith('.githubusercontent.com')
    || host.includes('looplj');
}

function normalizePlatform(value: string): string {
  const platform = value.trim().toLowerCase();
  if (platform === 'win' || platform === 'win32') return 'windows';
  if (platform === 'darwin' || platform === 'osx' || platform === 'mac') return 'macos';
  if (platform === 'windows' || platform === 'macos' || platform === 'linux' || platform === 'android') {
    return platform;
  }
  return '';
}

function normalizeArch(value: string): string {
  const arch = value.trim().toLowerCase().replaceAll('_', '-');
  if (arch === 'x64' || arch === 'x86-64' || arch === 'amd64') return 'x64';
  if (arch === 'arm64' || arch === 'aarch64') return 'arm64';
  if (arch === 'ia32' || arch === 'x86' || arch === 'i386') return 'ia32';
  return '';
}

function canonicalVersion(value: string): string {
  return value.trim().replace(/^v/i, '').split('+')[0];
}

function versionParts(value: string): number[] {
  return canonicalVersion(value).split('.').map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
