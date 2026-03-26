<template>
  <div class="login-page">
    <!-- 背景 -->
    <div class="bg-grid"></div>
    <div class="bg-glow"></div>
    <div class="shape shape-1"></div>
    <div class="shape shape-2"></div>
    <div class="shape shape-3"></div>
    <div class="shape shape-4"></div>

    <!-- 左侧装饰区 -->
    <div class="decorative-panel">
      <div class="brand-mark">
        <div class="brand-icon">
          <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
            <path d="M12 38L24 10L36 38" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M16 30H32" stroke="white" stroke-width="3" stroke-linecap="round"/>
          </svg>
        </div>
        <span class="brand-name">Auyologic GEO</span>
      </div>
      <h1 class="panel-title">GEO 内容智能引擎</h1>
      <p class="panel-desc">生成被 AI 搜索引擎优先收录的高权重内容，让每一次创作都被看见。</p>

      <div class="feature-list">
        <div class="feature-item">
          <div class="feature-dot"></div>
          <span>GEO 优化 · AI 智能生成</span>
        </div>
        <div class="feature-item">
          <div class="feature-dot"></div>
          <span>多平台一键发布</span>
        </div>
        <div class="feature-item">
          <div class="feature-dot"></div>
          <span>深度 SEO + GEO 双重优化</span>
        </div>
      </div>

      <div class="powered-badge">
        <span>Powered by DeepSeek AI</span>
      </div>
    </div>

    <!-- 右侧登录表单 -->
    <div class="login-panel">
      <div class="login-card" :class="{ 'card-entering': entering }">
        <div class="card-header">
          <h2>管理员登录</h2>
          <p>登录到 Auyologic GEO 控制台</p>
        </div>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          @submit.prevent="handleLogin"
          label-position="top"
        >
          <el-form-item prop="username" label="账号">
            <el-input
              v-model="form.username"
              placeholder="请输入管理员账号"
              size="large"
              :prefix-icon="User"
              clearable
            />
          </el-form-item>

          <el-form-item prop="password" label="密码">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              size="large"
              :prefix-icon="Lock"
              show-password
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <div class="form-options">
            <el-checkbox v-model="form.remember">记住登录状态</el-checkbox>
          </div>

          <el-button
            type="primary"
            size="large"
            class="login-btn"
            :loading="loading"
            @click="handleLogin"
          >
            {{ loading ? '验证中...' : '登录' }}
          </el-button>

          <div v-if="errorMsg" class="error-tip">
            <el-icon><CircleCloseFilled /></el-icon>
            {{ errorMsg }}
          </div>
        </el-form>

        <div class="login-footer">
          <span>安全加密连接 · 仅限授权用户访问</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock, CircleCloseFilled } from '@element-plus/icons-vue'

const router = useRouter()
const formRef = ref(null)
const loading = ref(false)
const errorMsg = ref('')
const entering = ref(false)

const form = reactive({
  username: '',
  password: '',
  remember: true,
})

const rules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

onMounted(() => {
  // 如果本地已登录，直接跳转
  if (localStorage.getItem('auyologic_token')) {
    router.replace('/')
    return
  }
  // 自动填入上次账号
  const savedUser = localStorage.getItem('auyologic_user')
  if (savedUser) form.username = savedUser
  // 触发动画
  setTimeout(() => { entering.value = true }, 50)
})

const handleLogin = async () => {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  loading.value = true
  errorMsg.value = ''

  try {
    const res = await fetch('https://fokgoxfxgyjq.sealoshzh.site/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.username,
        password: form.password,
      }),
    })

    const data = await res.json()

    if (!res.ok || !data.success) {
      errorMsg.value = data.message || '账号或密码错误'
      return
    }

    // 登录成功
    localStorage.setItem('auyologic_token', data.token)
    localStorage.setItem('auyologic_user', form.username)
    if (form.remember) {
      localStorage.setItem('auyologic_remember', 'true')
    }

    ElMessage.success('登录成功，正在跳转...')
    setTimeout(() => { router.replace('/') }, 300)
  } catch (err) {
    errorMsg.value = '网络错误，请检查后端服务是否启动'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* 页面容器 */
.login-page {
  position: fixed;
  inset: 0;
  display: flex;
  background: #0a0e1a;
  overflow: hidden;
}

/* 背景动效 */
.bg-grid {
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
}
.bg-glow {
  position: fixed;
  width: 600px;
  height: 600px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%);
  top: -200px;
  right: -100px;
  pointer-events: none;
}
.shape {
  position: fixed;
  border: 1px solid rgba(99,102,241,0.12);
  border-radius: 4px;
  pointer-events: none;
}
.shape-1 { width:60px; height:60px; top:15%; left:8%; animation: float 8s ease-in-out infinite; }
.shape-2 { width:40px; height:40px; top:70%; left:5%; border-radius:50%; animation: float 6s ease-in-out infinite reverse; }
.shape-3 { width:80px; height:80px; top:20%; right:6%; transform:rotate(45deg); animation: float 10s ease-in-out infinite; }
.shape-4 { width:30px; height:30px; bottom:20%; right:12%; border-radius:50%; animation: float 7s ease-in-out infinite reverse; }

