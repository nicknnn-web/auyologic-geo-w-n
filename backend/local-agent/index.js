'use strict';
/**
 * Auyologic 本地授权代理
 *
 * 用法：
 *   node index.js [服务器地址]
 *   例：node index.js https://auyologic.zeabur.app
 *
 * 打包 exe（需先 npm install -g pkg）：
 *   pkg index.js --target node18-win-x64 --output dist/auyologic-agent.exe
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const {
  startAuth,
  submitSmsCode,
  captureSession,
  isLoggedIn,
  closeSession,
  shouldKeepBrowserOpenAfterAuth,
} = require('./auth');

const CONFIG_PATH = path.join(
  process.env.APPDATA || process.env.HOME || __dirname,
  '.auyologic-agent.json'
);

// ---- 工具 ----

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, ans => { rl.close(); resolve(ans.trim()); });
  });
}

async function apiFetch(baseUrl, path, options = {}) {
  const url = baseUrl.replace(/\/$/, '') + path;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

// ---- 配置 ----

async function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch {}
  return null;
}

async function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

// ---- 授权流程 ----

async function handleAuthTask(BASE_URL, task) {
  const { accountId, platform, phoneNumber } = task;
  console.log(`\n📋 [任务开始] 平台: ${platform}  账号ID: ${accountId}`);

  const updateStatus = async (status) => {
    try {
      await apiFetch(BASE_URL, '/api/agent/update-status', {
        method: 'POST',
        body: JSON.stringify({ accountId, status }),
      });
    } catch (e) {
      console.warn('  状态上报失败:', e.message);
    }
  };

  try {
    console.log('  🌐 正在启动浏览器...');
    await startAuth(accountId, platform, phoneNumber, updateStatus);
    console.log('  ✅ 浏览器已打开，请在弹出的窗口中完成登录');

    // 等待循环：监听验证码、用户确认、取消、登录成功
    const startTime = Date.now();
    const TIMEOUT_MS = 10 * 60 * 1000;
    let done = false;
    let cancelled = false;

    while (!done && !cancelled && Date.now() - startTime < TIMEOUT_MS) {
      await sleep(2000);

      // 1. 自动检测登录成功（URL 变化）
      if (isLoggedIn(accountId)) {
        console.log('  🎉 检测到登录成功，正在自动捕获...');
        done = true;
        break;
      }

      // 2. 取服务端验证码
      try {
        const smsData = await apiFetch(BASE_URL, `/api/agent/sms-code/${accountId}`);
        if (smsData.code) {
          console.log(`  📱 收到验证码 ${smsData.code}，正在提交...`);
          await submitSmsCode(accountId, smsData.code);
          await updateStatus('submitting');
        }
      } catch (e) {
        console.warn('  取验证码失败:', e.message);
      }

      // 3. 检查用户确认 / 取消
      try {
        const checkData = await apiFetch(BASE_URL, `/api/agent/confirm-check/${accountId}`);
        if (checkData.cancelled) {
          cancelled = true;
          console.log('  ❌ 用户已取消授权');
        } else if (checkData.confirmed) {
          console.log('  ✅ 用户已确认完成登录，正在捕获...');
          done = true;
        }
      } catch (e) {
        console.warn('  确认检查失败:', e.message);
      }
    }

    if (done) {
      // 捕获 session
      try {
        const { storageState, userAgent } = await captureSession(accountId);
        await apiFetch(BASE_URL, '/api/agent/complete-auth', {
          method: 'POST',
          body: JSON.stringify({ accountId, storageState, userAgent }),
        });
        console.log('  ✅ 授权成功！登录状态已上传');
        if (shouldKeepBrowserOpenAfterAuth()) {
          console.log('  ℹ  浏览器未自动关闭，可在窗口内继续访问 mp.toutiao.com 等页面做对比');
        }
      } catch (err) {
        console.error('  ❌ 捕获登录状态失败:', err.message);
        await updateStatus('browser_opened');
        console.log('  ℹ  浏览器仍打开中，请确认登录后在页面上再次点击「我已完成登录」');
      }
    } else if (!cancelled) {
      console.log('  ⏰ 授权超时（10分钟）');
      await updateStatus('failed');
      await apiFetch(BASE_URL, '/api/agent/fail-auth', {
        method: 'POST',
        body: JSON.stringify({ accountId, error: '超时' }),
      }).catch(() => {});
      await closeSession(accountId);
    }

    if (cancelled) {
      await closeSession(accountId);
    }

  } catch (err) {
    console.error('  ❌ 授权流程出错:', err.message);
    try {
      await apiFetch(BASE_URL, '/api/agent/fail-auth', {
        method: 'POST',
        body: JSON.stringify({ accountId, error: err.message }),
      });
    } catch {}
    await closeSession(accountId).catch(() => {});
  }

  console.log(`  任务结束，继续等待新任务...\n`);
}

// ---- 投放发布（子进程跑 ESM + 服务端 playwrightPublisher） ----

function runPublishSubprocess(task, onLogChunk, hooks = {}) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'run-publish.mjs');
    const payload = JSON.stringify({
      taskId: task.taskId,
      platform: task.platform,
      sessionState: task.sessionState,
      content: task.content,
      title: task.title,
      tags: task.tags,
      coverImageUrl: task.coverImageUrl || '',
    });
    const child = spawn(process.execPath, [scriptPath], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' },
    });
    if (hooks.onSpawn) hooks.onSpawn(child);
    child.stdin.write(payload);
    child.stdin.end();
    let out = '';
    let errOut = '';
    let resolved = false;
    const finishWithResult = (parsed, fallback) => {
      if (resolved) return;
      resolved = true;
      if (parsed && typeof parsed === 'object' && 'success' in parsed) {
        resolve(parsed);
      } else {
        resolve(fallback);
      }
    };
    const tryResolveFromStdout = () => {
      const lines = out.split(/\r?\n/).filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i]);
          if (parsed && typeof parsed === 'object' && 'success' in parsed) {
            finishWithResult(parsed);
            return;
          }
        } catch { /* continue */ }
      }
    };
    child.stdout.on('data', (d) => {
      out += d.toString();
      tryResolveFromStdout();
    });
    child.stderr.on('data', (d) => {
      const text = d.toString();
      errOut += text;
      if (!onLogChunk) return;
      for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith('@@PUBLISH_LOG@@')) continue;
        try {
          const { chunk } = JSON.parse(line.slice('@@PUBLISH_LOG@@'.length));
          if (chunk) onLogChunk(chunk);
        } catch { /* ignore */ }
      }
    });
    child.on('close', () => {
      if (resolved) return;
      const trimmed = (out || '').trim();
      let parsed;
      try {
        parsed = JSON.parse(trimmed || '{}');
      } catch {
        const lines = trimmed.split(/\r?\n/).filter(Boolean);
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            parsed = JSON.parse(lines[i]);
            break;
          } catch { /* continue */ }
        }
      }
      finishWithResult(parsed, {
        success: false,
        error: errOut.trim() || trimmed.slice(0, 200) || '子进程输出无法解析',
        log: '',
      });
    });
  });
}

