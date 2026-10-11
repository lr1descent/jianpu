import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

type Played = { midi: number; lead: number; stopped: boolean };
const shots = 'artifacts/screenshots/singing';
mkdirSync(shots, { recursive: true });
const played = (page: Page): Promise<Played[]> => page.evaluate(() => (window as typeof window & { singingPlayed: Played[] }).singingPlayed);
const key = (page: Page, midi: number) => page.locator(`.free-key[data-midi="${midi}"]`);
async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^模唱练耳/ }).click();
  await expect(key(page, 60)).toBeEnabled();
}
async function position(page: Page, value: number) {
  await page.locator('#singing-position').evaluate((input: HTMLInputElement, next) => {
    input.value = String(next); input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function observeAudio(page: Page) {
  await page.addInitScript(() => {
    const observed = window as typeof window & { singingPlayed: Played[] };
    observed.singingPlayed = [];
    const encoded = new WeakMap<ArrayBuffer, number>();
    const decoded = new WeakMap<AudioBuffer, number>();
    const rates = new WeakMap<AudioParam, number>();
    const sources = new WeakMap<AudioBufferSourceNode, Played>();
    const roots: Record<string, number> = { C4: 60, Ds4: 63, Fs4: 66, A4: 69, C5: 72, Ds5: 75, Fs5: 78, A5: 81 };
    const read = Response.prototype.arrayBuffer;
    Response.prototype.arrayBuffer = async function () {
      const buffer = await read.call(this);
      const name = this.url.match(/\/audio\/piano\/(\w+)\.mp3/)?.[1];
      if (name) encoded.set(buffer, roots[name]);
      return buffer;
    };
    const decode = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function (buffer, ...args) {
      const root = encoded.get(buffer);
      return decode.call(this, buffer, ...args).then(audio => { if (root !== undefined) decoded.set(audio, root); return audio; });
    };
    const set = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function (value, time) { rates.set(this, value); return set.call(this, value, time); };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      if (this.buffer && this.buffer.duration > .1) {
        // Tone leaves the native default untouched when the sample plays at its original pitch.
        const rate = rates.get(this.playbackRate) ?? this.playbackRate.value;
        const sound = { midi: decoded.get(this.buffer)! + 12 * Math.log2(rate), lead: (args[0] ?? this.context.currentTime) - this.context.currentTime, stopped: false };
        sources.set(this, sound); observed.singingPlayed.push(sound);
      }
      return start.apply(this, args);
    };
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (...args: Parameters<typeof stop>) {
      const sound = sources.get(this); if (sound) sound.stopped = true;
      return stop.apply(this, args);
    };
  });
}
test.beforeEach(async ({ page }) => { await observeAudio(page); });

test('88 键默认 C4，滑杆移至 C3，白键黑键快速弹奏真实音高且不延迟排队', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await expect(page.locator('.free-key')).toHaveCount(88);
  await expect(page.locator('.free-white')).toHaveCount(52);
  await expect(page.locator('.free-black')).toHaveCount(36);
  await expect(page.locator('#singing-range')).toContainText('C4');
  expect(await played(page)).toEqual([]);
  await key(page, 60).click();
  await position(page, 16); // C3 is the 17th white key starting at A0.
  await expect(page.locator('#singing-range')).toContainText('C3');
  for (const midi of [48, 49, 50, 51, 52, 53]) await key(page, midi).click();
  await position(page, 52); await key(page, 108).click();
  await position(page, 0); await key(page, 21).click();
  const sounds = await played(page);
  expect(sounds).toHaveLength(9);
  sounds.forEach((sound, index) => {
    expect(sound.midi).toBeCloseTo([60, 48, 49, 50, 51, 52, 53, 108, 21][index], 4);
    expect(sound.lead).toBeLessThan(.04);
  });
  await expect(page.locator('.is-pressed')).toHaveCount(0);
  await position(page, 16);
  await noOverflow(page);
  await page.screenshot({ path: `${shots}/desktop.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('音名开关保留布局与可访问名称，切换页面保留位置偏好且不新增成绩', async ({ page }) => {
  await open(page); await position(page, 16);
  const before = await key(page, 48).boundingBox();
  await page.getByRole('switch', { name: '显示音名' }).uncheck();
  await expect(key(page, 48).locator('.free-key-name')).toBeHidden();
  await expect(key(page, 48)).toHaveAttribute('aria-label', 'C3');
  expect(await key(page, 48).boundingBox()).toEqual(before);
  await page.getByRole('button', { name: '← 返回首页' }).click();
  await page.getByRole('button', { name: /^模唱练耳/ }).click();
  await expect(key(page, 48)).toBeEnabled();
  await expect(page.getByRole('switch', { name: '显示音名' })).not.toBeChecked();
  await expect(page.locator('#singing-range')).toContainText('C3');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('jianpu-solfege-trainer') ?? '{"sessions":[]}').sessions)).toHaveLength(0);
});

test('方向键选音，按住空格不重复触发，松开、后台和导航释放声音', async ({ page }) => {
  await open(page);
  await key(page, 60).focus();
  await page.keyboard.press('ArrowRight'); await expect(key(page, 61)).toBeFocused();
  await page.keyboard.down('Space'); await page.keyboard.down('Space');
  await expect(key(page, 61)).toHaveClass(/is-pressed/);
  expect(await played(page)).toHaveLength(1);
  expect((await played(page))[0].stopped).toBe(false);
  await page.keyboard.up('Space');
  await expect.poll(async () => (await played(page))[0].stopped).toBe(true);
  await page.keyboard.down('Enter');
  await page.evaluate(() => window.dispatchEvent(new Event('trainer:background')));
  await expect(page.locator('.is-pressed')).toHaveCount(0);
  await expect(page.locator('#singing-status')).toContainText('声音已暂停');
  await page.keyboard.up('Enter');
  await page.getByRole('button', { name: '启用声音', exact: true }).click();
  await expect(key(page, 60)).toBeEnabled();
  expect(await played(page)).toHaveLength(2); // Resuming never plays a previously held note.
  await key(page, 60).focus(); await page.keyboard.down('Space');
  await page.getByRole('button', { name: '← 返回首页' }).click();
  await page.keyboard.up('Space');
  await expect.poll(async () => (await played(page)).every(sound => sound.stopped)).toBe(true);
});

test('采样失败和慢加载可恢复，离开后不出现迟到音符；静音不发声', async ({ page }) => {
  await page.route('**/audio/piano/**', route => route.abort());
  await page.goto('/'); await page.getByRole('button', { name: /^模唱练耳/ }).click();
  await expect(page.locator('#singing-status')).toContainText('未能加载');
  await expect(key(page, 60)).toBeDisabled();
  await page.unroute('**/audio/piano/**');
  await page.getByRole('button', { name: '启用声音', exact: true }).click();
  await expect(key(page, 60)).toBeEnabled();
  await page.locator('.sound-control summary').click(); await page.getByLabel('静音', { exact: true }).check();
  await page.keyboard.press('Escape'); await key(page, 60).click();
  expect(await played(page)).toHaveLength(0);
  await page.locator('.sound-control summary').click(); await page.getByLabel('静音', { exact: true }).uncheck();
  await page.keyboard.press('Escape'); await key(page, 60).click();
  expect(await played(page)).toHaveLength(1);
  await page.getByRole('button', { name: '← 返回首页' }).click();
  await page.reload();
  await page.route('**/audio/piano/**', async route => { await new Promise(resolve => setTimeout(resolve, 300)); await route.continue(); });
  await page.getByRole('button', { name: /^模唱练耳/ }).click();
  await page.getByRole('button', { name: '← 返回首页' }).click();
  await page.waitForTimeout(600);
  await expect(page.getByRole('heading', { name: '从一个音开始。' })).toBeVisible();
  expect(await played(page)).toHaveLength(0);
});

test('系统全屏进入和退出，浏览器退出事件同步恢复正常页与焦点', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '横屏沉浸', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('singing-piano'))).toBe(true);
  await expect(page.getByRole('button', { name: '退出沉浸', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '退出沉浸', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(page.locator('.singing-piano')).not.toHaveClass(/is-immersive/);
  await expect(page.getByRole('button', { name: '横屏沉浸', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '横屏沉浸', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.locator('.singing-piano')).not.toHaveClass(/is-immersive/);
  await page.getByRole('button', { name: '横屏沉浸', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  // Exercise the real app navigation teardown while its root is still fullscreen.
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-action="home"]')!.click());
  await expect(page.getByRole('heading', { name: '从一个音开始。' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  expect(await page.evaluate(() => document.body.classList.contains('singing-immersive'))).toBe(false);
});

for (const width of [320, 390]) {
  test(`${width}px 竖屏沉浸：键盘横向铺满，退出位于独立区域，旋转后保留位置`, async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(document, 'fullscreenEnabled', { get: () => false }); });
    await page.setViewportSize({ width, height: 844 });
    await open(page); await noOverflow(page);
    await page.getByRole('button', { name: '横屏沉浸', exact: true }).click();
    await expect(page.locator('#singing-display-notice')).toContainText('页面沉浸');
    const root = (await page.locator('.singing-piano').boundingBox())!;
    expect(root.width).toBe(width); expect(root.height).toBe(844);
    const rect = (await page.locator('.singing-viewport').boundingBox())!;
    const quit = (await page.getByRole('button', { name: '退出沉浸', exact: true }).boundingBox())!;
    expect(rect.height).toBeGreaterThan(780);
    expect(rect.width).toBeGreaterThan(120);
    expect(quit.x).toBeGreaterThanOrEqual(rect.x + rect.width + 16);
    await page.screenshot({ path: `${shots}/immersive-portrait-${width}.png`, fullPage: true });
    await position(page, 16);
    await expect(page.locator('#singing-range')).toContainText('C3');
    await key(page, 48).click();
    expect((await played(page))[0].midi).toBeCloseTo(48);
    await page.setViewportSize({ width: 844, height: width });
    await expect(page.locator('#singing-range')).toContainText('C3');
    await expect.poll(() => page.locator('.singing-workspace').evaluate(el => getComputedStyle(el).transform)).toBe('none');
    await noOverflow(page);
    await page.screenshot({ path: `${shots}/immersive-landscape-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: '退出沉浸', exact: true }).click();
    await expect(page.locator('.singing-piano')).not.toHaveClass(/is-immersive/);
    await expect(page.getByRole('button', { name: '← 返回首页' })).toBeVisible();
    expect(await page.evaluate(() => document.body.classList.contains('singing-immersive'))).toBe(false);
  });
}

