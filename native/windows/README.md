# Windows 便携版

目标为 Windows 10/11 x64（Intel/AMD），生成单个便携 EXE。应用包含 Chromium、前端生产构建、八份钢琴采样及许可证，运行不依赖 Node.js、WebView2 或联网。便携启动器先解压到系统临时目录，退出后清理运行时，历史保存在 `%APPDATA%\JianpuSolfege`。

`main.cjs` 负责窗口、键盘缩放、退出确认及后台暂停；`preload.cjs` 仅报告是否存在进行中的轮次，不把 Node 或 IPC 暴露给页面。`protocol.cjs` 通过固定 `jianpu://trainer/` 来源提供包内资源。Windows 首发采用独立来源，Mac 的 bundle ID、HTTP 端口和历史来源保持原样；不自动跨平台同步。

```sh
npm ci
npm run package:windows
npm run test:windows
npm run test:desktop
```

输出文件：`artifacts/windows/简谱唱名-0.1.2-Windows-x64.exe`、同名 SHA-256 文件及使用说明。构建只包含前端产物和桌面入口，不打入源代码、测试或多余的 node_modules。图标复用原 Mac 图标的 256px 图像，ICO 只是相同 PNG 的 Windows 容器。

首次构建会从官方 Electron / Electron Builder 发布源下载运行时和 NSIS 工具。构建版本固定在 package-lock.json；没有原生 Node 扩展。`signExecutable: false` 仅明确跳过商业签名，保留图标和版本资源。生成文件未签名，Windows 可能显示未知发布者。

## 方案依据

本地约束是 Apple Silicon Mac 上生成 Windows 单文件程序，同时保持离线音频和原有网页逻辑。读取官方 GitHub 仓库搜索、跨平台构建文档和当前安装版本的 `winPackager` / `resEdit` / `portable.nsi` 源码后，采用 Electron Builder 的 portable target。

| 项目 | 检索时信息（2026-09-26） | 本项目采用部分 |
| --- | --- | --- |
| [electron-userland/electron-builder](https://github.com/electron-userland/electron-builder) | 14,669 Stars、1,887 forks；TypeScript、MIT；未归档，2026-09-26 仍有更新 | Windows x64 运行时打包、跨平台 PE 资源编辑及 NSIS portable 启动器；不使用自动更新、发布或安装器框架 |

依据：[跨平台构建文档](https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/multi-platform-build.md)、[portable 模板](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/templates/nsis/portable.nsi)。固定使用 Electron 44.4.5、Builder 26.15.3；当前 Builder 使用 JavaScript 修改 PE 图标与版本资源，该配置不要求 Wine 或商业签名证书。

## 验证边界

`test:windows` 检查自定义协议和实际 EXE 的 PE 架构、完整解包、ASAR 一致性、所有前端文件及八份音频哈希。`test:desktop` 使用同一份交付 ASAR，覆盖新用户目录、双音与答后重播、键盘、200% 缩放、暂停、关闭确认、隔离权限及退出重开后历史持久化。

桌面测试使用构建主机的 Electron 运行时；在 macOS 上执行不等于 Windows GUI 验收。当前没有 Windows 真机/虚拟机启动、Windows 声卡输出、SmartScreen 或跨机器签名信任的测试证据。实际结果记录在项目根目录 `ACCEPTANCE.md`。
