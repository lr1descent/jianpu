import { PIANO_DEFAULT_MIDI, PIANO_KEYS, PIANO_WHITE_KEYS } from './free-piano';
import { soundControl } from './views';
import type { Settings } from './types';

export interface SingingPreferences { showNames: boolean; position: number }
export const DEFAULT_SINGING_PREFERENCES: SingingPreferences = {
  showNames: true, position: PIANO_KEYS.find(key => key.midi === PIANO_DEFAULT_MIDI)!.position,
};
export function singingView(settings: Settings, preferences: SingingPreferences) {
  return `<main class="page singing-page" id="main">
    <div class="singing-intro"><button type="button" class="button plain back" data-action="home">← 返回首页</button>
      <div class="page-heading"><h1 tabindex="-1">模唱练耳</h1><p class="secondary-text">弹一个音，听清楚，再跟着唱。拖动下方滑杆，切换到不同音区。</p></div></div>
    <section class="singing-piano ${preferences.showNames ? '' : 'hide-note-names'}" aria-label="模唱钢琴">
      <div class="singing-workspace">
        <div class="singing-toolbar">
          <label class="check-row singing-names"><input type="checkbox" id="singing-names" role="switch" ${preferences.showNames ? 'checked' : ''} />显示音名</label>
          ${soundControl(settings)}
          <button type="button" class="button singing-enter" data-piano-action="enter">横屏沉浸</button>
          <button type="button" class="button singing-exit" data-piano-action="exit" hidden>退出沉浸</button>
        </div>
        <div class="singing-status-row"><p id="singing-status" role="status" aria-live="polite">正在准备钢琴音色…</p><button type="button" class="button" data-piano-action="enable" hidden>启用声音</button></div>
        <div class="singing-viewport" aria-label="钢琴键盘，可用下方滑杆移动音区">
          <div class="singing-keys" role="group" aria-label="A0 至 C8，88 键钢琴" style="--white-count:${PIANO_WHITE_KEYS.length}">
            ${PIANO_KEYS.map(key => `<button type="button" class="free-key ${key.black ? 'free-black' : 'free-white'}" data-midi="${key.midi}" style="--position:${key.position}" aria-label="${key.names.join(' / ')}" tabindex="${key.midi === PIANO_DEFAULT_MIDI ? 0 : -1}" disabled>
              <span class="free-key-name" aria-hidden="true">${key.names.map(name => `<span>${name}</span>`).join('')}</span></button>`).join('')}
          </div>
        </div>
        <div class="singing-scrollbar">
          <div class="singing-range-label"><label for="singing-position">键盘位置</label><output id="singing-range">C4 起</output></div>
          <input type="range" id="singing-position" min="0" max="${PIANO_WHITE_KEYS.length - 1}" step="0.01" value="${preferences.position}" aria-describedby="singing-scroll-hint" />
          <div class="singing-range-ends" aria-hidden="true"><span>A0 · 低音</span><span>C8 · 高音</span></div>
        </div>
        <p class="singing-display-notice" id="singing-display-notice" role="status" hidden></p>
      </div>
    </section>
    <p class="field-hint singing-help" id="singing-scroll-hint">拖动滑杆移动琴键。按住琴键发声，松开释放；也可用左右方向键选键，空格或 Enter 弹奏。</p>
  </main>`;
}
