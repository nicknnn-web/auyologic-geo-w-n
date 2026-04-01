/**
 * 由 index.js 子进程启动：从 stdin 读 JSON taskInfo，stdout 输出 JSON 结果
 * 发布逻辑：优先 ./src/services/playwrightPublisher.js（zip 包内），否则 ../src/...（仓库内）
 */
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadPublisher() {
  const bundled = join(__dirname, 'src', 'services', 'playwrightPublisher.js');
  const repo = join(__dirname, '..', 'src', 'services', 'playwrightPublisher.js');
  const pubPath = fs.existsSync(bundled) ? bundled : repo;
  if (!fs.existsSync(pubPath)) {
    throw new Error(`找不到 playwrightPublisher.js: ${pubPath}`);
  }
  return import(pathToFileURL(pubPath).href);
}

async function main() {
  // playwrightPublisher 里 appendLog 用 console.log，会混进 stdout，父进程无法解析 JSON
  console.log = (...args) => console.error('[publish]', ...args);

  const { runPublishAndCollectLog } = await loadPublisher();

  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    process.stdout.write(JSON.stringify({ success: false, error: 'empty stdin', log: '' }));
    return;
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.stdout.write(JSON.stringify({ success: false, error: 'invalid JSON stdin', log: '' }));
    return;
  }

  const taskInfo = {
    taskId: payload.taskId,
    platform: payload.platform,
    sessionState: payload.sessionState,
    content: payload.content || '',
    title: payload.title || '',
    tags: payload.tags || '',
    imagePaths: payload.imagePaths || undefined,
  };

  const result = await runPublishAndCollectLog(taskInfo);
  process.stdout.write(JSON.stringify(result));
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ success: false, error: err.message, log: '' }));
});