test('触屏多指独立发声与释放，取消触摸无卡音，旋转后的滑杆可实际拖动', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await observeAudio(page);
  await page.addInitScript(() => { Object.defineProperty(document, 'fullscreenEnabled', { get: () => false }); });
  await open(page);
  const client = await context.newCDPSession(page);
  const a = (await key(page, 60).boundingBox())!, b = (await key(page, 64).boundingBox())!;
  const touches = [{ x: a.x + a.width / 2, y: a.y + a.height - 25, id: 1 }, { x: b.x + b.width / 2, y: b.y + b.height - 25, id: 2 }];
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches });
  await expect(page.locator('.is-pressed')).toHaveCount(2);
  const chord = await played(page);
  expect(chord).toHaveLength(2);
  expect(chord[0].midi).toBeCloseTo(60); expect(chord[1].midi).toBeCloseTo(64);
  // CDP touchEnd identifies the contact being lifted here.
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [touches[0]] });
  await expect(page.locator('.is-pressed')).toHaveCount(1);
  await expect(key(page, 64)).toHaveClass(/is-pressed/);
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('.is-pressed')).toHaveCount(0);
  await expect.poll(async () => (await played(page)).every(sound => sound.stopped)).toBe(true);
  await page.getByRole('button', { name: '横屏沉浸', exact: true }).tap();
  const slider = page.locator('#singing-position');
  const bar = (await slider.boundingBox())!;
  const before = Number(await slider.inputValue());
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bar.x + bar.width / 2, y: bar.y + bar.height * .2, id: 3 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bar.x + bar.width / 2, y: bar.y + bar.height * .35, id: 3 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(Number(await slider.inputValue())).toBeLessThan(before);
  expect(await played(page)).toHaveLength(2);
  await page.getByRole('button', { name: '退出沉浸', exact: true }).tap();
  await expect(page.locator('.singing-piano')).not.toHaveClass(/is-immersive/);
  await context.close();
});

