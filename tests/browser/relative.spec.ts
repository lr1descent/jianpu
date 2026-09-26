import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const shots = 'artifacts/screenshots/v0.1.2';
mkdirSync(shots, { recursive: true });
async function openModule(page: Page, module: '简谱识读' | '相对音程') {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(`^${module}`) }).click();
}
async function startRelative(page: Page, mode = '练习', key = 'D') {
  await openModule(page, '相对音程');
  await page.getByRole('button', { name: new RegExp(`^${mode}模式`) }).click();
  await page.getByLabel('调性', { exact: true }).selectOption(key);
  await page.getByRole('radio', { name: '7 题', exact: true }).check();
  await page.getByRole('button', { name: `开始${mode}`, exact: true }).click();
}
async function ready(page: Page) {
  await expect(page.locator('.answer')).toHaveCount(7);
  await expect(page.locator('.answer').first()).toBeEnabled();
}
async function sounds(page: Page) {
  return page.evaluate(() => (window as typeof window & { playedSounds: number[] }).playedSounds);
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Fixed random input and audio observation live only in this disposable test context.
    Math.random = () => 0;
    const observed = window as typeof window & { playedSounds: number[] };
    observed.playedSounds = [];
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof original>) {
      if (this.buffer && this.buffer.duration > .1) observed.playedSounds.push(args[0] ?? this.context.currentTime);
      return original.apply(this, args);
    };
  });
});
test('相对音程：每题真实播放两个音、隐藏题面、练习反馈、整对重听和独立记录', async ({ page }) => {
  await startRelative(page);
  await expect(page.locator('#playback-status')).toContainText('正在播放');
  await expect(page.locator('.answer:disabled')).toHaveCount(7);
  await expect(page.locator('#question, .question-number, [data-degree]')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('D4');
  await ready(page);
  const starts = await sounds(page);
  expect(starts).toHaveLength(2);
  expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1.18);
  const options = await page.locator('.answer').allTextContents();
  await page.screenshot({ path: `${shots}/relative-answering-1280x720.png`, fullPage: true });
  await page.getByRole('button', { name: '重听 do 与目标音' }).click();
  await ready(page);
  expect(await sounds(page)).toHaveLength(4);
  expect(await page.locator('.answer').allTextContents()).toEqual(options);
  await page.getByRole('button', { name: 're', exact: true }).click();
  await expect(page.locator('#feedback')).toContainText('正确，目标音是 re。');
  await expect(page.locator('#feedback')).toContainText('参考 do：D4 · 目标音：E4');
  await page.getByRole('button', { name: '结束本轮', exact: true }).click();
  await page.getByRole('button', { name: '确认结束', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jianpu-solfege-trainer')!));
  expect(saved.sessions[0]).toMatchObject({ module: 'relative', mode: 'practice', key: 'D', summary: { answered: 1, correct: 1 } });
  expect(saved.sessions[0].answers[0]).toMatchObject({ degree: 2, selected: 're', replaysBeforeAnswer: 1 });
});
test('相对音程考试：完整七题均衡，未交卷不揭晓，报告按唱名且不进入简谱强化', async ({ page }) => {
  await startRelative(page, '考试', 'F#');
  for (let i = 0; i < 7; i++) {
    await ready(page);
    await page.getByRole('button', { name: 'do', exact: true }).click();
    await expect(page.locator('#feedback')).toHaveText('答案已记录，请继续下一题。');
    await expect(page.locator('.answer.correct, .answer.incorrect, .question-number')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(/正确答案|正确唱名|目标音：|参考 do：|正确率|E♯5/);
    if (i === 0) await page.screenshot({ path: `${shots}/relative-exam-recorded-1280x720.png`, fullPage: true });
    await page.locator('[data-action="next"]').click();
  }
  await expect(page.getByRole('heading', { name: '考试报告' })).toBeVisible();
  await expect(page.locator('.score-section')).toContainText('已答 7 / 7 · 正确 1 · 错误 6');
  await expect(page.getByRole('heading', { name: '本轮错选方向' })).toBeVisible();
  await expect(page.locator('[data-action="reinforce"]')).toHaveCount(0);
  await page.getByText('逐唱名统计', { exact: true }).click();
  await page.screenshot({ path: `${shots}/relative-exam-report-1280x720.png`, fullPage: true });
  const record = await page.evaluate(() => JSON.parse(localStorage.getItem('jianpu-solfege-trainer')!).sessions[0]);
  expect(record.answers.map((a: { degree: number }) => a.degree)).toEqual([2, 3, 4, 5, 6, 7, 1]);
  expect(record.module).toBe('relative'); expect(await sounds(page)).toHaveLength(28);
  await page.getByRole('button', { name: '同设置重新考试' }).click();
  await ready(page); await expect(page.locator('.brand')).toContainText('相对音程');
});
test('参考音之后转入后台会取消目标音，恢复重播原题并排除中断耗时', async ({ page }) => {
  await startRelative(page);
  await expect.poll(async () => (await sounds(page)).length).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('trainer:background')));
  await expect(page.getByRole('dialog')).toContainText('练习已暂停');
  await page.waitForTimeout(2600); // Longer than the pair: a stale target must not fire.
  expect(await sounds(page)).toHaveLength(1);
  await page.getByRole('button', { name: '继续', exact: true }).click(); await ready(page);
  expect(await sounds(page)).toHaveLength(3);
  await expect(page.locator('#question-progress')).toHaveText('第 1 / 7 题');
  await page.getByRole('button', { name: 're', exact: true }).click();
  await page.getByRole('button', { name: '结束本轮', exact: true }).click(); await page.getByRole('button', { name: '确认结束' }).click();
  const answer = await page.evaluate(() => JSON.parse(localStorage.getItem('jianpu-solfege-trainer')!).sessions[0].answers[0]);
  expect(answer).toMatchObject({ correct: true, reactionMs: null, interruptedBeforeAnswer: true });
});
test('听音不能静音猜题，加载失败能重试，播放中静音必须暂停', async ({ page }) => {
  await page.route('**/audio/piano/C4.mp3', route => route.abort('failed'));
  await startRelative(page);
  await expect(page.getByRole('dialog')).toContainText('未能加载本地钢琴采样');
  await expect(page.getByRole('button', { name: '静音继续' })).toHaveCount(0);
  await page.unroute('**/audio/piano/C4.mp3');
  await page.getByRole('button', { name: '重试 / 启用声音' }).click(); await ready(page);
  await page.locator('.sound-control summary').click(); await page.getByLabel('静音', { exact: true }).check();
  await expect(page.getByRole('dialog')).toContainText('相对音程需要声音');
  await page.getByRole('button', { name: '取消静音并继续' }).click(); await ready(page);
  await expect(page.locator('#sound-label')).toHaveText('音量 30%');
  await expect(page.locator('#question-progress')).toHaveText('第 1 / 7 题');
});
test('模块设置独立；历史可按模块筛选，旧 schema v2 设置安全升级', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('jianpu-solfege-trainer', JSON.stringify({ schemaVersion: 2,
      settings: { key: 'G', practiceQuestionCount: 35, examQuestionCount: 21, lastMainMode: 'exam', volume: .3, muted: false }, sessions: [] }));
  });
  await openModule(page, '简谱识读');
  await page.getByRole('button', { name: /^练习模式/ }).click();
  await expect(page.getByLabel('调性', { exact: true })).toHaveValue('G');
  await expect(page.getByRole('radio', { name: '35 题', exact: true })).toBeChecked();
  await page.getByRole('button', { name: '开始练习', exact: true }).click();
  await page.getByRole('button', { name: '结束本轮', exact: true }).click(); await page.getByRole('button', { name: '确认结束' }).click();
  await page.getByRole('button', { name: '返回首页', exact: true }).click();
  await page.getByRole('button', { name: /^相对音程/ }).click(); await page.getByRole('button', { name: /^练习模式/ }).click();
  await expect(page.getByLabel('调性', { exact: true })).toHaveValue('C');
  await expect(page.getByRole('radio', { name: '21 题', exact: true })).toBeChecked();
  await page.getByLabel('调性', { exact: true }).selectOption('D');
  await page.getByRole('button', { name: '开始练习', exact: true }).click(); await ready(page);
  await page.getByRole('button', { name: '结束本轮', exact: true }).click(); await page.getByRole('button', { name: '确认结束' }).click();
  await page.getByRole('button', { name: '历史记录', exact: true }).click();
  await expect(page.locator('.history-row')).toHaveCount(2);
  await page.getByRole('group', { name: '筛选模块', exact: true }).getByRole('button', { name: '相对音程', exact: true }).click();
  await expect(page.locator('.history-row')).toHaveCount(1); await expect(page.locator('.history-row')).toContainText('相对音程 · 练习 · D 大调');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jianpu-solfege-trainer')!));
  expect(saved.settings.modules.notation.key).toBe('G'); expect(saved.settings.modules.relative.key).toBe('D');
});
for (const [width, height] of [[1280, 720], [390, 844], [320, 568]]) {
  test(`相对音程 ${width}×${height}：无横向溢出，键盘和反馈布局稳定`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await startRelative(page); await ready(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const next = page.locator('[data-action="next"]'), before = await next.boundingBox();
    await expect(page.locator('#listening-title')).toBeFocused();
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
    await expect(page.locator('.answer:disabled')).toHaveCount(7);
    expect((await next.boundingBox())!.y).toBe(before!.y);
    await page.screenshot({ path: `${shots}/relative-feedback-${width}x${height}.png`, fullPage: true });
    await expect(next).toBeEnabled();
    await expect(page.locator('#feedback')).toBeFocused();
    await page.keyboard.press('Tab'); await expect(next).toBeFocused(); await expect(next).toBeInViewport();
    await page.keyboard.press('Enter'); await ready(page);
    await expect(page.locator('#question-progress')).toHaveText('第 2 / 7 题');
  });
}
