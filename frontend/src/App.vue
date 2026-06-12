<template>
  <!-- 公开页（登录页）不渲染主布局 -->
  <router-view v-if="$route.meta?.public" />
  <div class="common-layout" v-else>
    <el-container>
      <!-- Header -->
      <el-header class="bg-white z-10 pl-4 pr-0 flex items-center justify-between" style="height: 50px;">
        <div class="flex items-center">
          <!-- 手机端汉堡菜单按钮 -->
          <el-button text @click="mobileMenuOpen = !mobileMenuOpen" class="mr-3 md:hidden">
            <el-icon size="20"><Menu /></el-icon>
          </el-button>
          <!-- 桌面端折叠按钮 -->
          <el-button text @click="isCollapse = !isCollapse" class="mr-3 hidden md:flex">
            <el-icon size="20"><component :is="isCollapse ? Expand : Fold" /></el-icon>
          </el-button>
          <div class="flex items-center">
            <span class="text-xl font-bold text-primary">Auyo</span>
            <span class="text-xl font-bold text-gray-800">Logic</span>
            <span class="text-xl font-bold text-gray-800">奥呦</span>
          </div>
        </div>
        <div class="flex items-center">
          <el-link class="mr-4 hidden sm:inline" underline="never">帮助文档</el-link>
          <el-dropdown trigger="click" @command="handleUserCommand">
            <div class="flex items-center cursor-pointer hover:bg-gray-100 px-3 py-2 h-full">
              <el-avatar :size="28" class="mr-2">{{ userInitial }}</el-avatar>
              <span class="text-sm hidden sm:inline">{{ displayName }}</span>
              <el-icon class="ml-1 text-gray-400"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>
                  <div class="text-xs text-gray-400">{{ userEmail || displayName }}</div>
                </el-dropdown-item>
                <el-dropdown-item command="logout" divided>
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-container>
        <!-- 手机端遮罩层 -->
        <div
          v-if="mobileMenuOpen"
          class="fixed inset-0 bg-black/50 z-40 md:hidden"
          @click="mobileMenuOpen = false"
        ></div>

        <!-- Sidebar - 桌面端 -->
        <el-aside
            class="bg-white border-r pt-2 flex flex-col transition-all hidden md:flex overflow-hidden"
            :style="{ width: isCollapse ? '64px' : '220px' }"
        >
          <el-menu
              :default-active="$route.path"
              class="el-menu-vertical flex-1 overflow-y-auto"
              :router="true"
              :collapse="isCollapse"
              :collapse-transition="false"
          >
            <!-- 首页 -->
            <el-menu-item index="/">
              <el-icon><House /></el-icon>
              <template #title>控制台</template>
            </el-menu-item>

            <!-- 知识库 -->
            <div v-if="!isCollapse" class="px-4 py-0.5 text-xs text-gray-400">知识库</div>
            <el-menu-item index="/enterprise-settings">
              <el-icon><Setting /></el-icon>
              <template #title>企业设置</template>
            </el-menu-item>
            <el-menu-item index="/knowledge">
              <el-icon><Collection /></el-icon>
              <template #title>企业知识库</template>
            </el-menu-item>
            <el-menu-item index="/images">
              <el-icon><Picture /></el-icon>
              <template #title>企业图库</template>
            </el-menu-item>
            <el-menu-item index="/sys-dict">
              <el-icon><Management /></el-icon>
              <template #title>字典管理</template>
            </el-menu-item>
            <el-menu-item index="/sentiment-lexicon">
              <el-icon><Comment /></el-icon>
              <template #title>情感词管理</template>
            </el-menu-item>
            <el-menu-item index="/ai-provider-connections">
              <el-icon><Connection /></el-icon>
              <template #title>大模型接入</template>
            </el-menu-item>

            <!-- 关键词裂变 -->
            <div v-if="!isCollapse" class="px-4 py-0.5 text-xs text-gray-400">关键词裂变</div>
            <el-menu-item index="/keywords">
              <el-icon><Search /></el-icon>
              <template #title>关键词管理</template>
            </el-menu-item>
            <el-menu-item index="/questions">
              <el-icon><ChatDotRound /></el-icon>
              <template #title>拓展问题</template>
            </el-menu-item>

            <!-- AI创作 -->
            <div v-if="!isCollapse" class="px-4 py-0.5 text-xs text-gray-400">AI创作</div>
            <el-menu-item index="/commands">
              <el-icon><EditPen /></el-icon>
              <template #title>创作指令</template>
            </el-menu-item>
            <el-menu-item index="/content-create">
              <el-icon><DocumentAdd /></el-icon>
              <template #title>内容生成</template>
            </el-menu-item>
            <el-menu-item index="/drafts">
              <el-icon><Folder /></el-icon>
              <template #title>草稿箱</template>
            </el-menu-item>

            <!-- 投放管理 -->
            <div v-if="!isCollapse" class="px-4 py-0.5 text-xs text-gray-400">投放管理</div>
            <el-menu-item index="/media-accounts">
              <el-icon><UserFilled /></el-icon>
              <template #title>自媒体账号</template>
            </el-menu-item>
            <el-menu-item index="/publish-tasks">
              <el-icon><Promotion /></el-icon>
              <template #title>投放任务</template>
            </el-menu-item>
            <el-menu-item index="/publish-history">
              <el-icon><List /></el-icon>
              <template #title>发布记录</template>
            </el-menu-item>

            <!-- GEO检测 -->
            <div v-if="!isCollapse" class="px-4 py-0.5 text-xs text-gray-400">GEO检测</div>
            <el-menu-item index="/geo-detection">
              <el-icon><Aim /></el-icon>
              <template #title>可见度检测</template>
            </el-menu-item>
            <el-menu-item index="/website-optimization">
              <el-icon><Monitor /></el-icon>
              <template #title>网站优化检测</template>
            </el-menu-item>
            <el-menu-item index="/geo-report">
              <el-icon><DataAnalysis /></el-icon>
              <template #title>改进方案报告</template>
            </el-menu-item>
