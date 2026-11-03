import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import express from 'express';

import { pool } from '../src/db.ts';
import { createApp } from '../src/index.ts';
import { createUpdatesRouter, mountDownloads } from '../src/routes/updates.ts';
import {
  defaultUpdateOptions,
  isNewerVersion,
  loadLatestUpdate,
  type UpdateServiceOptions,
} from '../src/updates/manifest.ts';

const windowsFile = 'MetaArc-0.7.0-windows-setup.exe';

function optionsFor(dir: string): UpdateServiceOptions {
  return {
    manifestPath: path.join(dir, 'updates', 'latest.json'),
    downloadsDir: path.join(dir, 'downloads'),
    publicBaseUrl: 'https://metaarc.com.cn',
    extraDownloadHosts: [],
  };
}

function writeRelease(dir: string, release: Record<string, unknown>, fileBytes?: Buffer) {
  const options = optionsFor(dir);
  fs.mkdirSync(path.dirname(options.manifestPath), { recursive: true });
  fs.mkdirSync(options.downloadsDir, { recursive: true });
  if (fileBytes) {
    const name = typeof release.file === 'string' ? release.file : windowsFile;
    fs.writeFileSync(path.join(options.downloadsDir, name), fileBytes);
  }
  fs.writeFileSync(options.manifestPath, JSON.stringify({
    channel: 'internal',
    signed: false,
    releases: [release],
  }));
  return options;
}

async function listen(app: express.Express): Promise<{ server: Server; base: string }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${address.port}` };
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

test('version compare ignores a leading v and build metadata', () => {
  assert.equal(isNewerVersion('0.7.0', '0.6.2'), true);
  assert.equal(isNewerVersion('v0.7.0', '0.7.0+9'), false);
  assert.equal(isNewerVersion('0.7.0', '0.7.1'), false);
});

test('default manifest path stays beside the server package', () => {
  const options = defaultUpdateOptions();
  assert.equal(path.basename(options.manifestPath), 'latest.json');
  assert.equal(path.basename(path.dirname(options.manifestPath)), 'updates');
  assert.equal(path.basename(options.downloadsDir), 'downloads');
  assert.equal(options.publicBaseUrl, 'https://metaarc.com.cn');
});

test('missing manifest reports no update and no download url', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaarc-update-'));
  const payload = loadLatestUpdate(optionsFor(dir), {
    platform: 'windows',
    arch: 'x64',
    current: '0.6.2',
  });
  assert.equal(payload.has_update, false);
  assert.equal(payload.status, 'unreleased');
  assert.equal(payload.message, '尚未发布');
  assert.equal(payload.download_url, undefined);
  assert.equal(payload.version, undefined);
});

test('manifest without the setup file does not invent a download', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaarc-update-'));
  const options = writeRelease(dir, {
    platform: 'windows',
    arch: 'x64',
    version: '0.7.0',
    file: windowsFile,
  });
  const payload = loadLatestUpdate(options, { platform: 'windows', arch: 'x64', current: '0.6.2' });
  assert.equal(payload.has_update, false);
  assert.equal(payload.status, 'unreleased');
  assert.equal('download_url' in payload, false);
});

test('a real setup file returns version and same-origin download url', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaarc-update-'));
  const bytes = Buffer.from('not-a-real-installer');
  const options = writeRelease(dir, {
    platform: 'windows',
    arch: 'x64',
    version: '0.7.0',
    file: windowsFile,
    release_notes: '内测，未签名。',
  }, bytes);
  const payload = loadLatestUpdate(options, {
    platform: 'windows',
    arch: 'x86_64',
    current: '0.6.2',
  });
  assert.equal(payload.has_update, true);
  assert.equal(payload.version, '0.7.0');
  assert.equal(payload.download_url, `https://metaarc.com.cn/downloads/${windowsFile}`);
  assert.equal(payload.file_size, bytes.length);
  assert.equal(payload.release_notes, '内测，未签名。');
  assert.equal(payload.signed, false);
  assert.equal(payload.channel, 'internal');
  assert.equal(payload.platform, 'windows');
  assert.equal(payload.arch, 'x64');
});

test('current or newer clients are not offered the same package', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaarc-update-'));
  const options = writeRelease(dir, {
    platform: 'windows',
    arch: 'x64',
    version: '0.7.0',
    file: windowsFile,
  }, Buffer.from('installer'));
  const same = loadLatestUpdate(options, { platform: 'windows', arch: 'x64', current: '0.7.0' });
  assert.equal(same.has_update, false);
  assert.equal(same.status, 'current');
  assert.equal(same.version, '0.7.0');
  assert.equal(same.download_url, undefined);
  const newer = loadLatestUpdate(options, { platform: 'windows', arch: 'amd64', current: '0.8.0' });
  assert.equal(newer.status, 'current');
});

test('github and path traversal manifests are not published', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaarc-update-'));
  const github = writeRelease(dir, {
    platform: 'windows',
    arch: 'x64',
    version: '9.9.9',
    download_url: 'https://github.com/looplj/reveric/releases/download/v9.9.9/MetaArc-9.9.9-windows-setup.exe',
  });
  const blocked = loadLatestUpdate(github, { platform: 'windows', arch: 'x64', current: '0.1.0' });
  assert.equal(blocked.has_update, false);
  assert.equal(JSON.stringify(blocked).includes('github.com'), false);

  const traversal = writeRelease(dir, {
    platform: 'windows',
    arch: 'x64',
    version: '9.9.9',
    file: '../package.json',
  });
  const escaped = loadLatestUpdate(traversal, { platform: 'windows', arch: 'x64', current: '0.1.0' });
  assert.equal(escaped.has_update, false);
  assert.equal(escaped.download_url, undefined);
});

