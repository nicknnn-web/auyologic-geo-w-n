<template>
  <div class="login-page">
    <!-- 品牌区 -->
    <div class="brand-area" :class="{ entered: entering }">
      <div class="brand-logo">G</div>
      <div class="brand-text">
        <div class="brand-title">GEO</div>
        <div class="brand-sub">GROWTH ENGINE OPTIMIZATION</div>
      </div>
    </div>

    <!-- 登录卡片 -->
    <div class="login-card" :class="{ entered: entering }">
      <!-- Tab 切换 -->
      <div class="tab-row">
        <span class="tab-item" :class="{ active: mode === 'login' }" @click="switchMode('login')">登录</span>
        <span class="tab-divider">/</span>
        <span class="tab-item" :class="{ active: mode === 'register' }" @click="switchMode('register')">注册</span>
      </div>

      <!-- 邮箱 -->
      <div class="field">
        <label class="field-label">邮箱</label>
        <input
          v-model.trim="form.email"
          type="email"
          class="field-input"
          placeholder="name@company.com"
          autocomplete="email"
          @keyup.enter="handleSubmit"
        />
      </div>

      <!-- 用户名（仅注册，选填） -->
      <div v-if="mode === 'register'" class="field">
        <div class="field-label-row">
          <label class="field-label">用户名</label>
          <span class="field-hint">选填，不填则使用邮箱</span>
        </div>
        <input
          v-model.trim="form.username"
          type="text"
          class="field-input"
          placeholder="自定义用户名"
          autocomplete="username"
          maxlength="200"
          @keyup.enter="handleSubmit"
        />
      </div>

      <!-- 密码 -->
      <div class="field">
        <div class="field-label-row">
          <label class="field-label">密码</label>
          <span v-if="mode === 'register'" class="field-hint">至少 8 位</span>
        </div>
        <input
          v-model="form.password"
          type="password"
          class="field-input"
          placeholder="········"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          @keyup.enter="handleSubmit"
        />
      </div>

      <!-- 滑块验证码 -->
      <div class="field">
        <label class="field-label">安全验证</label>
        <div
          ref="sliderTrackRef"
          class="slider-track"
          :class="{ verified: sliderVerified }"
        >
          <div class="slider-fill" :style="{ width: sliderX + 40 + 'px' }"></div>
          <div
            class="slider-handle"
            :style="{ left: sliderX + 'px' }"
            @pointerdown="onSliderDown"
          >
            <span v-if="sliderVerified" class="handle-icon ok">✓</span>
            <span v-else class="handle-icon">»</span>
          </div>
          <span class="slider-text">{{ sliderVerified ? '验证通过' : '按住滑块，拖动到最右侧' }}</span>
        </div>
      </div>

      <!-- 错误提示 -->
      <div v-if="errorMsg" class="error-tip">{{ errorMsg }}</div>

      <!-- 提交按钮 -->
      <button class="submit-btn" :disabled="loading" @click="handleSubmit">
        {{ loading ? (mode === 'login' ? '登录中...' : '注册中...') : (mode === 'login' ? '登录' : '注册') }}
        <span class="btn-arrow">→</span>
      </button>

      <!-- 条款 -->
      <div class="terms">
        继续即表示同意 <a href="javascript:void(0)">服务条款</a> 与 <a href="javascript:void(0)">隐私政策</a>
      </div>
    </div>

    <div class="copyright">© 2026 GEO</div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { saveAuth, isLoggedIn } from '../utils/auth.js'

defineOptions({ name: 'Login' })

const router = useRouter()
const route = useRoute()

const mode = ref('login') // 'login' | 'register'
const loading = ref(false)
const errorMsg = ref('')
const entering = ref(false)

const form = reactive({
  email: '',
  username: '',
  password: '',
})

// ===== 滑块验证码 =====
const sliderTrackRef = ref(null)
const sliderX = ref(0)
const sliderVerified = ref(false)
let dragging = false
let startClientX = 0
let startX = 0

const maxSliderX = () => {
  const track = sliderTrackRef.value
  if (!track) return 0
  return track.clientWidth - 40 - 4 // 滑块宽 40 + 边距
}

const onSliderDown = (e) => {
  if (sliderVerified.value) return
  dragging = true
  startClientX = e.clientX
  startX = sliderX.value
  window.addEventListener('pointermove', onSliderMove)
  window.addEventListener('pointerup', onSliderUp)
}

const onSliderMove = (e) => {
  if (!dragging) return
  const max = maxSliderX()
  sliderX.value = Math.min(max, Math.max(0, startX + e.clientX - startClientX))
}

const onSliderUp = () => {
  if (!dragging) return
  dragging = false
  window.removeEventListener('pointermove', onSliderMove)
  window.removeEventListener('pointerup', onSliderUp)
  const max = maxSliderX()
  if (sliderX.value >= max - 2) {
    sliderX.value = max
    sliderVerified.value = true
  } else {
    // 未拖到底，回弹
    sliderX.value = 0
  }
}

const resetSlider = () => {
  sliderVerified.value = false
  sliderX.value = 0
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onSliderMove)
  window.removeEventListener('pointerup', onSliderUp)
})

// ===== 切换登录/注册 =====
const switchMode = (m) => {
  if (mode.value === m) return
  mode.value = m
  errorMsg.value = ''
  resetSlider()
}

onMounted(() => {
  if (isLoggedIn()) {
    router.replace('/')
    return
  }
  const savedEmail = localStorage.getItem('auyologic_last_email')
  if (savedEmail) form.email = savedEmail
  setTimeout(() => { entering.value = true }, 50)
})

