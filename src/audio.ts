import * as Tone from 'tone';
import { midiToHz } from './music';

export interface PianoAudio {
  initialize(): Promise<void>; play(midi: number): void; stop(): void;
  setVolume(volume: number, muted: boolean): void;
  onInterruption: (() => void) | null;
  readonly status: 'idle' | 'loading' | 'ready' | 'suspended' | 'error';
}
export class Piano implements PianoAudio {
  onInterruption: (() => void) | null = null;
  private sampler?: Tone.Sampler;
  private loading?: Promise<void>;
  private gain?: Tone.Gain;
  private volume = 0.3;
  private muted = false;
  private listening = false;
  private failed = false;
  get status(): PianoAudio['status'] {
    if (this.loading) return 'loading';
    if (this.failed) return 'error';
    if (!this.sampler?.loaded) return 'idle';
    return Tone.getContext().state === 'running' ? 'ready' : 'suspended';
  }
  async initialize() {
    // Called synchronously from the initiating user gesture before awaiting sample loading.
    this.failed = false;
    try { await Tone.start(); }
    catch (error) { this.failed = true; throw error; }
    if (Tone.getContext().state !== 'running') throw new Error('浏览器暂停了声音，请点击启用声音。');
    if (!this.listening) {
      this.listening = true;
      Tone.getContext().on('statechange', () => {
        if (Tone.getContext().state !== 'running') this.onInterruption?.();
      });
    }
    if (this.sampler?.loaded) return;
    if (!this.loading) {
      this.gain ??= new Tone.Gain(this.muted ? 0 : this.volume).toDestination();
      this.loading = new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('钢琴采样加载超时，请检查本地音频文件后重试。')), 15000);
        this.sampler = new Tone.Sampler({
          urls: { C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3', A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3', A5: 'A5.mp3' },
          baseUrl: '/audio/piano/', attack: 0.005, release: 0.18,
          onload: () => { clearTimeout(timeout); resolve(); },
          onerror: () => { clearTimeout(timeout); reject(new Error('未能加载本地钢琴采样。请确认 public/audio/piano 文件完整后重试。')); },
        }).connect(this.gain!);
      }).catch(error => { this.failed = true; this.sampler?.dispose(); this.sampler = undefined; throw error; })
        .finally(() => { this.loading = undefined; });
    }
    await this.loading;
  }
  play(midi: number) {
    if (this.muted) { this.stop(); return; }
    if (!this.sampler?.loaded || Tone.getContext().state !== 'running') throw new Error('声音尚未就绪，请点击启用声音。');
    this.stop();
    // The API consumes Hz. The short release ends before a new attack to avoid overlap.
    this.sampler.triggerAttackRelease(midiToHz(midi), 0.8, Tone.now() + 0.2, 0.65);
  }
  stop() { this.sampler?.releaseAll(Tone.now()); }
  setVolume(volume: number, muted: boolean) {
    this.volume = volume;
    this.muted = muted || volume === 0;
    if (this.gain) this.gain.gain.rampTo(this.muted ? 0 : volume, 0.04);
    if (this.muted) this.stop();
  }
}