test('全屏请求被拒绝时显示原因，页面沉浸仍可退出', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { get: () => true });
    Element.prototype.requestFullscreen = () => Promise.reject(new Error('测试拒绝全屏'));
  });
  await open(page);
  await page.getByRole('button', { name: '横屏沉浸', exact: true }).click();
  await expect(page.locator('#singing-display-notice')).toContainText('测试拒绝全屏');
  await page.keyboard.press('Escape');
  await expect(page.locator('.singing-piano')).not.toHaveClass(/is-immersive/);
});

test('全屏请求尚未完成便退出，迟到结果不重新开启沉浸', async ({ page }) => {
  await page.addInitScript(() => {
    const observed = window as typeof window & { resolveFullscreen: () => void };
    Object.defineProperty(document, 'fullscreenEnabled', { get: () => true });
    Element.prototype.requestFullscreen = () => new Promise<void>(resolve => { observed.resolveFullscreen = resolve; });
  });
  await open(page);
  await page.getByRole('button', { name: '横屏沉浸', exact: true }).click();
  await page.getByRole('button', { name: '退出沉浸', exact: true }).click();
  await page.evaluate(() => (window as typeof window & { resolveFullscreen: () => void }).resolveFullscreen());
  await expect(page.locator('.singing-piano')).not.toHaveClass(/is-immersive/);
  await expect(page.getByRole('button', { name: '横屏沉浸', exact: true })).toBeVisible();
});
