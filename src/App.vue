<template>
  <div class="common-layout">
    <el-container>
      <!-- Header -->
      <el-header class="bg-white z-10 pl-4 pr-0 flex items-center justify-between" style="height: 50px;">
        <div class="flex items-center">
          <el-button text @click="isCollapse = !isCollapse" class="mr-3">
            <el-icon size="20"><Fold v-if="!isCollapse" /><Expand v-else /></el-icon>
          </el-button>
          <div class="flex items-center">
            <span class="text-xl font-bold text-primary">Auyo</span>
            <span class="text-xl font-bold text-gray-800">Logic</span>
            <span class="text-xl font-bold text-gray-800">奥呦</span>
          </div>
        </div>
        <div class="flex items-center">
          <el-link class="mr-4" :underline="false">帮助文档</el-link>
          <el-dropdown trigger="click" @command="handleDropdown">
            <div class="flex items-center cursor-pointer hover:bg-gray-100 px-3 py-2 rounded">
              <el-avatar :size="28" class="mr-2" style="background: #6366f1;">A</el-avatar>
              <span class="text-sm mr-1">{{ currentUser }}</span>
              <el-icon style="color: #999; font-size: 12px;"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <div class="px-4 py-3 border-b" style="min-width: 180px;">
                  <div class="text-sm font-medium text-gray-800">{{ currentUser }}</div>
                  <div class="text-xs text-gray-400 mt-0.5">admin</div>
                  <div class="text-xs text-green-500 mt-1">✓ 永久有效</div>
                </div>
                <el-dropdown-item command="logout" divided>
                  <el-icon class="mr-1"><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-container>
        <!-- Sidebar -->
        <el-aside class="bg-white border-r pt-2 flex flex-col transition-all" :style="{ width: isCollapse ? '64px' : '220px' }">
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
            <el-menu-item index="/geo-detection">
              <el-icon><Aim /></el-icon>
              <template #title>可见度检测</template>
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
            <el-menu-item index="/website-optimization">
              <el-icon><Monitor /></el-icon>
              <template #title>网站优化检测</template>
            </el-menu-item>
            <el-menu-item index="/geo-report">
              <el-icon><DataAnalysis /></el-icon>
              <template #title>改进方案报告</template>
            </el-menu-item>
          </el-menu>
        </el-aside>

        <!-- Main Content -->
        <el-main class="bg-gray-100" style="padding: 18px;">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Fold, Expand, House, Search, ChatDotRound, Collection, Picture, EditPen, DocumentAdd, Folder, OfficeBuilding, User, UserFilled, Promotion, List, Setting, Aim, Monitor, DataAnalysis, SwitchButton, ArrowDown } from '@element-plus/icons-vue'

const router = useRouter()
const isCollapse = ref(false)
const currentUser = computed(() => localStorage.getItem('auyologic_user') || 'admin')

const handleDropdown = (command) => {
  if (command === 'logout') {
    localStorage.removeItem('auyologic_token')
    localStorage.removeItem('auyologic_user')
    router.push('/login')
  }
}
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