// ===== 提交 =====
const API_BASE = window.VITE_API_URL || window.location.origin

const validate = () => {
  if (!form.email) return '请输入邮箱'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) && mode.value === 'register') return '邮箱格式不正确'
  if (!form.password) return '请输入密码'
  if (mode.value === 'register' && form.password.length < 8) return '密码至少 8 位'
  if (!sliderVerified.value) return '请先完成滑块验证'
  return ''
}

const handleSubmit = async () => {
  const err = validate()
  if (err) {
    errorMsg.value = err
    return
  }
  errorMsg.value = ''
  loading.value = true

  try {
    const url = `${API_BASE}/api/auth/${mode.value === 'login' ? 'login' : 'register'}`
    const payload = mode.value === 'login'
      ? { email: form.email, password: form.password }
      : {
          email: form.email,
          password: form.password,
          ...(form.username ? { username: form.username } : {}),
        }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok || !data.success) {
      // 注册时邮箱已存在 → 提示并切回登录
      if (mode.value === 'register' && (res.status === 409 || data.exists)) {
        ElMessage.info(data.error || '该邮箱已注册，可直接登录')
        switchMode('login')
        return
      }
      errorMsg.value = data.error || (mode.value === 'login' ? '登录失败' : '注册失败')
      resetSlider()
      return
    }

    saveAuth({ token: data.token, user: data.user, remember: true })
    localStorage.setItem('auyologic_last_email', form.email)
    ElMessage.success(mode.value === 'login' ? '登录成功，正在跳转...' : '注册成功，正在跳转...')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    setTimeout(() => { router.replace(redirect) }, 300)
  } catch {
    errorMsg.value = '网络错误，请检查后端服务是否启动'
    resetSlider()
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #eef4fa 0%, #e8f0f8 50%, #edf3f9 100%);
  overflow: auto;
}

/* 品牌区 */
.brand-area {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;
  opacity: 0;
  transform: translateY(-8px);
  transition: all 0.5s ease;
}
.brand-area.entered { opacity: 1; transform: translateY(0); }
.brand-logo {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: #1677b3;
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.brand-title {
  font-size: 18px;
  font-weight: 800;
  color: #1f2937;
  letter-spacing: 1px;
  line-height: 1.2;
}
.brand-sub {
  font-size: 11px;
  color: #94a3b8;
  letter-spacing: 2px;
}

/* 卡片 */
.login-card {
  width: 320px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(30, 64, 120, 0.08);
  padding: 32px 36px 28px;
  opacity: 0;
  transform: translateY(10px);
  transition: all 0.5s ease 0.1s;
}
.login-card.entered { opacity: 1; transform: translateY(0); }

/* Tab */
.tab-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 28px;
}
.tab-item {
  font-size: 15px;
  color: #9ca3af;
  cursor: pointer;
  padding-bottom: 4px;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}
.tab-item.active {
  color: #1f2937;
  font-weight: 700;
  border-bottom-color: #1677b3;
}
.tab-divider { color: #d1d5db; font-size: 14px; }

/* 表单字段 */
.field { margin-bottom: 22px; }
.field-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.field-label {
  display: block;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
}
.field-hint { font-size: 12px; color: #9ca3af; }
.field-input {
  width: 100%;
  border: none;
  border-bottom: 1px solid #d8e1ea;
  padding: 6px 2px 8px;
  font-size: 14px;
  color: #1f2937;
  background: transparent;
  outline: none;
  transition: border-color 0.2s;
}
.field-input::placeholder { color: #c3cdd9; }
.field-input:focus { border-bottom-color: #1677b3; }

/* 滑块验证码 */
.slider-track {
  position: relative;
  height: 38px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  user-select: none;
}
.slider-track.verified {
  border-color: #34c98e;
  background: #effaf5;
}
.slider-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: rgba(22, 119, 179, 0.12);
  pointer-events: none;
  transition: background 0.2s;
}
.slider-track.verified .slider-fill { background: rgba(52, 201, 142, 0.15); }
.slider-handle {
  position: absolute;
  top: 2px;
  width: 40px;
  height: 32px;
  background: #fff;
  border: 1px solid #d8e1ea;
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  touch-action: none;
  z-index: 2;
}
.slider-handle:active { cursor: grabbing; }
.handle-icon { color: #1677b3; font-size: 16px; font-weight: 700; }
.handle-icon.ok { color: #34c98e; }
.slider-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #9ca3af;
  pointer-events: none;
}
.slider-track.verified .slider-text { color: #34c98e; }

/* 错误提示 */
.error-tip {
  font-size: 12px;
  color: #ef4444;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 16px;
}

/* 按钮 */
.submit-btn {
  width: 100%;
  height: 42px;
  background: #1677b3;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
}
.submit-btn:hover:not(:disabled) { background: #126499; }
.submit-btn:disabled { opacity: 0.7; cursor: not-allowed; }
.btn-arrow { font-size: 16px; }

/* 条款 */
.terms {
  text-align: center;
  margin-top: 20px;
  font-size: 12px;
  color: #9ca3af;
}
.terms a { color: #6b7280; text-decoration: underline; }

.copyright {
  margin-top: 32px;
  font-size: 12px;
  color: #b6c2cf;
}

@media (max-width: 480px) {
  .login-card { width: calc(100vw - 48px); padding: 28px 24px; }
}
</style>
