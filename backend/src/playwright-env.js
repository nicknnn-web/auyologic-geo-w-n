/**
 * 必须在任何 `import ... playwright` 的模块之前加载。
 * 否则运行时会去 ~/.cache/ms-playwright 找浏览器，Zeabur 等环境构建产物里没有该目录。
 */
import 'dotenv/config';

const v = process.env.PLAYWRIGHT_BROWSERS_PATH;
if (v === undefined || v === '') {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
}
