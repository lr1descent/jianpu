import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
const tokens = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/g)].map(match => [match[1], match[2]]));
function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map(c => parseInt(c, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(first: string, second: string) {
  const a = luminance(tokens[first]), b = luminance(tokens[second]);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
it('最终主题：文字/辅助文字/按钮/反馈/锁定状态至少 4.5:1', () => {
  const pairs = [
    ...['canvas', 'surface', 'surface-subtle', 'accent-soft', 'success-soft', 'error-soft'].flatMap(bg => [['text-primary', bg], ['text-secondary', bg]]),
    ['surface', 'accent'], ['surface', 'accent-hover'], ['accent', 'surface'], ['accent', 'accent-soft'],
    ['success', 'surface'], ['error', 'surface'], ['disabled-text', 'disabled-bg'],
  ];
  for (const [fg, bg] of pairs) expect(contrast(fg, bg), `${fg} / ${bg}`).toBeGreaterThanOrEqual(4.5);
});
it('必要控件边界、选中、反馈与焦点至少 3:1', () => {
  const pairs = ['canvas', 'surface', 'surface-subtle', 'disabled-bg'].flatMap(bg => [['control-border', bg], ['focus', bg]]);
  pairs.push(['accent', 'accent-soft'], ['success', 'success-soft'], ['error', 'error-soft']);
  for (const [fg, bg] of pairs) expect(contrast(fg, bg), `${fg} / ${bg}`).toBeGreaterThanOrEqual(3);
});
