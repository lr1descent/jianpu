import { test, expect, type Page } from '@playwright/test';

type Sound = { sample: number; rate: number; time: number };
const next = (page: Page) => page.locator('[data-action="next"]');
const sounds = (page: Page): Promise<Sound[]> => page.evaluate(() => (window as typeof window & { played: Sound[] }).played);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    const observed = window as typeof window & { played: Sound[] };
    observed.played = [];
    const samples = new WeakMap<AudioBuffer, number>();
    let id = 0;
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof original>) {
      if (this.buffer && this.buffer.duration > .1) {
        if (!samples.has(this.buffer)) samples.set(this.buffer, ++id);
        observed.played.push({ sample: samples.get(this.buffer)!, rate: this.playbackRate.value, time: args[0] ?? this.context.currentTime });
      }
      return original.apply(this, args);
    };
  });
});

async function start(page: Page, module: '简谱识读' | '相对音程', mode: '练习' | '考试' = '练习') {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(`^${module}`) }).click();
  await page.getByRole('button', { name: new RegExp(`^${mode}模式`) }).click();
  await page.getByRole('radio', { name: '7 题', exact: true }).check();
  await page.getByRole('button', { name: `开始${mode}`, exact: true }).click();
  await expect(page.locator('.answer').first()).toBeEnabled();
}
async function finish(page: Page, mode: '练习' | '考试' = '练习') {
  await page.getByRole('button', { name: mode === '考试' ? '提前交卷' : '结束本轮', exact: true }).click();
  await page.getByRole('button', { name: mode === '考试' ? '确认交卷' : '确认结束', exact: true }).click();
  return page.evaluate(() => JSON.parse(localStorage.getItem('jianpu-solfege-trainer')!).sessions[0]);
}

for (const module of ['简谱识读', '相对音程'] as const) for (const mode of ['练习', '考试'] as const) {
  test(`${module}${mode}：答对答错都只重播当前题，不改计分和手动重听次数`, async ({ page }) => {
    await start(page, module, mode);
    const perPlay = module === '相对音程' ? 2 : 1;
    for (let i = 0; i < 2; i++) {
      await expect(page.locator('.answer').first()).toBeEnabled();
      await expect.poll(async () => (await sounds(page)).length).toBe((i * 2 + 1) * perPlay);
      const before = await sounds(page);
      const expected = before.slice(-perPlay).map(({ sample, rate }) => ({ sample, rate }));
      const options = await page.locator('.answer').allTextContents();
      // Fixed sequence starts re, mi: one correct choice, then one wrong choice.
      await page.getByRole('button', { name: i === 0 ? 're' : 'do', exact: true }).click();
      await expect(next(page)).toBeDisabled();
      await expect(page.locator('[data-action="replay"]')).toBeDisabled();
      await expect(page.locator('#feedback')).toBeFocused();
      await page.keyboard.press('Enter'); // A repeated submit must not queue another playback.
      await expect(page.locator('#question-progress')).toHaveText(`第 ${i + 1} / 7 题`);
      if (mode === '考试') {
        await expect(page.locator('#feedback')).toHaveText('答案已记录，请继续下一题。');
        await expect(page.locator('.answer.correct, .answer.incorrect')).toHaveCount(0);
      }
      await expect(next(page)).toBeEnabled();
      const after = await sounds(page);
      expect(after).toHaveLength(before.length + perPlay);
      expect(after.slice(-perPlay).map(({ sample, rate }) => ({ sample, rate }))).toEqual(expected);
      if (perPlay === 2) expect(after.at(-1)!.time - after.at(-2)!.time).toBeGreaterThanOrEqual(1.18);
      expect(await page.locator('.answer').allTextContents()).toEqual(options);
      await expect(page.locator('#feedback')).toBeFocused();
      if (i === 0) { await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); }
    }
    await page.locator('[data-action="replay"]').click();
    await expect(next(page)).toBeEnabled();
    expect(await sounds(page)).toHaveLength(5 * perPlay);
    const record = await finish(page, mode);
    expect(record.summary).toMatchObject({ answered: 2, correct: 1, wrong: 1 });
    expect(record.answers[0]).toMatchObject({ replaysBeforeAnswer: 0, replaysAfterAnswer: 0 });
    expect(record.answers[1]).toMatchObject({ replaysBeforeAnswer: 0, replaysAfterAnswer: 1 });
  });
}

test('答后双音被后台中断：取消未触发目标，恢复整对播放且答案只保存一次', async ({ page }) => {
  await start(page, '相对音程');
  await page.getByRole('button', { name: 're', exact: true }).click();
  await expect.poll(async () => (await sounds(page)).length).toBe(3);
  await page.evaluate(() => window.dispatchEvent(new Event('trainer:background')));
  await expect(page.getByRole('dialog')).toContainText('练习已暂停');
  await page.waitForTimeout(2600); // A canceled target must not fire after the original pair duration.
  expect(await sounds(page)).toHaveLength(3);
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(next(page)).toBeEnabled();
  expect(await sounds(page)).toHaveLength(5);
  await expect(page.locator('.answer:disabled')).toHaveCount(7);
  const record = await finish(page);
  expect(record.answers).toHaveLength(1);
  expect(record.answers[0]).toMatchObject({ correct: true, replaysAfterAnswer: 0, interruptedBeforeAnswer: false });
  expect(record.answers[0].reactionMs).not.toBeNull();
});

test('简谱答后重播中主动静音仍可下一题，不自动取消用户静音', async ({ page }) => {
  await start(page, '简谱识读');
  await page.getByRole('button', { name: 're', exact: true }).click();
  await expect(next(page)).toBeDisabled();
  await page.locator('.sound-control summary').click();
  await page.getByLabel('静音', { exact: true }).check();
  await expect(next(page)).toBeEnabled();
  await page.keyboard.press('Escape');
  await next(page).click();
  await page.getByRole('button', { name: 'mi', exact: true }).click();
  await expect(next(page)).toBeEnabled();
  await expect(page.locator('#sound-label')).toHaveText('已静音');
  const record = await finish(page);
  expect(record.summary).toMatchObject({ answered: 2, correct: 2 });
  expect(record.answers[1].mutedAtAnswer).toBe(true);
});
