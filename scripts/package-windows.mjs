import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build, Platform, Arch } from 'electron-builder';

const project = fileURLToPath(new URL('..', import.meta.url));
const { version, devDependencies } = JSON.parse(readFileSync(path.join(project, 'package.json'), 'utf8'));
const staging = path.join(project, '.build/windows/app');
const output = path.join(project, 'artifacts/windows');
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: project, stdio: 'inherit', shell: process.platform === 'win32' });
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
mkdirSync(output, { recursive: true });
cpSync(path.join(project, 'native/windows'), staging, { recursive: true });
cpSync(path.join(project, 'dist'), path.join(staging, 'web'), { recursive: true });
cpSync(path.join(project, 'THIRD_PARTY_NOTICES.md'), path.join(staging, 'THIRD_PARTY_NOTICES.md'));
writeFileSync(path.join(staging, 'package.json'), JSON.stringify({
  name: 'jianpu-solfege-windows', productName: '简谱唱名', version, main: 'main.cjs',
  description: '简谱识读与相对音程练习', author: 'Jianpu Solfege Trainer', private: true,
}, null, 2));
const filename = `简谱唱名-${version}-Windows-x64.exe`;
await build({
  projectDir: project, targets: Platform.WINDOWS.createTarget(['portable'], Arch.x64), publish: 'never',
  config: {
    appId: 'local.jianpu.solfege.windows', productName: '简谱唱名', buildVersion: `${version}.3`,
    electronVersion: devDependencies.electron, directories: { app: staging, output },
    asar: true, npmRebuild: false, files: ['**/*', '!node_modules/**'],
    win: { target: 'portable', icon: path.join(project, 'native/windows/icon.ico'), signExecutable: false },
    portable: { artifactName: filename, requestExecutionLevel: 'user' },
  },
});
const exe = path.join(output, filename);
const digest = createHash('sha256').update(readFileSync(exe)).digest('hex');
writeFileSync(path.join(output, `${filename}.sha256`), `${digest}  ${filename}\n`);
writeFileSync(path.join(output, '使用说明.txt'), `简谱唱名 ${version} · Windows 便携版\n\n适用：Windows 10/11，64 位 Intel/AMD 电脑。\n双击“${filename}”即可运行，无需安装 Node.js、WebView2 或联网。首次运行需等待内置运行时解压到临时目录。\n\n两个模块均有练习和考试，选答后自动重播。Tab、空格/Enter 操作，Ctrl + / Ctrl - 缩放，Ctrl 0 还原。切换窗口或最小化后暂停，回来点继续。\n\n历史和设置保存在 %APPDATA%\\JianpuSolfege，移动或更换 EXE 不会清除。浏览器、Mac 和 Windows 的数据独立，不会自动同步。\n\n此 EXE 未进行商业代码签名，Windows 可能显示未知发布者提示。发布包内置页面、钢琴采样与许可证。\n`);
console.log(`\nWindows 可执行程序：${exe}\nSHA-256：${digest}`);