test('object storage url is returned only when the host is allowed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaarc-update-'));
  const options = writeRelease(dir, {
    platform: 'windows',
    arch: 'x64',
    version: '0.7.0',
    download_url: 'https://assets.metaarc.com.cn/desktop/MetaArc-0.7.0-windows-setup.exe',
    file_size: 42,
  });
  const allowed = loadLatestUpdate(options, { platform: 'windows', arch: 'x64', current: '0.6.0' });
  assert.equal(allowed.has_update, true);
  assert.equal(allowed.download_url, 'https://assets.metaarc.com.cn/desktop/MetaArc-0.7.0-windows-setup.exe');
  assert.equal(allowed.file_size, 42);
  assert.equal(allowed.signed, false);

  const foreign = writeRelease(dir, {
    platform: 'windows',
    arch: 'x64',
    version: '0.7.0',
    download_url: 'https://downloads.example.com/MetaArc-0.7.0-windows-setup.exe',
  });
  const rejected = loadLatestUpdate(foreign, { platform: 'windows', arch: 'x64', current: '0.6.0' });
  assert.equal(rejected.has_update, false);
});

test('empty setup file and broken manifest stay unpublished', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaarc-update-'));
  const options = writeRelease(dir, {
    platform: 'windows',
    arch: 'x64',
    version: '0.7.0',
    file: windowsFile,
  }, Buffer.alloc(0));
  assert.equal(loadLatestUpdate(options, { platform: 'windows', arch: 'x64' }).has_update, false);

  fs.writeFileSync(options.manifestPath, '{');
  const broken = loadLatestUpdate(options, { platform: 'windows', arch: 'x64', current: '0.1.0' });
  assert.equal(broken.status, 'unreleased');
  assert.equal(broken.download_url, undefined);
});

test('http route serves the manifest and the setup bytes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaarc-update-'));
  const bytes = Buffer.from('setup-bytes');
  const options = writeRelease(dir, {
    platform: 'windows',
    arch: 'x64',
    version: '0.7.0',
    file: windowsFile,
  }, bytes);
  const app = express();
  mountDownloads(app, options.downloadsDir);
  app.use('/api', createUpdatesRouter(() => options));
  const { server, base } = await listen(app);
  try {
    const missing = await fetch(`${base}/api/updates/latest?platform=macos&arch=arm64&current=0.1.0`);
    assert.equal(missing.status, 200);
    const missingBody = await missing.json();
    assert.equal(missingBody.has_update, false);
    assert.equal(missingBody.status, 'unreleased');
    assert.equal(missingBody.download_url, undefined);

    const found = await fetch(`${base}/api/updates/latest?platform=windows&arch=x64&current=0.6.2`);
    assert.equal(found.status, 200);
    const body = await found.json();
    assert.equal(body.has_update, true);
    assert.equal(body.version, '0.7.0');
    assert.equal(body.download_url, `https://metaarc.com.cn/downloads/${windowsFile}`);
    assert.equal(body.signed, false);

    const file = await fetch(`${base}/downloads/${windowsFile}`);
    assert.equal(file.status, 200);
    assert.equal(Buffer.from(await file.arrayBuffer()).equals(bytes), true);

    const escape = await fetch(`${base}/downloads/../package.json`);
    assert.notEqual(escape.status, 200);
    const escapedText = await escape.text();
    assert.equal(escapedText.includes('metaarc-server'), false);
  } finally {
    await close(server);
  }
});

test('app route stays public when no manifest is configured', async () => {
  const previous = {
    manifest: process.env.UPDATE_MANIFEST_PATH,
    downloads: process.env.DOWNLOADS_DIR,
    base: process.env.UPDATE_PUBLIC_BASE_URL,
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaarc-update-app-'));
  process.env.UPDATE_MANIFEST_PATH = path.join(dir, 'missing.json');
  process.env.DOWNLOADS_DIR = path.join(dir, 'downloads');
  process.env.UPDATE_PUBLIC_BASE_URL = 'https://metaarc.com.cn';
  const { server, base } = await listen(createApp());
  try {
    const res = await fetch(`${base}/api/updates/latest?platform=windows&arch=x64&current=0.6.2`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.has_update, false);
    assert.equal(body.status, 'unreleased');
    assert.equal(body.download_url, undefined);
    assert.equal(JSON.stringify(body).includes('github.com'), false);
  } finally {
    await close(server);
    if (previous.manifest === undefined) delete process.env.UPDATE_MANIFEST_PATH;
    else process.env.UPDATE_MANIFEST_PATH = previous.manifest;
    if (previous.downloads === undefined) delete process.env.DOWNLOADS_DIR;
    else process.env.DOWNLOADS_DIR = previous.downloads;
    if (previous.base === undefined) delete process.env.UPDATE_PUBLIC_BASE_URL;
    else process.env.UPDATE_PUBLIC_BASE_URL = previous.base;
  }
});

test.after(async () => {
  await pool.end();
});
