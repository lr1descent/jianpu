# 第三方资源

## 钢琴采样

本应用采用 **Salamander Grand Piano，作者 Alexander Holm（axeldenstore）**，许可证 **Creative Commons Attribution 3.0 Unported（CC BY 3.0）**。

- 原音源及许可声明：https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html
- MP3 托管与取得来源：https://tonejs.github.io/audio/salamander/
- 对应 Tone.js 官方示例：https://github.com/Tonejs/Tone.js/blob/dev/examples/sampler.html
- 许可正文：https://creativecommons.org/licenses/by/3.0/legalcode
- 本地许可副本：`public/audio/piano/CC-BY-3.0.txt`
- 取得日期：2026-09-25。

使用 C4、D♯4、F♯4、A4、C5、D♯5、F♯5、A5 八份 MP3，覆盖 MIDI 60—82；本项目未对下载文件裁剪或转码。运行时由 Sampler 根据实际 MIDI 音高移调并施加音量及释放包络。来源、字节数及 SHA-256 见同目录 `manifest.json`，准备脚本为 `scripts/prepare-audio.mjs`。

Tone.js 所托管 MP3 是该音源的转码版本；作者/许可依据 FreePats 的原音源说明，MP3 元数据本身未嵌入完整许可。未采用或分发 Apple、GarageBand、Logic 或商业音源中的音频资源。

## 软件、字体与图标

Tone.js、Vite、TypeScript、Vitest、Playwright 及其依赖遵循各软件包内许可证（依赖版本见锁文件）。Tone.js 使用 MIT 许可证。本项目不分发 Apple 字体，不请求外部字体；全部文本使用设备系统字体。没有外部图标库或装饰插画。
