/**
 * 必须在任何 `import ... playwright` 的模块之前加载。
 * 否则运行时会去 ~/.cache/ms-playwright 找浏览器，Zeabur 等环境构建产物里没有该目录。
 *
 * dotenv 默认只读 process.cwd() 下的 .env；从仓库根目录启动时 cwd 不是 backend/，会读不到 backend/.env。
 * 此处先加载与「本包」同级的 backend/.env，再读 cwd 下的 .env 补全未声明的变量（后者不覆盖前者）。
 */
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendPkgEnv = join(__dirname, '..', '.env');
loadEnv({ path: backendPkgEnv });
loadEnv();

const v = process.env.PLAYWRIGHT_BROWSERS_PATH;
if (v === undefined || v === '') {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
}