async function reportPublishComplete(BASE_URL, id, payload) {
  await apiFetch(BASE_URL, '/api/agent/complete-publish', {
    method: 'POST',
    body: JSON.stringify({ taskId: id, ...payload }),
  });
}

async function handlePublishTask(BASE_URL, task) {
  const id = task.taskId;
  console.log(`\n📤 [投放任务] #${id} 平台: ${task.platform}`);

  let accumulatedLog = '';
  let lastLogPushAt = 0;
  let childRef = null;
  let abandoned = false;
  let cancelPollTimer = null;

  const pushLogToServer = async (force) => {
    const now = Date.now();
    if (!force && now - lastLogPushAt < 1200) return;
    lastLogPushAt = now;
    try {
      await apiFetch(BASE_URL, '/api/agent/publish-log', {
        method: 'POST',
        body: JSON.stringify({ taskId: id, log: accumulatedLog }),
      });
    } catch (e) {
      console.warn('  日志上报失败:', e.message);
    }
  };

  const finishAbandoned = async () => {
    if (abandoned) return;
    abandoned = true;
    if (cancelPollTimer) clearInterval(cancelPollTimer);
    await pushLogToServer(true);
    try {
      await reportPublishComplete(BASE_URL, id, {
        success: false,
        publishedUrl: '',
        errorMessage: '用户已放弃投放',
        taskLog: accumulatedLog,
      });
    } catch (e) {
      console.warn('  放弃结果上报失败:', e.message);
    }
    console.log('  ⏹ 用户已放弃投放，任务已终止');
  };

  cancelPollTimer = setInterval(async () => {
    if (abandoned) return;
    try {
      const data = await apiFetch(BASE_URL, `/api/agent/publish-cancel-check/${id}`);
      if (data.cancelRequested) {
        if (childRef && !childRef.killed) childRef.kill('SIGTERM');
        await finishAbandoned();
      }
    } catch { /* ignore */ }
  }, 1500);

  try {
    const result = await runPublishSubprocess(
      task,
      (chunk) => {
        accumulatedLog += chunk;
        pushLogToServer(false);
      },
      { onSpawn: (child) => { childRef = child; } }
    );
    if (cancelPollTimer) clearInterval(cancelPollTimer);
    await pushLogToServer(true);

    if (abandoned || result.aborted) return;

    const success = result.success === true;
    await reportPublishComplete(BASE_URL, id, {
      success,
      publishedUrl: result.publishedUrl || '',
      errorMessage: result.error || '',
      taskLog: result.log || accumulatedLog,
    });
    if (success) {
      console.log(`  ✅ 投放完成: ${result.publishedUrl || '(无链接)'}`);
    } else {
      console.log(`  ❌ 投放失败: ${result.error || '未知错误'}`);
    }
  } catch (err) {
    if (cancelPollTimer) clearInterval(cancelPollTimer);
    if (abandoned) return;
    console.error('  ❌ 投放异常:', err.message);
    try {
      await reportPublishComplete(BASE_URL, id, {
        success: false,
        publishedUrl: '',
        errorMessage: err.message,
        taskLog: accumulatedLog,
      });
    } catch {}
  }

  console.log(`  继续等待新任务...\n`);
}

