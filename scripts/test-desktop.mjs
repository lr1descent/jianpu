import { _electron as electron, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const project = fileURLToPath(new URL('..', import.meta.url));
const application = path.join(project, 'artifacts/windows/win-unpacked/resources/app.asar');
const temporary = mkdtempSync(path.join(tmpdir(), 'jianpu-desktop-test-'));
const profile = path.join(temporary, 'new-user-profile');
let desktop;
let page;
const launch = async () => {
  desktop = await electron.launch({ args: [application, `--user-data-dir=${profile}`], timeout: 30000 });
  page = await desktop.firstWindow();
  page.setDefaultTimeout(10000);
  expect(await desktop.evaluate(({ app }) => app.getPath('sessionData'))).toBe(profile);
  await expect(page.getByRole('button', { name: /^相对音程/ })).toBeVisible();
};

try {
  await launch();
  await expect(page).toHaveURL('jianpu://trainer/');
  await page.getByRole('button', { name: /^相对音程/ }).click();
  await page.getByRole('button', { name: /^练习模式/ }).click();
  await page.getByRole('radio', { name: '7 题', exact: true }).check();
  await page.getByRole('button', { name: '开始练习', exact: true }).click();
  await expect(page.locator('.answer').first()).toBeEnabled();
  await page.locator('.answer').first().click();
  await expect(page.locator('[data-action="next"]')).toBeDisabled();
  await expect(page.locator('#playback-status')).toContainText('正在播放');
  await expect(page.locator('[data-action="next"]')).toBeEnabled();
  await expect(page.locator('#feedback')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('.answer').first()).toBeEnabled();
  await expect(page.locator('#question-progress')).toHaveText('第 2 / 7 题');
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  await expect(page.getByRole('dialog')).toContainText('练习已暂停');
  await desktop.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.restore(); w.focus(); });
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.locator('.answer').first()).toBeEnabled();
  // The real menu action is shared by Ctrl + on Windows and Command + on this Mac host.
  await desktop.evaluate(({ Menu }) => { for (let i = 0; i < 4; i++) Menu.getApplicationMenu().items[2].submenu.items[0].click(); });
  expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())).toBeCloseTo(2);
  await page.locator('.answer').first().click();
  await expect(page.locator('[data-action="next"]')).toBeEnabled();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-action="next"]')).toBeInViewport();
  await desktop.evaluate(({ Menu }) => Menu.getApplicationMenu().items[2].submenu.items[2].click());
  // Choose cancel without a human modal; run the wrapper's actual close handler.
  const asked = await desktop.evaluate(({ BrowserWindow, dialog }) => {
    const original = dialog.showMessageBoxSync;
    let message;
    dialog.showMessageBoxSync = (_window, options) => { message = options.message; return 0; };
    try { BrowserWindow.getAllWindows()[0].close(); } finally { dialog.showMessageBoxSync = original; }
    return message;
  });
  expect(asked).toBe('本轮还未结束');
  await expect(page.getByRole('dialog')).toContainText('练习已暂停');
  await page.getByRole('dialog').getByRole('button', { name: '结束本轮', exact: true }).click();
  await page.getByRole('button', { name: '确认结束', exact: true }).click();
  await expect(page.getByRole('heading', { name: '练习小结' })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jianpu-solfege-trainer')).sessions);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ module: 'relative', summary: { answered: 2 } });
  const audio = await page.evaluate(async () => {
    const response = await fetch('/audio/piano/C4.mp3');
    return { status: response.status, mime: response.headers.get('Content-Type'), bytes: (await response.arrayBuffer()).byteLength };
  });
  expect(audio.status).toBe(200); expect(audio.mime).toBe('audio/mpeg'); expect(audio.bytes).toBeGreaterThan(1000);
  const permissions = await page.evaluate(() => ({ node: typeof window.require, preload: typeof window.ipcRenderer }));
  expect(permissions).toEqual({ node: 'undefined', preload: 'undefined' });
  await desktop.close();
  await launch();
  await page.getByRole('button', { name: '历史记录', exact: true }).click();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await expect(page.locator('.history-row')).toContainText('相对音程 · 练习');
  console.log('Packaged app.asar desktop smoke passed: local audio, post-answer replay, keyboard, 200% zoom, native pause/close, isolated persistent history.');
  console.log(`Host runtime: ${process.platform}/${process.arch}; this is not a Windows GUI execution test.`);
} finally {
  // An assertion may fail during a quiz; its native exit-confirmation must not hang test cleanup.
  const child = desktop?.process();
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
  }
  rmSync(temporary, { recursive: true, force: true });
}
