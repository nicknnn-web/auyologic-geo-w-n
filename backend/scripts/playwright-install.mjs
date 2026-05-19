/**
 * postinstall：把浏览器装进 node_modules（PLAYWRIGHT_BROWSERS_PATH=0）
 * 本地可设环境变量 SKIP_PLAYWRIGHT_INSTALL=1 跳过
 */
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

if (process.env.SKIP_PLAYWRIGHT_INSTALL === '1') {
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const r = spawnSync(cmd, ['playwright', 'install', '--with-deps'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

process.exit(r.status === 0 ? 0 : r.status ?? 1);
