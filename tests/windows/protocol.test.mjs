import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resourceResponse } from '../../native/windows/protocol.cjs';

test('内置来源支持页面、音频与 HEAD，不需要 HTTP 服务或外网', { timeout: 60000 }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'jianpu-protocol-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'index.html'), '<h1>简谱唱名</h1>');
  await writeFile(path.join(root, 'C4.mp3'), Buffer.from([1, 2, 3, 4]));
  const page = await resourceResponse(root, { url: 'jianpu://trainer/', method: 'GET' });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /简谱唱名/);
  assert.match(page.headers.get('Content-Security-Policy'), /connect-src 'self'/);
  const audio = await resourceResponse(root, { url: 'jianpu://trainer/C4.mp3', method: 'GET' });
  assert.equal(audio.headers.get('Content-Type'), 'audio/mpeg');
  assert.deepEqual([...new Uint8Array(await audio.arrayBuffer())], [1, 2, 3, 4]);
  const head = await resourceResponse(root, { url: 'jianpu://trainer/C4.mp3', method: 'HEAD' });
  assert.equal(head.headers.get('Content-Length'), '4');
  assert.equal(await head.text(), '');
});

test('内置资源拒绝外部来源、越界路径、写请求及未知文件', { timeout: 60000 }, async t => {
  const base = await mkdtemp(path.join(tmpdir(), 'jianpu-paths-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'web');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(root);
  await writeFile(path.join(base, 'outside.txt'), 'private');
  await symlink(path.join(base, 'outside.txt'), path.join(root, 'link.txt'));
  for (const [url, method, status] of [
    ['https://trainer/index.html', 'GET', 403], ['jianpu://other/index.html', 'GET', 403],
    ['jianpu://trainer:99/index.html', 'GET', 403], ['jianpu://user@trainer/index.html', 'GET', 403],
    ['jianpu://trainer/%2e%2e%2foutside.txt', 'GET', 403], ['jianpu://trainer/a%5coutside.txt', 'GET', 403],
    ['jianpu://trainer/file.txt%00', 'GET', 403], ['jianpu://trainer/a:stream.txt', 'GET', 403],
    ['jianpu://trainer/link.txt', 'GET', 403], ['jianpu://trainer/', 'POST', 405],
    ['jianpu://trainer/no.exe', 'GET', 404], ['jianpu://trainer/missing.mp3', 'GET', 404],
    ['jianpu://trainer/%xx', 'GET', 400],
  ]) assert.equal((await resourceResponse(root, { url, method })).status, status, `${method} ${url}`);
});
