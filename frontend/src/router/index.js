import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'
import Keywords from '../views/Keywords.vue'
import Questions from '../views/Questions.vue'
import Knowledge from '../views/Knowledge.vue'
import Images from '../views/Images.vue'
import Commands from '../views/Commands.vue'
import ContentCreate from '../views/ContentCreate.vue'
import Drafts from '../views/Drafts.vue'
import DraftEdit from '../views/DraftEdit.vue'
import MediaAccounts from '../views/MediaAccounts.vue'
import PublishTasks from '../views/PublishTasks.vue'
import PublishHistory from '../views/PublishHistory.vue'
import EnterpriseSettings from '../views/EnterpriseSettings.vue'
import GEODetection from '../views/GEODetection.vue'
import WebsiteOptimization from '../views/WebsiteOptimization.vue'
import GEOReport from '../views/GEOReport.vue'
import GEOReportV2 from '../views/GEOReportV2.vue'
import GEOHealthReport from '../views/GEOHealthReport.vue'
import SysDictManage from '../views/SysDictManage.vue'
import SentimentLexiconManage from '../views/SentimentLexiconManage.vue'
import AiProviderConnections from '../views/AiProviderConnections.vue'

/** 切页保留组件状态，避免 onMounted 重复拉库；控制台与带参编辑页不缓存 */
const KEEP_ALIVE = { keepAlive: true }

const routes = [
  // 每次回首页重新挂载，onMounted 拉最新统计
  { path: '/', name: 'dashboard', component: Dashboard, meta: { keepAlive: false } },

  // 关键词裂变
  { path: '/keywords', name: 'keywords', component: Keywords, meta: KEEP_ALIVE },
  { path: '/questions', name: 'questions', component: Questions, meta: KEEP_ALIVE },

  // 知识库
  { path: '/knowledge', name: 'knowledge', component: Knowledge, meta: KEEP_ALIVE },
  { path: '/images', name: 'images', component: Images, meta: KEEP_ALIVE },
  { path: '/sys-dict', name: 'sys-dict', component: SysDictManage, meta: KEEP_ALIVE },
  { path: '/sentiment-lexicon', name: 'sentiment-lexicon', component: SentimentLexiconManage, meta: KEEP_ALIVE },
  { path: '/ai-provider-connections', name: 'ai-provider-connections', component: AiProviderConnections, meta: KEEP_ALIVE },
  { path: '/enterprise-settings', name: 'enterprise-settings', component: EnterpriseSettings, meta: KEEP_ALIVE },

  // AI创作
  { path: '/commands', name: 'commands', component: Commands, meta: KEEP_ALIVE },
  { path: '/content-create', name: 'content-create', component: ContentCreate, meta: KEEP_ALIVE },
  { path: '/drafts', name: 'drafts', component: Drafts, meta: KEEP_ALIVE },
  { path: '/drafts/:id/edit', name: 'draft-edit', component: DraftEdit, props: true, meta: { keepAlive: false } },

  // 投放管理
  { path: '/publish-tasks', name: 'publish-tasks', component: PublishTasks, meta: KEEP_ALIVE },
  { path: '/publish-history', name: 'publish-history', component: PublishHistory, meta: KEEP_ALIVE },
  { path: '/media-accounts', name: 'media-accounts', component: MediaAccounts, meta: KEEP_ALIVE },

  // GEO检测
  { path: '/geo-detection', name: 'geo-detection', component: GEODetection, meta: KEEP_ALIVE },
  { path: '/website-optimization', name: 'website-optimization', component: WebsiteOptimization, meta: KEEP_ALIVE },
  { path: '/geo-report', name: 'geo-report', component: GEOReport, meta: KEEP_ALIVE },
  // { path: '/geo-report-v2', name: 'geo-report-v2', component: GEOReportV2, meta: KEEP_ALIVE },
  { path: '/geo-health', name: 'geo-health', component: GEOHealthReport, meta: KEEP_ALIVE },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
