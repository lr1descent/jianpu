import { test, expect, type Page } from '@playwright/test';
import { Session } from '../../src/session';
import { KeyboardSession } from '../../src/keyboard-session';
import { DEFAULT_SETTINGS } from '../../src/storage';

declare global { interface Window { listAnimationCalls: number } }
const records = [
  ...(['notation', 'relative'] as const).flatMap(module => (['practice', 'exam'] as const).map(mode =>
    new Session({ module, mode, count: 7, key: 'C', muted: false }, () => 0, () => 0, `${module}-${mode}`).finish())),
  ...(['name-to-key', 'key-to-name'] as const).map(direction =>
    new KeyboardSession({ module: 'keyboard', mode: 'practice', count: 12, direction }, () => 0, () => 0, direction).finish()),
];
const visibleRows = (page: Page) => page.locator('.history-row:not([inert])');
async function history(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '历史记录', exact: true }).click();
  await expect(visibleRows(page)).toHaveCount(6);
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(data => {
    localStorage.setItem('jianpu-solfege-trainer', JSON.stringify(data));
    window.listAnimationCalls = 0;
    const original = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
      if (this.closest('#history-results')) window.listAnimationCalls++;
      return original.apply(this, args);
    };
  }, { schemaVersion: 4, settings: DEFAULT_SETTINGS, sessions: records });
});

test('筛选保留页面、按钮和同一记录节点，实际执行列表动画且不丢焦点', async ({ page }) => {
  await history(page);
  const main = await page.locator('main').elementHandle();
  const row = await page.locator('[data-id="name-to-key"]').elementHandle();
  const filter = page.locator('[data-action="filter-module"][data-module="keyboard"]');
  const button = await filter.elementHandle();
  await filter.click();
  await expect(visibleRows(page)).toHaveCount(2);
  expect(await main!.evaluate(el => el.isConnected)).toBe(true);
  expect(await row!.evaluate(el => el.isConnected)).toBe(true);
  expect(await button!.evaluate(el => el.isConnected)).toBe(true);
  await expect(filter).toBeFocused();
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.listAnimationCalls)).toBeGreaterThan(0);
  await expect(page.locator('#history-mode-filter')).toBeHidden();
  await expect(page.locator('#history-direction-filter')).toBeVisible();
  await page.locator('[data-direction="name-to-key"]').click();
  await expect(visibleRows(page)).toHaveCount(1);
  await visibleRows(page).click();
  await expect(page.getByRole('heading', { name: '键盘练习小结' })).toBeVisible();
});

test('快速切换、空结果和离开页面不会留下可点击的旧行或重复记录', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 844 });
  await history(page);
  await page.locator('[data-action="filter-module"][data-module="keyboard"]').click();
  await expect(page.locator('.history-row[inert]').first()).toHaveAttribute('aria-hidden', 'true');
  await page.evaluate(() => {
    for (const module of ['all', 'relative', 'notation', 'keyboard', 'all', 'keyboard']) {
      document.querySelector<HTMLButtonElement>(`[data-action="filter-module"][data-module="${module}"]`)!.click();
    }
  });
  await expect(visibleRows(page)).toHaveCount(2);
  expect((await visibleRows(page).evaluateAll(rows => rows.map(row => row.getAttribute('data-id')))).sort()).toEqual(['key-to-name', 'name-to-key']);
  await expect(page.locator('.history-row[inert]')).toHaveCount(0);
  await page.locator('[data-action="filter-module"][data-module="notation"]').click();
  await page.locator('[data-filter="reinforcement"]').click();
  await expect(page.locator('.empty-state:not([inert])')).toContainText('此筛选条件下还没有记录');
  await page.locator('[data-filter="all"]').click();
  await expect(visibleRows(page)).toHaveCount(2);
  await page.getByRole('button', { name: '简谱唱名', exact: true }).click();
  await page.getByRole('button', { name: '历史记录', exact: true }).click();
  await expect(visibleRows(page)).toHaveCount(2);
  await expect(page.locator('[inert]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('减少动态效果即时关闭列表和按压动画，运行中改回后可恢复', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await history(page);
  await page.locator('[data-action="filter-module"][data-module="keyboard"]').click();
  await expect(visibleRows(page)).toHaveCount(2);
  expect(await page.evaluate(() => window.listAnimationCalls)).toBe(0);
  expect(await page.locator('.history-filter button').first().evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('[data-action="filter-module"][data-module="all"]').click();
  await expect(visibleRows(page)).toHaveCount(6);
  await expect.poll(() => page.evaluate(() => window.listAnimationCalls)).toBeGreaterThan(0);
  await page.locator('[data-action="filter-module"][data-module="relative"]').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('[inert]')).toHaveCount(0);
  await expect(visibleRows(page)).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => document.querySelector('#history-results')!.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length)).toBe(0);
});

test('黑键按压不破坏横向定位，松开立即计分；减少动态效果下无缩放', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="keyboard-module"]').click();
  await page.locator('[data-action="start-keyboard"]').click();
  const key = page.locator('button.black-key').first();
  await expect(key).toBeEnabled();
  const before = (await key.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await expect.poll(() => key.evaluate(el => getComputedStyle(el).scale)).not.toBe('none');
  const pressed = (await key.boundingBox())!;
  expect(Math.abs(pressed.x - before.x)).toBeLessThan(1);
  expect(pressed.width).toBeCloseTo(before.width, 0);
  await page.mouse.up();
  await expect(page.locator('#running-summary')).toContainText('已答 1 题');
  await expect(page.locator('#feedback')).toBeFocused();
  await page.locator('[data-action="next"]').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await key.hover(); await page.mouse.down();
  expect(await key.evaluate(el => getComputedStyle(el).scale)).toBe('none');
  await page.mouse.up();
  await expect(page.locator('#running-summary')).toContainText('已答 2 题');
});
