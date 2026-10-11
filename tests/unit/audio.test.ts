import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  context: { state: 'running', on: vi.fn() }, start: vi.fn(), attack: vi.fn(), stop: vi.fn(), dispose: vi.fn(),
  ramp: vi.fn(), constructors: vi.fn(), failSample: false,
  press: vi.fn(), release: vi.fn(),
}));
vi.mock('tone', () => ({
  start: state.start,
  getContext: () => state.context,
  now: () => 5,
  immediate: () => 4.9,
  Gain: class { gain = { rampTo: state.ramp }; toDestination() { return this; } },
  Sampler: class {
    loaded = false;
    constructor(options: { onload: () => void; onerror: () => void }) {
      state.constructors(options);
      queueMicrotask(() => { if (state.failSample) options.onerror(); else { this.loaded = true; options.onload(); } });
    }
    connect() { return this; }
    triggerAttackRelease = state.attack;
    triggerAttack = state.press;
    triggerRelease = state.release;
    releaseAll = state.stop;
    dispose = state.dispose;
  },
}));
import { Piano } from '../../src/audio';
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('window', globalThis); state.failSample = false; state.context.state = 'running'; state.start.mockResolvedValue(undefined); });
afterEach(() => vi.useRealTimers());
it('用户手势初始化、八个本地锚点、MIDI69 显式转 440Hz，重听先释放旧声', async () => {
  const piano = new Piano();
  expect(piano.status).toBe('idle');
  await Promise.all([piano.initialize(), piano.initialize()]);
  expect(state.constructors).toHaveBeenCalledTimes(1);
  const config = state.constructors.mock.calls[0][0];
  expect(config.baseUrl).toBe('/audio/piano/'); expect(Object.keys(config.urls)).toHaveLength(8);
  expect(piano.status).toBe('ready');
  vi.useFakeTimers();
  const cancelled = piano.play(69); const current = piano.play(69);
  await expect(cancelled).resolves.toBe(false);
  await vi.advanceTimersByTimeAsync(200);
  expect(state.attack).toHaveBeenLastCalledWith(440, .8, 5, .65);
  expect(state.attack).toHaveBeenCalledTimes(1);
  expect(state.stop).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1080);
  await expect(current).resolves.toBe(true);
});
it('参考 do 与目标音分开播放，间隔稳定，包含 do-do 同音题并等待尾音结束', async () => {
  const piano = new Piano(); await piano.initialize(); vi.useFakeTimers();
  let finished = false;
  const pair = piano.playPair(62, 62).then(value => { finished = value; });
  await vi.advanceTimersByTimeAsync(200);
  expect(state.attack).toHaveBeenCalledTimes(1);
  expect(state.attack.mock.calls[0][0]).toBe(midiToHzForTest(62));
  await vi.advanceTimersByTimeAsync(1229); expect(state.attack).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect(state.attack).toHaveBeenCalledTimes(2);
  expect(state.attack.mock.calls[1][0]).toBe(midiToHzForTest(62));
  await vi.advanceTimersByTimeAsync(1079); expect(finished).toBe(false);
  await vi.advanceTimersByTimeAsync(1); await pair; expect(finished).toBe(true);
});
it('参考音后暂停会取消目标音和完成通知，恢复只能显式重播完整一对', async () => {
  const piano = new Piano(); await piano.initialize(); vi.useFakeTimers();
  const old = piano.playPair(66, 77);
  await vi.advanceTimersByTimeAsync(200); piano.stop();
  await expect(old).resolves.toBe(false);
  await vi.advanceTimersByTimeAsync(5000); expect(state.attack).toHaveBeenCalledTimes(1);
  const resumed = piano.playPair(66, 77);
  await vi.runAllTimersAsync(); await expect(resumed).resolves.toBe(true);
  expect(state.attack.mock.calls.map(call => call[0])).toEqual([66, 66, 77].map(midiToHzForTest));
});
const midiToHzForTest = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
it('采样失败显式报错、释放失效采样，重试可成功', async () => {
  const piano = new Piano(); state.failSample = true;
  await expect(piano.initialize()).rejects.toThrow('未能加载本地钢琴采样');
  expect(piano.status).toBe('error'); expect(state.dispose).toHaveBeenCalledTimes(1);
  state.failSample = false; await piano.initialize(); expect(piano.status).toBe('ready');
});
it('主动静音可无采样继续；非主动静音时挂起必须报错并发出中断通知', async () => {
  const piano = new Piano(); piano.setVolume(.3, true); expect(() => piano.play(60)).not.toThrow();
  expect(state.attack).not.toHaveBeenCalled();
  await piano.initialize(); piano.setVolume(.3, false); state.context.state = 'suspended';
  expect(() => piano.play(60)).toThrow('声音尚未就绪');
  const interrupted = vi.fn(); piano.onInterruption = interrupted;
  state.context.on.mock.calls[0][1](); expect(interrupted).toHaveBeenCalledOnce();
});
it('自由弹奏直接按下/释放指定音，快速连续按键不截断其他键或改变练习时序', async () => {
  const piano = new Piano(); await piano.initialize(); vi.useFakeTimers();
  expect(piano.press(48)).toBe(true);
  expect(piano.press(60)).toBe(true);
  expect(piano.press(61)).toBe(true);
  expect(state.press.mock.calls.map(call => call[0])).toEqual([48, 60, 61].map(midiToHzForTest));
  expect(state.press).toHaveBeenLastCalledWith(midiToHzForTest(61), 4.9, .65);
  expect(state.stop).not.toHaveBeenCalled();
  piano.release(60);
  expect(state.release).toHaveBeenCalledExactlyOnceWith(midiToHzForTest(60), 4.9);
  piano.stop();
  expect(state.stop).toHaveBeenCalledOnce();
  const quiz = piano.play(69);
  expect(state.attack).not.toHaveBeenCalled();
  await vi.runAllTimersAsync(); await expect(quiz).resolves.toBe(true);
  expect(state.attack).toHaveBeenLastCalledWith(440, .8, 5, .65);
});
it('自由弹奏静音不发声，未准备和音频挂起明确报错', async () => {
  const piano = new Piano();
  expect(() => piano.press(60)).toThrow('声音尚未就绪');
  await piano.initialize(); piano.press(60);
  piano.setVolume(.3, true);
  expect(piano.press(62)).toBe(false);
  expect(state.press).toHaveBeenCalledOnce();
  expect(state.stop).toHaveBeenCalledOnce();
  piano.setVolume(.3, false); state.context.state = 'suspended';
  expect(() => piano.press(60)).toThrow('声音尚未就绪');
});
