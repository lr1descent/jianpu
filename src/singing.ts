import type { PianoAudio } from './audio';
import { PIANO_DEFAULT_MIDI, PIANO_KEYS, PIANO_WHITE_KEYS } from './free-piano';
import type { SingingPreferences } from './singing-view';

interface SingingOptions {
  root: HTMLElement;
  audio: Pick<PianoAudio, 'initialize' | 'press' | 'release' | 'stop' | 'status'>;
  preferences: SingingPreferences;
  onPreference: (preferences: SingingPreferences) => void;
  isMuted: () => boolean;
}
export function mountSinging({ root, audio, preferences, onPreference, isMuted }: SingingOptions) {
  const query = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const viewport = query<HTMLDivElement>('.singing-viewport');
  const workspace = query<HTMLDivElement>('.singing-workspace');
  const slider = query<HTMLInputElement>('#singing-position');
  const names = query<HTMLInputElement>('#singing-names');
  const status = query<HTMLParagraphElement>('#singing-status');
  const enable = query<HTMLButtonElement>('[data-piano-action="enable"]');
  const enter = query<HTMLButtonElement>('[data-piano-action="enter"]');
  const exit = query<HTMLButtonElement>('[data-piano-action="exit"]');
  const notice = query<HTMLParagraphElement>('#singing-display-notice');
  const keys = [...root.querySelectorAll<HTMLButtonElement>('[data-midi]')];
  const held = new Map<string, number>();
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let state = { ...preferences };
  let ready = false;
  let disposed = false;
  let audioOperation = 0;
  let displayOperation = 0;
  let immersive = false;
  let fullscreenEntered = false;
  let whiteWidth = 64;
  let focusedMidi = PIANO_DEFAULT_MIDI;
  let clickSequence = 0;
  const save = (changes: Partial<SingingPreferences>) => { state = { ...state, ...changes }; onPreference(state); };
  const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
  const keyFor = (midi: number) => keys[midi - PIANO_KEYS[0].midi];

  function stopHeld() {
    held.clear();
    keys.forEach(key => key.classList.remove('is-pressed'));
    audio.stop();
  }
  function setReady(value: boolean) {
    ready = value;
    root.dataset.audioReady = String(value);
    keys.forEach(key => { key.disabled = !value; });
  }
  function soundStatus() {
    status.textContent = isMuted() ? '当前已静音，请在音量设置中开启声音。' : '钢琴已就绪，弹一个音，跟着唱。';
  }
  function failSound(error: unknown) {
    stopHeld();
    setReady(false);
    status.textContent = errorText(error);
    enable.hidden = false;
  }
  async function prepare() {
    const operation = ++audioOperation;
    setReady(false);
    enable.hidden = true;
    status.textContent = '正在准备钢琴音色…';
    try {
      await audio.initialize();
      if (disposed || operation !== audioOperation) return;
      setReady(true);
      soundStatus();
    } catch (error) { if (!disposed && operation === audioOperation) failSound(error); }
  }
  function press(source: string, midi: number) {
    if (!ready || held.has(source)) return;
    if (isMuted()) { soundStatus(); return; }
    try {
      if (![...held.values()].includes(midi) && !audio.press(midi)) return;
      held.set(source, midi);
      keyFor(midi).classList.add('is-pressed');
    } catch (error) { failSound(error); }
  }
  function release(source: string) {
    const midi = held.get(source);
    if (midi === undefined) return;
    held.delete(source);
    if (![...held.values()].includes(midi)) {
      keyFor(midi).classList.remove('is-pressed');
      audio.release(midi);
    }
  }
  function updateRange() {
    const first = Math.min(PIANO_WHITE_KEYS.length - 1, Math.floor(viewport.scrollLeft / whiteWidth + .01));
    const last = Math.min(PIANO_WHITE_KEYS.length - 1, Math.ceil((viewport.scrollLeft + viewport.clientWidth) / whiteWidth - .01) - 1);
    const text = `${PIANO_WHITE_KEYS[first].names[0]} – ${PIANO_WHITE_KEYS[Math.max(first, last)].names[0]}`;
    slider.value = String(viewport.scrollLeft / whiteWidth);
    slider.setAttribute('aria-valuetext', text);
    query<HTMLOutputElement>('#singing-range').textContent = text;
    save({ position: viewport.scrollLeft / whiteWidth });
  }
  function resize() {
    const position = state.position;
    // Keep at least a useful octave visible; landscape fits more keys without tiny touch targets.
    const visibleWhites = immersive ? Math.max(7, Math.floor(viewport.clientWidth / 58)) : Math.max(7, Math.floor(viewport.clientWidth / 64));
    whiteWidth = Math.max(40, viewport.clientWidth / visibleWhites);
    root.style.setProperty('--white-width', `${whiteWidth}px`);
    root.style.setProperty('--black-width', `${Math.max(25, whiteWidth * .6)}px`);
    slider.max = String(Math.max(0, PIANO_WHITE_KEYS.length - viewport.clientWidth / whiteWidth));
    viewport.scrollLeft = position * whiteWidth;
    updateRange();
  }
  function focusKey(midi: number) {
    const key = keyFor(midi);
    keyFor(focusedMidi).tabIndex = -1;
    focusedMidi = midi;
    key.tabIndex = 0;
    const left = key.offsetLeft, right = left + key.offsetWidth;
    if (left < viewport.scrollLeft) viewport.scrollLeft = left;
    else if (right > viewport.scrollLeft + viewport.clientWidth) viewport.scrollLeft = right - viewport.clientWidth;
    key.focus({ preventScroll: true });
  }
  function setImmersive(value: boolean) {
    immersive = value;
    root.classList.toggle('is-immersive', value);
    document.body.classList.toggle('singing-immersive', value);
    enter.hidden = value;
    exit.hidden = !value;
    for (const sibling of root.parentElement!.children) if (sibling !== root && sibling instanceof HTMLElement) sibling.inert = value;
    if (!value) { notice.hidden = true; fullscreenEntered = false; }
    resize();
    (value ? exit : enter).focus({ preventScroll: true });
  }
  function displayNotice(text: string) { notice.textContent = text; notice.hidden = false; }
  async function enterImmersive() {
    if (immersive) return;
    const operation = ++displayOperation;
    stopHeld();
    root.querySelector<HTMLDetailsElement>('.sound-control')!.open = false;
    setImmersive(true);
    if (!document.fullscreenEnabled || !root.requestFullscreen) {
      displayNotice('当前浏览器不支持系统全屏，已进入页面沉浸模式。');
      return;
    }
    try {
      await root.requestFullscreen();
      if (disposed || operation !== displayOperation) {
        if (document.fullscreenElement === root) await document.exitFullscreen();
        return;
      }
      fullscreenEntered = true;
    } catch (error) {
      if (!disposed && operation === displayOperation) displayNotice(`系统全屏未开启：${errorText(error)}。当前使用页面沉浸模式。`);
    }
  }
  async function exitImmersive() {
    ++displayOperation;
    stopHeld();
    if (document.fullscreenElement === root) {
      try { await document.exitFullscreen(); }
      catch (error) { displayNotice(`退出全屏失败：${errorText(error)}。可使用浏览器的退出全屏操作。`); return; }
    }
    if (!disposed) setImmersive(false);
  }
  root.addEventListener('pointerdown', event => {
    const key = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-midi]');
    if (!key || key.disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    const midi = Number(key.dataset.midi);
    focusKey(midi);
    key.setPointerCapture(event.pointerId);
    press(`pointer:${event.pointerId}`, midi);
  }, options);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    root.addEventListener(type, event => release(`pointer:${event.pointerId}`), options);
  }
  root.addEventListener('keydown', event => {
    const key = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-midi]');
    if (!key) return;
    const midi = Number(key.dataset.midi);
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const offset = event.key === 'ArrowLeft' ? -1 : 1;
      focusKey(event.key === 'Home' ? PIANO_KEYS[0].midi : event.key === 'End' ? PIANO_KEYS.at(-1)!.midi : Math.min(PIANO_KEYS.at(-1)!.midi, Math.max(PIANO_KEYS[0].midi, midi + offset)));
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (!event.repeat) press(`key:${event.key}`, midi);
    }
  }, options);
  document.addEventListener('keyup', event => release(`key:${event.key}`), options);
  root.addEventListener('focusout', () => {
    for (const source of held.keys()) if (source.startsWith('key:')) release(source);
  }, options);
  root.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!target || target.disabled) return;
    if (target.dataset.pianoAction === 'enter') void enterImmersive();
    if (target.dataset.pianoAction === 'exit') void exitImmersive();
    if (target.dataset.pianoAction === 'enable') void prepare();
    // Assistive technologies can activate a button without pointer or keyboard events.
    if (target.dataset.midi && event.detail === 0 && !event.defaultPrevented) {
      const midi = Number(target.dataset.midi);
      const source = `click:${++clickSequence}`;
      press(source, midi);
      window.setTimeout(() => { if (!disposed) release(source); }, 350);
    }
  }, options);
  slider.addEventListener('input', () => { stopHeld(); viewport.scrollLeft = Number(slider.value) * whiteWidth; updateRange(); }, options);
  viewport.addEventListener('scroll', updateRange, options);
  names.addEventListener('change', () => { root.classList.toggle('hide-note-names', !names.checked); save({ showNames: names.checked }); }, options);
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === root) fullscreenEntered = true;
    else if (immersive && fullscreenEntered) { stopHeld(); setImmersive(false); }
  }, options);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && immersive && !document.fullscreenElement) void exitImmersive();
  }, options);
  window.addEventListener('blur', stopHeld, options);
  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  observer.observe(workspace);
  resize();
  void prepare();
  return {
    soundUpdated() { if (isMuted()) stopHeld(); if (ready) soundStatus(); },
    interrupt(reason = '声音已暂停，点击启用声音后继续。') { ++audioOperation; failSound(reason); },
    dispose() {
      disposed = true;
      ++audioOperation;
      ++displayOperation;
      stopHeld();
      listeners.abort();
      observer.disconnect();
      document.body.classList.remove('singing-immersive');
    },
  };
}