<!--            <el-menu-item index="/geo-report-v2">-->
<!--              <el-icon><Histogram /></el-icon>-->
<!--              <template #title>改进方案报告2</template>-->
<!--            </el-menu-item>-->
            <el-menu-item index="/geo-health">
              <el-icon><TrendCharts /></el-icon>
              <template #title>品牌体检报告</template>
            </el-menu-item>
          </el-menu>
        </el-aside>

        <!-- 手机端弹出式侧边栏 -->
        <div
          class="fixed top-0 left-0 h-full bg-white z-50 transition-transform duration-300 md:hidden"
          :class="mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'"
          style="width: 280px;"
        >
          <div class="p-4 border-b flex items-center justify-between">
            <span class="font-bold text-lg">导航菜单</span>
            <el-button text @click="mobileMenuOpen = false">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
          <el-menu
            :default-active="$route.path"
            class="el-menu-vertical"
            :router="true"
            @select="mobileMenuOpen = false"
          >
            <el-menu-item index="/">
              <el-icon><House /></el-icon>
              <template #title>控制台</template>
            </el-menu-item>

            <div class="px-4 py-0.5 text-xs text-gray-400">知识库</div>
            <el-menu-item index="/enterprise-settings">
              <el-icon><Setting /></el-icon>
              <template #title>企业设置</template>
            </el-menu-item>
            <el-menu-item index="/knowledge">
              <el-icon><Collection /></el-icon>
              <template #title>企业知识库</template>
            </el-menu-item>
            <el-menu-item index="/images">
              <el-icon><Picture /></el-icon>
              <template #title>企业图库</template>
            </el-menu-item>
            <el-menu-item index="/sys-dict">
              <el-icon><Management /></el-icon>
              <template #title>字典管理</template>
            </el-menu-item>
            <el-menu-item index="/sentiment-lexicon">
              <el-icon><Comment /></el-icon>
              <template #title>情感词管理</template>
            </el-menu-item>
            <el-menu-item index="/ai-provider-connections">
              <el-icon><Connection /></el-icon>
              <template #title>大模型接入</template>
            </el-menu-item>

            <div class="px-4 py-0.5 text-xs text-gray-400">关键词裂变</div>
            <el-menu-item index="/keywords">
              <el-icon><Search /></el-icon>
              <template #title>关键词管理</template>
            </el-menu-item>
            <el-menu-item index="/questions">
              <el-icon><ChatDotRound /></el-icon>
              <template #title>拓展问题</template>
            </el-menu-item>
            <el-menu-item index="/geo-detection">
              <el-icon><Aim /></el-icon>
              <template #title>可见度检测</template>
            </el-menu-item>

            <div class="px-4 py-0.5 text-xs text-gray-400">AI创作</div>
            <el-menu-item index="/commands">
              <el-icon><EditPen /></el-icon>
              <template #title>创作指令</template>
            </el-menu-item>
            <el-menu-item index="/content-create">
              <el-icon><DocumentAdd /></el-icon>
              <template #title>内容生成</template>
            </el-menu-item>
            <el-menu-item index="/drafts">
              <el-icon><Folder /></el-icon>
              <template #title>草稿箱</template>
            </el-menu-item>

            <div class="px-4 py-0.5 text-xs text-gray-400">投放管理</div>
            <el-menu-item index="/media-accounts">
              <el-icon><UserFilled /></el-icon>
              <template #title>自媒体账号</template>
            </el-menu-item>
            <el-menu-item index="/publish-tasks">
              <el-icon><Promotion /></el-icon>
              <template #title>投放任务</template>
            </el-menu-item>
            <el-menu-item index="/publish-history">
              <el-icon><List /></el-icon>
              <template #title>发布记录</template>
            </el-menu-item>

            <div class="px-4 py-0.5 text-xs text-gray-400">GEO检测</div>
            <el-menu-item index="/geo-detection">
              <el-icon><Aim /></el-icon>
              <template #title>可见度检测</template>
            </el-menu-item>
            <el-menu-item index="/website-optimization">
              <el-icon><Monitor /></el-icon>
              <template #title>网站优化检测</template>
            </el-menu-item>
            <el-menu-item index="/geo-report">
              <el-icon><DataAnalysis /></el-icon>
              <template #title>改进方案报告</template>
            </el-menu-item>
