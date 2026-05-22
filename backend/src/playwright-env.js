/**
 * 必须在任何 `import ... playwright` 的模块之前加载。
 * 否则运行时会去 ~/.cache/ms-playwright 找浏览器，Zeabur 等环境构建产物里没有该目录。
 */
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, '..');
const repoRoot = join(backendRoot, '..');

// 按 cwd 加载一次，再显式加载 backend/.env 与项目根 .env（避免从仓库根启动时读不到 backend/.env）
dotenv.config();
for (const p of [join(backendRoot, '.env'), join(repoRoot, '.env')]) {
  if (existsSync(p)) dotenv.config({ path: p, override: false });
}

const v = process.env.PLAYWRIGHT_BROWSERS_PATH;
if (v === undefined || v === '') {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
}
