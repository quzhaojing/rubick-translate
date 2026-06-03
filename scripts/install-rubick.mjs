/**
 * 安装到本机 Rubick，并将 logo 写为 file:// 绝对路径。
 * Rubick 命令列表不会解析 ./logo.png，相对路径会回退为 Rubick 默认图标。
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const rubickPluginsDir = path.join(
  process.env.APPDATA || '',
  'rubick',
  'rubick-plugins-new'
);
const localPluginPath = path.join(rubickPluginsDir, 'rubick-local-plugin.json');

function toFileUrl(windowsPath) {
  return `file:///${windowsPath.replace(/\\/g, '/')}`;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function getPkg() {
  return readJson(path.join(projectRoot, 'package.json'));
}

function patchLocalPlugin(logoFileUrl, pkg) {
  const local = readJson(localPluginPath);
  const entry = {
    name: pkg.name,
    pluginName: pkg.pluginName,
    description: pkg.description,
    author: pkg.author,
    main: pkg.main,
    logo: logoFileUrl,
    icon: logoFileUrl,
    version: pkg.version,
    preload: pkg.preload,
    homePage: pkg.homePage,
    pluginType: pkg.pluginType,
    features: pkg.features,
    isdownload: false,
    isloading: false
  };
  const idx = local.findIndex((p) => p.name === pkg.name);
  if (idx >= 0) local[idx] = entry;
  else local.push(entry);
  fs.writeFileSync(localPluginPath, JSON.stringify(local));
}

function main() {
  if (!fs.existsSync(rubickPluginsDir)) {
    throw new Error(`未找到 Rubick 插件目录: ${rubickPluginsDir}`);
  }

  execSync('npm pack --pack-destination .', { cwd: projectRoot, stdio: 'inherit' });
  const pkg = getPkg();
  const tgz = path.join(projectRoot, `${pkg.name}-${pkg.version}.tgz`);
  const tgzUrl = `file:${tgz.replace(/\\/g, '/')}`;

  execSync(`npm install "${tgzUrl}"`, { cwd: rubickPluginsDir, stdio: 'inherit' });

  const installedLogo = path.join(rubickPluginsDir, 'node_modules', pkg.name, 'logo.png');
  if (!fs.existsSync(installedLogo)) {
    throw new Error(`安装后未找到 logo: ${installedLogo}`);
  }

  const logoFileUrl = toFileUrl(installedLogo);
  patchLocalPlugin(logoFileUrl, pkg);

  console.log('\n已安装到 Rubick，logo 路径:');
  console.log(logoFileUrl);
  console.log('\n请重启 Rubick 后输入 translate 测试图标。');
}

main();
