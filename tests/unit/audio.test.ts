import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  context: { state: 'running', on: vi.fn() }, start: vi.fn(), attack: vi.fn(), stop: vi.fn(), dispose: vi.fn(),
  ramp: vi.fn(), constructors: vi.fn(), failSample: false,
}));
vi.mock('tone', () => ({
  start: state.start,
  getContext: () => state.context,
  now: () => 5,
  Gain: class { gain = { rampTo: state.ramp }; toDestination() { return this; } },
  Sampler: class {
    loaded = false;
    constructor(options: { onload: () => void; onerror: () => void }) {
      state.constructors(options);
      queueMicrotask(() => { if (state.failSample) options.onerror(); else { this.loaded = true; options.onload(); } });
    }
    connect() { return this; }
    triggerAttackRelease = state.attack;
    releaseAll = state.stop;
    dispose = state.dispose;
  },
}));
import { Piano } from '../../src/audio';
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('window', globalThis); state.failSample = false; state.context.state = 'running'; state.start.mockResolvedValue(undefined); });
it('用户手势初始化、八个本地锚点、MIDI69 显式转 440Hz，重听先释放旧声', async () => {
  const piano = new Piano();
  expect(piano.status).toBe('idle');
  await Promise.all([piano.initialize(), piano.initialize()]);
  expect(state.constructors).toHaveBeenCalledTimes(1);
  const config = state.constructors.mock.calls[0][0];
  expect(config.baseUrl).toBe('/audio/piano/'); expect(Object.keys(config.urls)).toHaveLength(8);
  expect(piano.status).toBe('ready');
  piano.play(69); piano.play(69);
  expect(state.attack).toHaveBeenLastCalledWith(440, .8, 5.2, .65);
  expect(state.stop).toHaveBeenCalledTimes(2);
  expect(state.stop.mock.invocationCallOrder[1]).toBeLessThan(state.attack.mock.invocationCallOrder[1]);
});
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