@keyframes float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-12px) rotate(3deg); }
}

/* 左侧装饰区 */
.decorative-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 60px 80px;
  position: relative;
  z-index: 1;
}

.brand-mark {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 48px;
}
.brand-icon {
  width: 44px;
  height: 44px;
  background: rgba(99,102,241,0.25);
  border: 1px solid rgba(99,102,241,0.4);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.brand-name {
  font-size: 18px;
  font-weight: 600;
  color: rgba(255,255,255,0.9);
  letter-spacing: 0.5px;
}

.panel-title {
  font-size: 42px;
  font-weight: 700;
  color: white;
  line-height: 1.2;
  margin-bottom: 20px;
  letter-spacing: -1px;
}

.panel-desc {
  font-size: 16px;
  color: rgba(255,255,255,0.45);
  line-height: 1.7;
  max-width: 400px;
  margin-bottom: 48px;
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.feature-item {
  display: flex;
  align-items: center;
  gap: 12px;
  color: rgba(255,255,255,0.7);
  font-size: 15px;
}
.feature-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6366f1;
  box-shadow: 0 0 8px rgba(99,102,241,0.8);
  flex-shrink: 0;
}

.powered-badge {
  position: absolute;
  bottom: 40px;
  left: 80px;
  font-size: 12px;
  color: rgba(255,255,255,0.25);
  letter-spacing: 0.5px;
}

/* 右侧登录面板 */
.login-panel {
  width: 480px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  position: relative;
  z-index: 1;
}

.login-card {
  width: 100%;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 20px;
  padding: 48px 40px;
  backdrop-filter: blur(20px);
  opacity: 0;
  transform: translateX(30px);
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.login-card.card-entering {
  opacity: 1;
  transform: translateX(0);
}

.card-header {
  margin-bottom: 36px;
}
.card-header h2 {
  font-size: 26px;
  font-weight: 700;
  color: white;
  margin-bottom: 8px;
}
.card-header p {
  font-size: 14px;
  color: rgba(255,255,255,0.4);
}

/* 表单样式覆盖 */
:deep(.el-form-item__label) {
  color: rgba(255,255,255,0.6) !important;
  font-size: 13px;
  font-weight: 500;
  padding-bottom: 6px !important;
}
:deep(.el-input__wrapper) {
  background: rgba(255,255,255,0.06) !important;
  border: 1px solid rgba(255,255,255,0.1) !important;
  border-radius: 10px !important;
  box-shadow: none !important;
  padding: 4px 12px !important;
}
:deep(.el-input__wrapper:hover) {
  border-color: rgba(99,102,241,0.4) !important;
}
:deep(.el-input__wrapper.is-focus) {
  border-color: #6366f1 !important;
  box-shadow: 0 0 0 3px rgba(99,102,241,0.15) !important;
}
:deep(.el-input__inner) {
  color: rgba(255,255,255,0.9) !important;
  font-size: 15px;
}
:deep(.el-input__inner::placeholder) {
  color: rgba(255,255,255,0.25) !important;
}
:deep(.el-input__prefix .el-icon) {
  color: rgba(255,255,255,0.35) !important;
}
:deep(.el-checkbox__label) {
  color: rgba(255,255,255,0.5) !important;
  font-size: 13px;
}
:deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: #6366f1 !important;
  border-color: #6366f1 !important;
}
:deep(.el-form-item) {
  margin-bottom: 20px;
}

.form-options {
  margin-bottom: 24px;
}

.login-btn {
  width: 100%;
  height: 48px;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
  border: none !important;
  transition: all 0.3s;
  box-shadow: 0 4px 20px rgba(99,102,241,0.3);
}
.login-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(99,102,241,0.45);
}

.error-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #f87171;
  font-size: 13px;
  margin-top: 14px;
  padding: 10px 14px;
  background: rgba(248,113,113,0.1);
  border: 1px solid rgba(248,113,113,0.2);
  border-radius: 8px;
}

.login-footer {
  text-align: center;
  margin-top: 28px;
  font-size: 12px;
  color: rgba(255,255,255,0.2);
}

/* 响应式 */
@media (max-width: 900px) {
  .decorative-panel { display: none; }
  .login-panel { width: 100%; }
}
</style>
