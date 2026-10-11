import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const storageKey = 'jianpu-solfege-trainer';
const shots = 'artifacts/screenshots/keyboard';
mkdirSync(shots, { recursive: true });
async function setup(page: Page, direction: 'name-to-key' | 'key-to-name' = 'name-to-key') {
  await page.goto('/');
  await page.getByRole('button', { name: /^钢琴键盘音位识别/ }).click();
  await page.locator(`input[name="keyboard-direction"][value="${direction}"]`).check();
  await page.getByRole('radio', { name: '12 题', exact: true }).check();
  await page.getByRole('button', { name: '开始键盘练习', exact: true }).click();
  await expect(page.locator('[data-action="answer-keyboard"]').first()).toBeEnabled();
  await expect(page.locator('#question')).toBeFocused();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function finishEarly(page: Page) {
  await page.getByRole('button', { name: '结束本轮', exact: true }).click();
  await page.getByRole('button', { name: '确认结束', exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  // Deterministic shuffle yields C♯, D, … B, C. No application test hooks.
  await page.addInitScript(() => { Math.random = () => 0; });
});

test('音名到琴键：加载钢琴采样，首次错误锁定，完成十二题并持久化', async ({ page }) => {
  let audioRequests = 0;
  page.on('request', request => { if (request.url().includes('/audio/piano/')) audioRequests++; });
  await setup(page);
  await expect(page.locator('#question')).toHaveText('C♯');
  await expect(page.locator('.piano-key')).toHaveCount(12);
  await expect(page.locator('.key-name')).toHaveCount(0);
  await expect(page.locator('.sound-control')).toHaveCount(1);
  await page.screenshot({ path: `${shots}/name-to-key-1280.png`, fullPage: true });
  const before = await page.locator('[data-action="next"]').boundingBox();
  await page.getByRole('button', { name: '从左第 1 个白键', exact: true }).click();
  await expect(page.locator('#feedback')).toContainText('正确答案是 C♯ / D♭');
  await expect(page.locator('.piano-key:disabled')).toHaveCount(12);
  await expect(page.locator('#feedback')).toBeFocused();
  expect((await page.locator('[data-action="next"]').boundingBox())!.y).toBe(before!.y);
  await page.keyboard.press('Enter');
  await expect(page.locator('#question-progress')).toHaveText('第 1 / 12 题');
  await page.locator('[data-action="next"]').click();
  for (let i = 1; i < 12; i++) {
    await page.locator(`button.piano-key[data-pitch="${(i + 1) % 12}"]`).click();
    await page.locator('[data-action="next"]').click();
  }
  await expect(page.getByRole('heading', { name: '键盘练习小结' })).toBeVisible();
  await expect(page.locator('.score-section')).toContainText('已答 12 / 12 · 正确 11 · 错误 1');
  expect(audioRequests).toBe(8);
  const data = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), storageKey);
  expect(data.schemaVersion).toBe(4);
  expect(data.sessions[0]).toMatchObject({ module: 'keyboard', direction: 'name-to-key', endedEarly: false });
  expect(data.sessions[0].answers[0]).toMatchObject({ selected: 0, pitchClass: 1, correct: false });
  await page.reload(); await page.getByRole('button', { name: '历史记录', exact: true }).click();
  await expect(page.locator('.history-row')).toContainText('音名 → 琴键');
  await page.locator('.history-row').click();
  await expect(page.locator('.score')).toHaveText('91.7%');
});

