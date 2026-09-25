import { test, expect, type Page, type Route } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const names = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'];
const shots = 'artifacts/screenshots';
mkdirSync(shots, { recursive: true });
async function shot(page: Page, name: string) { await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }); }
async function setup(page: Page, mode: '练习' | '考试', count: 7 | 21 | 35 = 7, key = 'C') {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(`^${mode}模式`) }).click();
  await page.getByLabel('调性', { exact: true }).selectOption(key);
  await page.getByRole('radio', { name: `${count} 题`, exact: true }).check();
  await page.getByRole('button', { name: `开始${mode}`, exact: true }).click();
  await expect(page.locator('#question')).toBeVisible();
}
async function degree(page: Page) { return Number(await page.locator('#question').textContent()); }
async function complete(page: Page, count: number, choose = (d: number) => names[d - 1]) {
  for (let i = 0; i < count; i++) {
    await page.getByRole('button', { name: choose(await degree(page)), exact: true }).click();
    await page.locator('[data-action="next"]').click();
  }
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test('练习：实际音频采样、首次错选、重听、稳定反馈位置和独立保存', async ({ page }) => {
  const samples = new Set<string>(); const external = new Set<string>();
  page.on('request', r => { if (r.url().endsWith('.mp3')) samples.add(r.url()); if (/^https?:/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:5173/')) external.add(r.url()); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/'); await shot(page, 'home-1440x900');
  await setup(page, '练习', 7, 'D');
  expect(samples.size).toBe(8); expect(external.size).toBe(0);
  await shot(page, 'answering-1440x900');
  const options = await page.locator('.answer').allTextContents();
  const oldQuestion = await page.locator('#question').textContent();
  const nextBefore = await page.locator('[data-action="next"]').boundingBox();
  await page.getByRole('button', { name: '重听', exact: true }).click();
  expect(await page.locator('.answer').allTextContents()).toEqual(options);
  expect(await page.locator('#question').textContent()).toBe(oldQuestion);
  await page.getByRole('button', { name: names[Number(oldQuestion) % 7], exact: true }).click();
  await expect(page.locator('#feedback')).toContainText('正确答案');
  expect(await page.locator('.answer:disabled').count()).toBe(7);
  expect((await page.locator('[data-action="next"]').boundingBox())!.y).toBe(nextBefore!.y);
  await shot(page, 'practice-wrong-1440x900');
  await page.getByRole('button', { name: '结束本轮', exact: true }).click();
  await page.getByRole('button', { name: '确认结束', exact: true }).click();
  await expect(page.getByRole('heading', { name: '练习小结' })).toBeVisible();
  await expect(page.locator('.score-section')).toContainText('已答 1 / 7 · 正确 0 · 错误 1');
  await expect(page.locator('.report-facts')).toContainText('1 次');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('jianpu-solfege-trainer')!));
  expect(stored.schemaVersion).toBe(2); expect(stored.sessions).toHaveLength(1);
  expect(stored.sessions[0].answers[0].selected).toBe(names[Number(oldQuestion) % 7]);
});
test('考试：中性提交、35 题样本报告、主动选择强化和来源隔离', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page, '考试', 35);
  const wrong = new Map([[3, 2], [5, 1]]);
  for (let i = 0; i < 35; i++) {
    const d = await degree(page), remaining = wrong.get(d) ?? 0;
    const choice = remaining ? d === 3 ? 'fa' : 'la' : names[d - 1];
    if (remaining) wrong.set(d, remaining - 1);
    await page.getByRole('button', { name: choice, exact: true }).click();
    await expect(page.locator('#feedback')).toHaveText('答案已记录，请继续下一题。');
    await expect(page.locator('#running-summary')).not.toContainText('正确');
    expect(await page.locator('.answer.correct, .answer.incorrect').count()).toBe(0);
    expect(await page.locator('.answer.selected').textContent()).toBe(choice);
    expect(await page.locator('main').textContent()).not.toMatch(/正确答案|实际音|连对|正确率/);
    if (i === 0) await shot(page, 'exam-recorded-1440x900');
    await page.locator('[data-action="next"]').click();
  }
  await expect(page.getByRole('heading', { name: '考试报告' })).toBeVisible();
  await expect(page.locator('.score')).toHaveText('91.4%');
  await expect(page.locator('.score-section')).toContainText('已答 35 / 35 · 正确 32 · 错误 3');
  await expect(page.locator('.confusion-list')).toContainText('本次看到 3 时，2 次选成 fa。');
  await shot(page, 'exam-report-selection-1440x900');
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('jianpu-solfege-trainer')!).sessions[0]);
  for (const input of await page.locator('input[name="pair"]').all()) await input.uncheck();
  await expect(page.getByRole('button', { name: '开始所选项强化' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '暂不强化' })).toBeEnabled();
  await page.locator('input[value="3-4"]').check();
  await page.getByRole('button', { name: '开始所选项强化' }).click();
  await expect(page.getByRole('heading', { name: '这些数字的正确唱名' })).toBeVisible();
  await shot(page, 'reinforcement-review-1440x900');
  await page.getByRole('button', { name: '开始答题' }).click();
  await expect(page.locator('#question')).toBeVisible();
  expect(await page.locator('.note-card').count()).toBe(0);
  const counts = Array(7).fill(0);
  for (let i = 0; i < 21; i++) {
    const d = await degree(page); counts[d - 1]++;
    expect(await page.locator('.answer').count()).toBe(7);
    await page.getByRole('button', { name: names[d - 1], exact: true }).click();
    await page.locator('[data-action="next"]').click();
  }
  expect(counts).toEqual([1, 1, 8, 8, 1, 1, 1]);
  await expect(page.getByRole('heading', { name: '强化练习小结' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '目标项表现' })).toBeVisible();
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem('jianpu-solfege-trainer')!).sessions);
  expect(records).toHaveLength(2); expect(records.find((s: { id: string }) => s.id === original.id)).toEqual(original);
  await page.getByRole('button', { name: '返回原考试报告' }).click();
  await expect(page.locator('.score')).toHaveText('91.4%');
  await page.getByRole('button', { name: '暂不强化' }).click();
  await page.reload(); await page.getByRole('button', { name: '历史记录', exact: true }).click();
  await page.locator('.history-row').filter({ hasText: '考试 · C 大调' }).click();
  await expect(page.locator('.confusion-row')).toHaveCount(2);
});
test('全对报告与零作答没有强化入口；清空确认可取消', async ({ page }) => {
  await setup(page, '考试'); await complete(page, 7);
  await expect(page.getByRole('heading', { name: '本次未发现错选项' })).toBeVisible();
  expect(await page.locator('[data-action="reinforce"]').count()).toBe(0);
  await shot(page, 'all-correct-report-1280x720');
  await page.getByRole('button', { name: '同设置重新考试' }).click();
  await expect(page.locator('#question')).toBeVisible();
  await page.getByRole('button', { name: '提前交卷', exact: true }).click();
  await page.getByRole('button', { name: '确认交卷', exact: true }).click();
  await expect(page.locator('.score')).toHaveText('—');
  await expect(page.locator('.score-section')).toContainText('暂无作答');
  await page.getByRole('button', { name: '历史记录', exact: true }).click();
  await page.getByRole('button', { name: '清空历史' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.history-row')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '清空历史' })).toBeFocused();
});
test('纯键盘完整流程、数字键无捷径、焦点公平、Escape 取消保留本题', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: '简谱唱名', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '练习模式', exact: true })).toBeVisible();
  await page.keyboard.press('Tab'); await expect(page.locator('#key')).toBeFocused();
  await page.keyboard.press('Tab'); await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: '7 题', exact: true })).toBeChecked();
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await expect(page.locator('#question')).toBeFocused();
  const number = await degree(page);
  await page.keyboard.press(String(number)); await expect(page.locator('[data-action="next"]')).toBeDisabled();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: '重听', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.locator('.answer').first()).toBeFocused();
  expect(await page.locator('.answer').first().evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  await expect(page.locator('#question')).toHaveText(String(number));
  await page.keyboard.press('Enter'); await expect(page.locator('#question')).toHaveText(String(number));
  await page.keyboard.press('Tab'); await expect(page.locator('[data-action="next"]')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#question-progress')).toHaveText('第 2 / 7 题');
  await page.getByRole('button', { name: '结束本轮' }).click();
  await expect(page.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.getByRole('button', { name: '确认结束' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('#question-progress')).toHaveText('第 2 / 7 题');
});
test('采样失败显示实际错误，可重试恢复原题', async ({ page }) => {
  await page.route('**/audio/piano/C4.mp3', route => route.abort('failed'));
  await page.goto('/'); await page.getByRole('button', { name: /^考试模式/ }).click();
  await page.getByRole('button', { name: '开始考试', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('未能加载本地钢琴采样');
  expect(await page.locator('.answer').count()).toBe(0);
  await shot(page, 'audio-error-1280x720');
  await page.unroute('**/audio/piano/C4.mp3');
  await page.getByRole('button', { name: '重试 / 启用声音' }).click();
  await expect(page.locator('#question')).toBeVisible();
  await expect(page.locator('#question-progress')).toHaveText('第 1 / 35 题');
});
test('主动静音允许无采样答题，启用声音后加载并保留原题', async ({ page }) => {
  await page.route('**/audio/piano/**', route => route.abort('failed'));
  await page.goto('/'); await page.getByRole('button', { name: /^练习模式/ }).click();
  await page.locator('.sound-control summary').click(); await page.getByLabel('静音', { exact: true }).check();
  await page.getByRole('button', { name: '开始练习', exact: true }).click();
  await expect(page.locator('#question')).toBeVisible();
  const d = await degree(page);
  await expect(page.locator('#sound-label')).toHaveText('已静音');
  await page.unroute('**/audio/piano/**');
  await page.locator('.sound-control summary').click(); await page.getByLabel('静音', { exact: true }).uncheck();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('#question')).toHaveText(String(d));
  await page.getByRole('button', { name: names[d - 1], exact: true }).click();
  await page.getByRole('button', { name: '结束本轮', exact: true }).click(); await page.getByRole('button', { name: '确认结束', exact: true }).click();
  await expect(page.locator('.report-facts')).toContainText('曾静音');
});
test('暂停保留已提交考试的中性状态，刷新回首页但保留已完成记录', async ({ page }) => {
  await setup(page, '考试');
  const n = await degree(page); await page.getByRole('button', { name: names[n % 7], exact: true }).click();
  // Simulate the browser event at its boundary; no app internals or test hooks are used.
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByRole('dialog')).toContainText('考试已暂停');
  await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, value: false }));
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.locator('#feedback')).toHaveText('答案已记录，请继续下一题。');
  await expect(page.locator('.answer:disabled')).toHaveCount(7);
  await page.reload(); await expect(page.getByRole('heading', { name: '从一个音开始。' })).toBeVisible();
});
test('恢复声音尚在加载时再次切到后台，旧回调不能自动恢复答题', async ({ page }) => {
  const pending: Route[] = [];
  await page.route('**/audio/piano/*.mp3', route => { pending.push(route); });
  await page.goto('/'); await page.getByRole('button', { name: /^练习模式/ }).click();
  await page.locator('.sound-control summary').click(); await page.getByLabel('静音', { exact: true }).check();
  await page.getByRole('button', { name: '开始练习', exact: true }).click();
  await expect(page.locator('#question')).toBeVisible();
  await page.locator('.sound-control summary').click(); await page.getByLabel('静音', { exact: true }).uncheck();
  await expect.poll(() => pending.length).toBe(8);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await Promise.all(pending.map(route => route.continue()));
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('dialog')).toContainText('练习已暂停');
  await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, value: false }));
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('#question-progress')).toHaveText('第 1 / 21 题');
});
for (const [width, height] of [[1440, 900], [1280, 720], [768, 1024], [390, 844], [320, 568]]) {
  test(`视觉视口 ${width}×${height}：首页、答题和反馈无横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/'); await noOverflow(page); await shot(page, `home-${width}x${height}`);
    await setup(page, '练习'); await noOverflow(page);
    const boxes = await page.locator('.answer').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
    expect(Math.max(...boxes.map(r => r.width)) - Math.min(...boxes.map(r => r.width))).toBeLessThan(1);
    expect(boxes.every(r => r.height >= 56 && r.width >= 44)).toBe(true);
    if (width < 768) { expect(boxes.filter(r => r.y === boxes[0].y)).toHaveLength(4); expect(boxes.filter(r => r.y === boxes[6].y)).toHaveLength(3); }
    if (width >= 1280) expect((await page.locator('[data-action="next"]').boundingBox())!.y + 48).toBeLessThan(height);
    const before = await page.locator('[data-action="next"]').boundingBox();
    await page.getByRole('button', { name: names[(await degree(page)) % 7], exact: true }).click();
    await noOverflow(page); expect((await page.locator('[data-action="next"]').boundingBox())!.y).toBe(before!.y);
    await shot(page, `practice-wrong-${width}x${height}`);
  });
}
test('减少动态效果与双倍文字重排，不裁剪操作', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 640, height: 450 });
  await setup(page, '练习');
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await noOverflow(page);
  const durations = await page.locator('.answer').evaluateAll(els => els.map(el => getComputedStyle(el).transitionDuration));
  expect(durations.every(d => d === '0s')).toBe(true);
  await page.getByRole('button', { name: names[(await degree(page)) % 7], exact: true }).click();
  await page.locator('[data-action="next"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-action="next"]')).toBeInViewport();
  await shot(page, 'text-200-percent-reflow-640x450');
});
test('手机报告、详情、历史及保存失败均可达', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await setup(page, '考试'); await complete(page, 7, d => names[d % 7]);
  await noOverflow(page); await shot(page, 'exam-report-selection-320x568');
  await page.getByText('混淆矩阵', { exact: true }).click(); await noOverflow(page);
  await page.getByRole('button', { name: '暂不强化' }).click();
  await page.getByRole('button', { name: '历史记录', exact: true }).click(); await noOverflow(page);
  await shot(page, 'history-320x568');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: '简谱唱名', exact: true }).click();
  await page.getByRole('button', { name: /^练习模式/ }).click();
  await expect(page.locator('.storage-notice')).toContainText('保存失败');
});