// ---- 主入口 ----

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   Auyologic 本地代理  v1.1.3         ║');
  console.log('╚══════════════════════════════════════╝\n');

  // 服务器地址：优先命令行参数 → 配置文件 → 交互输入
  let serverUrl = process.argv[2];
  let config = await loadConfig();

  if (!serverUrl && config && config.serverUrl) {
    serverUrl = config.serverUrl;
    console.log(`使用已保存的服务器地址: ${serverUrl}`);
  }

  if (!serverUrl) {
    console.log('首次运行，请输入服务器地址');
    serverUrl = await prompt('服务器地址（如 https://auyologic.zeabur.app）: ');
    if (!serverUrl) { console.error('未输入服务器地址，退出'); process.exit(1); }
    serverUrl = serverUrl.replace(/\/$/, '');
    await saveConfig({ serverUrl });
    console.log(`✅ 配置已保存至 ${CONFIG_PATH}\n`);
  }

  const BASE_URL = serverUrl.replace(/\/$/, '');

  // 测试连接
  try {
    await apiFetch(BASE_URL, '/api/health');
    console.log(`✅ 成功连接到服务器: ${BASE_URL}`);
  } catch (err) {
    console.error(`❌ 无法连接到服务器 ${BASE_URL}:`, err.message);
    console.error('请检查服务器地址是否正确，或服务器是否正常运行');
    process.exit(1);
  }

  // 发送心跳（每 10 秒一次）
  const heartbeat = async () => {
    try { await apiFetch(BASE_URL, '/api/agent/heartbeat', { method: 'POST' }); } catch {}
  };
  await heartbeat();
  const heartbeatTimer = setInterval(heartbeat, 10000);

  console.log('\n🚀 代理已启动（授权 + 本地投放）');
  console.log('（按 Ctrl+C 退出）\n');

  // 是否正在处理任务（防止并发）
  let busy = false;

  // 轮询：优先授权任务，其次投放队列（每 3 秒）
  const pollTimer = setInterval(async () => {
    if (busy) return;
    try {
      const data = await apiFetch(BASE_URL, '/api/agent/pending-task');
      if (data.task) {
        busy = true;
        await handleAuthTask(BASE_URL, data.task);
        busy = false;
        return;
      }
      const pub = await apiFetch(BASE_URL, '/api/agent/pending-publish');
      if (pub.task) {
        busy = true;
        await handlePublishTask(BASE_URL, pub.task);
        busy = false;
      }
    } catch (e) {
      // 网络抖动，忽略
    }
  }, 3000);

  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\n\n👋 代理已停止');
    clearInterval(heartbeatTimer);
    clearInterval(pollTimer);
    process.exit(0);
  });
}

main().catch(err => {
  console.error('启动失败:', err.message);
  process.exit(1);
});
