import { test, expect, type Page } from '@playwright/test';

type Sound = { sample: string; rate: number };
const next = (page: Page) => page.locator('[data-action="next"]');
const sounds = (page: Page): Promise<Sound[]> => page.evaluate(() => (window as typeof window & { keyboardSounds: Sound[] }).keyboardSounds);
const sampleMidis: Record<string, number> = { C4: 60, Ds4: 63, Fs4: 66, A4: 69, C5: 72, Ds5: 75, Fs5: 78, A5: 81 };
function expectPitch(sound: Sound, midi: number) {
  expect(sampleMidis[sound.sample] + 12 * Math.log2(sound.rate)).toBeCloseTo(midi, 4);
}
async function setup(page: Page, direction: 'name-to-key' | 'key-to-name') {
  await page.goto('/');
  await page.locator('[data-action="keyboard-module"]').click();
  await page.locator(`input[value="${direction}"]`).check();
  await page.getByRole('button', { name: '开始键盘练习', exact: true }).click();
}
async function finish(page: Page) {
  await page.getByRole('button', { name: '结束本轮', exact: true }).click();
  await page.getByRole('button', { name: '确认结束', exact: true }).click();
  return page.evaluate(() => JSON.parse(localStorage.getItem('jianpu-solfege-trainer')!).sessions[0]);
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
    const observed = window as typeof window & { keyboardSounds: Sound[] };
    observed.keyboardSounds = [];
    // Observe the real decoded sample and playback rate without replacing audio playback.
    const encoded = new WeakMap<ArrayBuffer, string>();
    const decoded = new WeakMap<AudioBuffer, string>();
    const rates = new WeakMap<AudioParam, number>();
    const setValue = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function (value, time) {
      rates.set(this, value);
      return setValue.call(this, value, time);
    };
    const read = Response.prototype.arrayBuffer;
    Response.prototype.arrayBuffer = async function () {
      const buffer = await read.call(this);
      const name = this.url.match(/\/audio\/piano\/(\w+)\.mp3/)?.[1];
      if (name) encoded.set(buffer, name);
      return buffer;
    };
    const decode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function (buffer, ...args) {
      const name = encoded.get(buffer);
      return decode.call(this, buffer, ...args).then(audio => {
        if (name) decoded.set(audio, name);
        return audio;
      });
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      if (this.buffer && this.buffer.duration > .1) {
        // AudioParam.value can still be 1 before the audio render thread applies its timeline.
        observed.keyboardSounds.push({ sample: decoded.get(this.buffer) ?? 'unknown', rate: rates.get(this.playbackRate)! });
      }
      return start.apply(this, args);
    };
  });
});

test('音名到琴键：题前不发声，答对答错均只播放正确目标的 C4–B4 音高', async ({ page }) => {
  await setup(page, 'name-to-key');
  await expect(page.locator('button.piano-key').first()).toBeEnabled();
  expect(await sounds(page)).toEqual([]);
  for (let i = 0; i < 2; i++) {
    // First target C♯: deliberately choose C. Second target D: choose correctly.
    await page.locator(`button.piano-key[data-pitch="${i === 0 ? 0 : 2}"]`).click();
    await expect(next(page)).toBeDisabled();
    await expect(page.locator('#playback-status')).toHaveText('正在播放正确琴键音…');
    await expect(page.locator('#feedback')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(next(page)).toBeEnabled();
    const played = await sounds(page);
    expect(played).toHaveLength(i + 1);
    expectPitch(played[i], 61 + i);
    if (i === 0) {
      await next(page).click();
      await expect(page.locator('#question')).toHaveText('D');
      expect(await sounds(page)).toHaveLength(1);
    }
  }
  const record = await finish(page);
  expect(record.summary).toMatchObject({ answered: 2, correct: 1, wrong: 1 });
  expect(record.answers.every((a: { replaysBeforeAnswer: number; replaysAfterAnswer: number }) => a.replaysBeforeAnswer === 0 && a.replaysAfterAnswer === 0)).toBe(true);
});

test('琴键到音名：标记目标后播放，结束才开放答案；提交不再次发声', async ({ page }) => {
  await setup(page, 'key-to-name');
  for (let i = 0; i < 2; i++) {
    await expect(page.locator('#playback-status')).toHaveText('正在播放标记的琴键音…');
    await expect(page.locator('.keyboard-note-options .answer:disabled')).toHaveCount(12);
    await expect(page.locator('.answer').first()).toBeEnabled();
    expect(await sounds(page)).toHaveLength(i + 1);
    expectPitch((await sounds(page))[i], 61 + i);
    await page.locator(`.answer[data-pitch="${i === 0 ? 1 : 0}"]`).click();
    await expect(next(page)).toBeEnabled();
    await page.waitForTimeout(350); // Longer than the audio attack delay: no answer-time playback.
    expect(await sounds(page)).toHaveLength(i + 1);
    if (i === 0) await next(page).click();
  }
  const record = await finish(page);
  expect(record.summary).toMatchObject({ answered: 2, correct: 1, wrong: 1 });
});

test('音名到琴键：答后立即后台中断取消未发出的声音，恢复只播正确音且不重复计分', async ({ page }) => {
  await setup(page, 'name-to-key');
  await expect(page.locator('button.piano-key').first()).toBeEnabled();
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('button.piano-key[data-pitch="0"]')!.click();
    window.dispatchEvent(new Event('trainer:background'));
  });
  await expect(page.getByRole('dialog')).toContainText('练习已暂停');
  await page.waitForTimeout(1500);
  expect(await sounds(page)).toHaveLength(0);
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(next(page)).toBeEnabled();
  expect(await sounds(page)).toHaveLength(1);
  expectPitch((await sounds(page))[0], 61);
  const record = await finish(page);
  expect(record.answers).toHaveLength(1);
  expect(record.answers[0]).toMatchObject({ correct: false, pitchClass: 1, replaysAfterAnswer: 0, interruptedBeforeAnswer: false });
  expect(record.answers[0].reactionMs).not.toBeNull();
});