<!--            <el-menu-item index="/geo-report-v2">-->
<!--              <el-icon><Histogram /></el-icon>-->
<!--              <template #title>改进方案报告2</template>-->
<!--            </el-menu-item>-->
            <el-menu-item index="/geo-health">
              <el-icon><TrendCharts /></el-icon>
              <template #title>品牌体检报告</template>
            </el-menu-item>
          </el-menu>
        </div>

        <!-- Main Content：单 keep-alive 避免双分支导致路由已变、视图仍滞留在上一页 -->
        <el-main class="bg-gray-100" :style="{ padding: isMobile ? '12px' : '18px' }">
          <router-view v-slot="{ Component, route }">
            <keep-alive :max="12" :exclude="keepAliveExclude">
              <component
                v-if="Component"
                :is="Component"
                :key="`${routeComponentKey(route)}_${authTick}`"
              />
            </keep-alive>
          </router-view>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Fold, Expand, House, Search, ChatDotRound, Collection, Picture, EditPen, DocumentAdd, Folder, OfficeBuilding, User, UserFilled, Promotion, List, Setting, Aim, Monitor, DataAnalysis, Histogram, Menu, Close, TrendCharts, Management, Comment, Connection, ArrowDown, SwitchButton } from '@element-plus/icons-vue'
import {
  getCurrentUser,
  getCurrentUserId,
  clearAuth,
  beginLogout,
  endLogout,
  AUTH_CHANGE_EVENT,
} from './utils/auth.js'

/** 与各页 defineOptions({ name }) 一致；不缓存则每次进控制台拉最新统计 */
const keepAliveExclude = ['Dashboard', 'DraftEdit']

/** 全站共享模块：不按用户 remount keep-alive（与大模型接入、字典管理一致） */
const GLOBAL_KEEP_ALIVE_NAMES = new Set(['sys-dict', 'ai-provider-connections'])

const routeComponentKey = (route) => {
  if (!route.meta?.keepAlive) return route.fullPath
  const name = String(route.name)
  if (GLOBAL_KEEP_ALIVE_NAMES.has(name)) return name
  const uid = getCurrentUserId() || 'guest'
  return `${name}_${uid}`
}

const isCollapse = ref(false)
const mobileMenuOpen = ref(false)

// ===== 当前用户信息与退出登录 =====
const router = useRouter()
const route = useRoute()
const authTick = ref(0)
const bumpAuth = () => { authTick.value++ }

const currentUser = computed(() => {
  authTick.value // 登录/退出时主动刷新
  route.fullPath // 路由切换时同步刷新
  return getCurrentUser()
})
const displayName = computed(() => currentUser.value?.username || '用户')
const userEmail = computed(() => currentUser.value?.email || '')
const userInitial = computed(() => (displayName.value[0] || 'U').toUpperCase())

const handleUserCommand = async (command) => {
  if (command !== 'logout') return
  try {
    await ElMessageBox.confirm('确定退出登录吗？', '退出登录', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  beginLogout()
  clearAuth()
  try {
    await router.replace('/login')
    ElMessage.success('已退出登录')
  } finally {
    endLogout()
  }
}

// 检测是否为移动端
const isMobile = computed(() => {
  if (typeof window !== 'undefined') {
    return window.innerWidth < 768
  }
  return false
})

const runStorageMigration = () => {
  import('./utils/migrateLocalStorage.js')
    .then((m) => m.default())
    .catch((e) => console.warn('[App] 迁移脚本加载失败:', e))
}

onMounted(() => {
  window.addEventListener(AUTH_CHANGE_EVENT, bumpAuth)
  window.addEventListener(AUTH_CHANGE_EVENT, runStorageMigration)
  // 全局 localStorage → admin；登录后同步后端
  import('./utils/migrateLegacyUserStorage.js')
    .then((m) => {
      m.migrateLegacyGlobalStorageToAdmin()
      return m.syncAdminScopedStorageToBackend()
    })
    .catch((e) => console.warn('[App] 用户缓存迁移失败:', e))
  runStorageMigration()
})

onUnmounted(() => {
  window.removeEventListener(AUTH_CHANGE_EVENT, bumpAuth)
  window.removeEventListener(AUTH_CHANGE_EVENT, runStorageMigration)
})
</script>

<style scoped>
.el-header {
  border-bottom: 1px solid #e5e7eb;
}

.el-aside {
  height: calc(100vh - 50px);
  overflow-x: hidden;
  overflow-y: auto;
  transition: width 0.3s;
}

.el-menu-vertical {
  border-right: none;
  overflow-y: auto;
  flex: 1;
}

.el-menu-vertical:not(.el-menu--collapse) {
  width: 220px;
}

.el-menu-item.is-active {
  background-color: #ecf5ff !important;
  color: #409eff !important;
}
.el-menu-vertical::-webkit-scrollbar {
  display: none;
}

.el-menu-vertical {
  scrollbar-width: none;
}
.el-menu-item {
  height: 40px;
  line-height: 40px;
}
</style>
