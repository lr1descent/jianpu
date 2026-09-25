import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.platform !== 'darwin') throw new Error('macOS 打包需要在 Mac 上执行。');
const project = fileURLToPath(new URL('..', import.meta.url));
const build = path.join(project, '.build/macos');
const output = path.join(project, 'artifacts/macos');
const bundle = path.join(output, '简谱唱名.app');
const contents = path.join(bundle, 'Contents');
const run = (command, args) => execFileSync(command, args, { cwd: project, stdio: 'inherit' });
mkdirSync(build, { recursive: true });
mkdirSync(output, { recursive: true });
run('npm', ['run', 'build']);
// Replace generated output only; source code and saved application data are untouched.
rmSync(bundle, { recursive: true, force: true });
mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
mkdirSync(path.join(contents, 'Resources'), { recursive: true });
run('xcrun', ['swiftc', '-O', '-target', 'arm64-apple-macos13.0', '-module-cache-path', path.join(build, 'ModuleCache'),
  'native/macos/App.swift', 'native/macos/StaticServer.swift', '-o', path.join(contents, 'MacOS/JianpuSolfege')]);
cpSync(path.join(project, 'native/macos/Info.plist'), path.join(contents, 'Info.plist'));
cpSync(path.join(project, 'dist'), path.join(contents, 'Resources/web'), { recursive: true });
cpSync(path.join(project, 'THIRD_PARTY_NOTICES.md'), path.join(contents, 'Resources/THIRD_PARTY_NOTICES.md'));
run('xcrun', ['swift', '-module-cache-path', path.join(build, 'ModuleCache'), 'native/macos/MakeIcon.swift', path.join(build, 'AppIcon.iconset')]);
run('iconutil', ['-c', 'icns', path.join(build, 'AppIcon.iconset'), '-o', path.join(contents, 'Resources/AppIcon.icns')]);
run('plutil', ['-lint', path.join(contents, 'Info.plist')]);
run('codesign', ['--force', '--sign', '-', '--identifier', 'local.jianpu.solfege', bundle]);
run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', bundle]);
const archive = path.join(output, '简谱唱名-macOS-AppleSilicon.zip');
rmSync(archive, { force: true });
run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', bundle, archive]);
writeFileSync(path.join(output, '使用说明.txt'), '简谱唱名 1.2.0\n\n适用：Apple Silicon（M 系列）Mac，macOS 13 或更新。\n解压后将“简谱唱名.app”拖到“应用程序”，双击运行。无需 Node.js、终端或外网。\n\n此版本采用本机临时签名，未经过 Apple Developer ID 签名和公证；跨设备分发时，macOS 可能需要你确认应用来源。\n设置和历史独立保存在此应用中，浏览器已有记录不会自动转入，也不会被改动。\n不要更改本机服务端口 41876，否则会改变历史数据的来源标识。\n');
console.log(`\n应用：${bundle}\n压缩包：${archive}`);
