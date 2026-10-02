import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile, listPackage } from '@electron/asar';
import { getPath7za } from 'app-builder-lib/out/toolsets/7zip.js';

const project = fileURLToPath(new URL('../..', import.meta.url));
const { version } = JSON.parse(readFileSync(path.join(project, 'package.json'), 'utf8'));
const output = path.join(project, 'artifacts/windows');
const exe = path.join(output, `简谱唱名-${version}-Windows-x64.exe`);
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
function machine(file) {
  const bytes = readFileSync(file);
  assert.equal(bytes.toString('ascii', 0, 2), 'MZ');
  const offset = bytes.readUInt32LE(0x3c);
  assert.equal(bytes.readUInt32LE(offset), 0x4550);
  return bytes.readUInt16LE(offset + 4);
}
function files(root) {
  return readdirSync(root).flatMap(name => {
    const file = path.join(root, name);
    return statSync(file).isDirectory() ? files(file) : [file];
  });
}

test('便携 EXE 可完整解包，含 x64 运行时、当前页面、隔离 preload、许可和八份钢琴采样', { timeout: 60000 }, async () => {
  assert.ok([0x14c, 0x8664].includes(machine(exe)), 'Windows PE launcher');
  assert.equal(machine(path.join(output, 'win-unpacked/简谱唱名.exe')), 0x8664, 'x64 app executable');
  assert.ok(readFileSync(`${exe}.sha256`, 'utf8').startsWith(hash(readFileSync(exe))));
  const directory = mkdtempSync(path.join(project, '.build/windows/package-check-'));
  try {
    const sevenZip = await getPath7za();
    execFileSync(sevenZip, ['x', '-y', exe, `-o${directory}`], { timeout: 60000, stdio: 'pipe' });
    for (const archive of files(directory).filter(file => file.endsWith('.7z'))) {
      execFileSync(sevenZip, ['x', '-y', archive, `-o${path.join(directory, 'payload')}`], { timeout: 60000, stdio: 'pipe' });
    }
    const contents = files(directory);
    const packaged = contents.find(file => path.basename(file) === 'app.asar');
    assert.ok(packaged, 'app.asar must be inside the single portable EXE');
    assert.equal(hash(readFileSync(packaged)), hash(readFileSync(path.join(output, 'win-unpacked/resources/app.asar'))));
    const runtime = contents.find(file => path.basename(file) === '简谱唱名.exe');
    assert.ok(runtime); assert.equal(machine(runtime), 0x8664);
    for (const filename of ['icudtl.dat', 'resources.pak', 'LICENSE.electron.txt', 'LICENSES.chromium.html']) {
      assert.ok(contents.some(file => path.basename(file) === filename), `bundled ${filename}`);
    }
    const metadata = JSON.parse(extractFile(packaged, 'package.json').toString());
    assert.equal(metadata.version, version); assert.equal(metadata.main, 'main.cjs');
    for (const name of ['main.cjs', 'protocol.cjs', 'preload.cjs', 'icon.png', 'icon.ico']) {
      assert.equal(hash(extractFile(packaged, name)), hash(readFileSync(path.join(project, 'native/windows', name))));
    }
    assert.equal(hash(extractFile(packaged, 'THIRD_PARTY_NOTICES.md')), hash(readFileSync(path.join(project, 'THIRD_PARTY_NOTICES.md'))));
    const manifest = JSON.parse(extractFile(packaged, 'web/audio/piano/manifest.json').toString());
    assert.equal(manifest.files.length, 8);
    for (const sample of manifest.files) assert.equal(hash(extractFile(packaged, `web/audio/piano/${sample.file}`)), sample.sha256);
    for (const file of files(path.join(project, 'dist'))) {
      const relative = path.relative(path.join(project, 'dist'), file).split(path.sep).join('/');
      assert.equal(hash(extractFile(packaged, `web/${relative}`)), hash(readFileSync(file)), relative);
    }
    assert.ok(!listPackage(packaged).some(file => /\.env$|\/tests\/|\/\.git\//.test(file)));
    assert.ok(!listPackage(packaged).some(file => file.startsWith('/node_modules/')), 'no unused runtime node_modules');
    assert.ok(existsSync(path.join(output, '使用说明.txt')));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