test('琴键到音名：首播中断后恢复同音，首次答案的耗时标为中断', async ({ page }) => {
  await setup(page, 'key-to-name');
  await expect.poll(async () => (await sounds(page)).length).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('trainer:background')));
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.locator('.answer').first()).toBeEnabled();
  expect(await sounds(page)).toHaveLength(2);
  for (const sound of await sounds(page)) expectPitch(sound, 61);
  await page.locator('.answer[data-pitch="1"]').click();
  const record = await finish(page);
  expect(record.answers).toHaveLength(1);
  expect(record.answers[0]).toMatchObject({ correct: true, interruptedBeforeAnswer: true, reactionMs: null });
});

test('采样加载失败明确提示，重试成功后原题正常播放', async ({ page }) => {
  await page.route('**/audio/piano/**', route => route.abort());
  await setup(page, 'key-to-name');
  await expect(page.getByRole('dialog')).toContainText('未能加载本地钢琴采样');
  await expect(page.locator('.answer:disabled')).toHaveCount(12);
  expect(await sounds(page)).toHaveLength(0);
  await page.unroute('**/audio/piano/**');
  await page.getByRole('button', { name: '重试 / 启用声音' }).click();
  await expect(page.locator('.answer').first()).toBeEnabled();
  expect(await sounds(page)).toHaveLength(1);
  expectPitch((await sounds(page))[0], 61);
  await page.locator('.answer[data-pitch="1"]').click();
  expect((await finish(page)).summary.correct).toBe(1);
});

test('明确静音继续可无采样作答，取消静音后下一题恢复音频', async ({ page }) => {
  await page.route('**/audio/piano/**', route => route.abort());
  await setup(page, 'key-to-name');
  await page.getByRole('button', { name: '静音继续', exact: true }).click();
  await expect(page.locator('.answer').first()).toBeEnabled();
  await page.locator('.answer[data-pitch="1"]').click();
  await expect(next(page)).toBeEnabled();
  expect(await sounds(page)).toHaveLength(0);
  await page.unroute('**/audio/piano/**');
  await page.locator('.sound-control summary').click();
  await page.getByLabel('静音', { exact: true }).uncheck();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await next(page).click();
  await expect(page.locator('.answer').first()).toBeEnabled();
  expect(await sounds(page)).toHaveLength(1);
  expectPitch((await sounds(page))[0], 62);
  await page.locator('.answer[data-pitch="2"]').click();
  const record = await finish(page);
  expect(record.answers.map((a: { mutedAtAnswer: boolean }) => a.mutedAtAnswer)).toEqual([true, false]);
  await page.reload();
  await page.getByRole('button', { name: '历史记录', exact: true }).click();
  await expect(page.locator('.history-row')).toHaveCount(1);
});

test('答后播放中主动静音释放下一题，结束本轮取消后续音符', async ({ page }) => {
  await setup(page, 'name-to-key');
  await page.locator('button.piano-key[data-pitch="1"]').click();
  await expect(next(page)).toBeDisabled();
  await page.locator('.sound-control summary').click();
  await page.getByLabel('静音', { exact: true }).check();
  await expect(next(page)).toBeEnabled();
  await page.keyboard.press('Escape');
  await next(page).click();
  await page.locator('button.piano-key[data-pitch="2"]').click();
  await expect(next(page)).toBeEnabled();
  const record = await finish(page);
  const played = await sounds(page);
  await page.waitForTimeout(1500);
  expect(await sounds(page)).toEqual(played);
  expect(record.answers[1].mutedAtAnswer).toBe(true);
});