test('琴键到音名：目标位置、等音选项、完整轮次及两个方向历史筛选', async ({ page }) => {
  await setup(page, 'key-to-name');
  await expect(page.getByRole('img', { name: '一个八度的钢琴键盘，标记的是从左第 1 个黑键' })).toBeVisible();
  await expect(page.locator('.target-key .key-mark')).toHaveText('?');
  await expect(page.locator('.keyboard-note-options .answer')).toHaveCount(12);
  await page.screenshot({ path: `${shots}/key-to-name-question-1280.png`, fullPage: true });
  for (let i = 0; i < 12; i++) {
    await page.locator(`.answer[data-pitch="${(i + 1) % 12}"]`).click();
    await expect(page.locator('#feedback')).toContainText('正确');
    await page.locator('[data-action="next"]').click();
  }
  await expect(page.locator('.score')).toHaveText('100%');
  await page.getByRole('button', { name: '同设置再练' }).click();
  await expect(page.locator('.keyboard-note-options .answer')).toHaveCount(12);
  await finishEarly(page);
  await expect(page.locator('.score-section')).toContainText('暂无作答');
  await page.getByRole('button', { name: '更换练习方向' }).click();
  await expect(page.locator('input[value="key-to-name"]')).toBeChecked();
  await page.locator('input[value="name-to-key"]').check();
  await page.getByRole('button', { name: '开始键盘练习' }).click();
  await page.locator('button.piano-key[data-pitch="1"]').click();
  await finishEarly(page);
  await page.getByRole('button', { name: '← 历史记录' }).click();
  await page.locator('[data-action="filter-module"][data-module="keyboard"]').click();
  await expect(page.locator('.history-row')).toHaveCount(3);
  await page.locator('[data-direction="name-to-key"]').click();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await page.locator('[data-direction="key-to-name"]').click();
  await expect(page.locator('.history-row')).toHaveCount(2);
});

test('Tab/Enter 可选择黑键；主动暂停和后台暂停保留原题、首次答案', async ({ page }) => {
  await setup(page);
  await page.keyboard.press('Tab'); await expect(page.locator('.white-key').first()).toBeFocused();
  // Focusing a white key must not raise it above an overlapping black key.
  expect(await page.locator('.black-key').first().evaluate(el => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.x + 2, r.y + r.height / 2) === el;
  })).toBe(true);
  await page.keyboard.press('Tab'); await expect(page.locator('.black-key').first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#feedback')).toContainText('正确');
  await page.keyboard.press('Enter');
  await expect(page.locator('#question-progress')).toHaveText('第 1 / 12 题');
  await expect(page.locator('[data-action="next"]')).toBeEnabled();
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await expect(page.locator('#question-progress')).toHaveText('第 2 / 12 题');
  const name = await page.locator('#question').textContent();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('恢复练习与声音');
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.locator('#question')).toHaveText(name!);
  await page.locator('button.piano-key[data-pitch="2"]').click();
  await page.evaluate(() => window.dispatchEvent(new Event('trainer:background')));
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.locator('.piano-key:disabled')).toHaveCount(12);
  await finishEarly(page);
  const record = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).sessions[0], storageKey);
  expect(record.answers).toHaveLength(2);
  expect(record.answers[0].reactionMs).not.toBeNull();
  expect(record.answers[1]).toMatchObject({ reactionMs: null, interruptedBeforeAnswer: true, correct: true });
});

for (const width of [320, 390, 1280]) {
  test(`${width}px：键盘两加三布局、黑键可点、反馈稳定且无横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await setup(page);
    await noOverflow(page);
    const whites = await page.locator('.white-key').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, width: r.width }; }));
    const blacks = await page.locator('.black-key').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, width: r.width }; }));
    for (const [i, boundary] of [1, 2, 4, 5, 6].entries()) {
      expect(Math.abs(blacks[i].x + blacks[i].width / 2 - whites[boundary].x)).toBeLessThan(1);
      expect(blacks[i].width).toBeGreaterThanOrEqual(24);
    }
    const before = await page.locator('[data-action="next"]').boundingBox();
    await page.locator('button.piano-key[data-pitch="10"]').click();
    await noOverflow(page);
    expect((await page.locator('[data-action="next"]').boundingBox())!.y).toBe(before!.y);
    await page.screenshot({ path: `${shots}/feedback-${width}.png`, fullPage: true });
    await finishEarly(page);
    await page.getByRole('button', { name: '← 历史记录' }).click();
    await page.locator('[data-action="filter-module"][data-module="keyboard"]').click();
    await noOverflow(page);
    await setup(page, 'key-to-name');
    await noOverflow(page);
    await page.locator('.answer[data-pitch="1"]').click();
    await noOverflow(page);
    await page.screenshot({ path: `${shots}/key-to-name-${width}.png`, fullPage: true });
  });
}

test('200% 文字重排后仍可辨认琴键、选择音名和进入下一题', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 450 });
  await setup(page, 'key-to-name');
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await noOverflow(page);
  await page.locator('.answer[data-pitch="1"]').click();
  await page.locator('[data-action="next"]').click();
  await expect(page.locator('#question-progress')).toHaveText('第 2 / 12 题');
});
