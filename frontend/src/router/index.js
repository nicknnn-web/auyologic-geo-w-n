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
import GEOHealthReport from '../views/GEOHealthReport.vue'
import SysDictManage from '../views/SysDictManage.vue'
import SentimentLexiconManage from '../views/SentimentLexiconManage.vue'
import AiProviderConnections from '../views/AiProviderConnections.vue'

const routes = [
  { path: '/', name: 'dashboard', component: Dashboard },
  
  // 关键词裂变
  { path: '/keywords', name: 'keywords', component: Keywords },
  { path: '/questions', name: 'questions', component: Questions },
  
  // 知识库
  { path: '/knowledge', name: 'knowledge', component: Knowledge },
  { path: '/images', name: 'images', component: Images },
  { path: '/sys-dict', name: 'sys-dict', component: SysDictManage },
  { path: '/sentiment-lexicon', name: 'sentiment-lexicon', component: SentimentLexiconManage },
  { path: '/ai-provider-connections', name: 'ai-provider-connections', component: AiProviderConnections },
  { path: '/enterprise-settings', name: 'enterprise-settings', component: EnterpriseSettings },
  
  // AI创作
  { path: '/commands', name: 'commands', component: Commands },
  { path: '/content-create', name: 'content-create', component: ContentCreate },
  { path: '/drafts', name: 'drafts', component: Drafts },
  { path: '/drafts/:id/edit', name: 'draft-edit', component: DraftEdit, props: true },
  
  // 投放管理
  { path: '/publish-tasks', name: 'publish-tasks', component: PublishTasks },
  { path: '/publish-history', name: 'publish-history', component: PublishHistory },
  { path: '/media-accounts', name: 'media-accounts', component: MediaAccounts },
  
  // GEO检测
  { path: '/geo-detection', name: 'geo-detection', component: GEODetection },
  { path: '/website-optimization', name: 'website-optimization', component: WebsiteOptimization },
  { path: '/geo-report', name: 'geo-report', component: GEOReport },
  { path: '/geo-health', name: 'geo-health', component: GEOHealthReport },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
