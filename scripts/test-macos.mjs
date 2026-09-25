import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.platform !== 'darwin') throw new Error('Mac 应用检查需要在 macOS 上执行。');
const project = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(path.join(project, 'package.json'), 'utf8'));
const build = path.join(project, '.build/macos');
const output = path.join(project, 'artifacts/macos');
const bundleName = '简谱唱名.app';
const bundle = path.join(output, bundleName);
if (!existsSync(bundle)) throw new Error('请先运行 npm run package:mac。');
const run = (command, args) => execFileSync(command, args, { cwd: project, encoding: 'utf8', timeout: 60_000 });
mkdirSync(build, { recursive: true });
const binary = path.join(build, 'StaticServerTests');
run('xcrun', ['swiftc', '-module-cache-path', path.join(build, 'ModuleCache'),
  'native/macos/StaticServer.swift', 'native/macos/StaticServerTests.swift', '-o', binary]);
console.log(run(binary, process.argv.includes('--network') ? ['--network'] : []));

const temporary = mkdtempSync(path.join(build, 'archive-check-'));
try {
  run('ditto', ['-x', '-k', path.join(output, `简谱唱名-${version}-macOS-AppleSilicon.zip`), temporary]);
  const unpacked = path.join(temporary, bundleName);
  run('codesign', ['--verify', '--deep', '--strict', unpacked]);
  const contents = path.join(unpacked, 'Contents');
  const executable = path.join(contents, 'MacOS/JianpuSolfege');
  assert.match(run('file', [executable]), /Mach-O 64-bit executable arm64/);
  assert.ok(statSync(executable).mode & 0o111, 'ZIP retains executable permissions');
  const plist = JSON.parse(run('plutil', ['-convert', 'json', '-o', '-', path.join(contents, 'Info.plist')]));
  assert.equal(plist.CFBundleIdentifier, 'local.jianpu.solfege');
  assert.equal(plist.LSMinimumSystemVersion, '13.0');
  assert.equal(plist.CFBundleShortVersionString, version);
  const resources = path.join(contents, 'Resources');
  assert.ok(statSync(path.join(resources, 'AppIcon.icns')).size > 0);
  assert.ok(existsSync(path.join(resources, 'THIRD_PARTY_NOTICES.md')));
  const web = path.join(resources, 'web');
  const html = readFileSync(path.join(web, 'index.html'), 'utf8');
  for (const [, asset] of html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g)) {
    assert.ok(existsSync(path.join(web, asset)), `bundled entry resource: ${asset}`);
  }
  const samples = path.join(web, 'audio/piano');
  const manifest = JSON.parse(readFileSync(path.join(samples, 'manifest.json'), 'utf8'));
  assert.equal(manifest.files.length, 8);
  for (const sample of manifest.files) {
    const bytes = readFileSync(path.join(samples, sample.file));
    assert.equal(bytes.length, sample.bytes, sample.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sample.sha256, sample.file);
  }
  assert.ok(existsSync(path.join(samples, 'CC-BY-3.0.txt')));
  console.log('ZIP extraction, signature, arm64 executable, bundled assets and 8 piano hashes: passed');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
