<template>
  <div class="common-layout">
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
          <div class="flex items-center cursor-pointer hover:bg-gray-100 px-3 py-2">
            <el-avatar :size="28" class="mr-2">U</el-avatar>
            <span class="text-sm hidden sm:inline">用户</span>
          </div>
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
        <el-aside class="bg-white border-r pt-2 flex flex-col transition-all hidden md:flex" :style="{ width: isCollapse ? '64px' : '220px' }">
          <el-menu
            :default-active="$route.path"
            class="el-menu-vertical"
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
            <el-menu-item index="/geo-health">
              <el-icon><TrendCharts /></el-icon>
              <template #title>品牌体检报告</template>
            </el-menu-item>
          </el-menu>
        </div>

        <!-- Main Content -->
        <el-main class="bg-gray-100" :style="{ padding: isMobile ? '12px' : '18px' }">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Fold, Expand, House, Search, ChatDotRound, Collection, Picture, EditPen, DocumentAdd, Folder, OfficeBuilding, User, UserFilled, Promotion, List, Setting, Aim, Monitor, DataAnalysis, Menu, Close, TrendCharts } from '@element-plus/icons-vue'

const isCollapse = ref(false)
const mobileMenuOpen = ref(false)

// 检测是否为移动端
const isMobile = computed(() => {
  if (typeof window !== 'undefined') {
    return window.innerWidth < 768
  }
  return false
})

onMounted(async () => {
  // 迁移旧 localStorage 数据到后端 API（仅执行一次）
  try {
    const { default: migrateLocalStorage } = await import('./utils/migrateLocalStorage.js')
    await migrateLocalStorage()
  } catch (e) {
    console.warn('[App] 迁移脚本加载失败:', e)
  }
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

.el-menu-item {
  height: 40px;
  line-height: 40px;
}
</style>
