import { ref, onMounted, onUnmounted, onActivated } from 'vue'
import { fetchDictList, SYS_DICT_CHANGE_EVENT } from '../utils/sysDict.js'
import { isLoggedIn } from '../utils/auth.js'

/**
 * 系统字典列表：进入页 / 切回 keep-alive 页 / 字典管理保存后自动刷新
 * @param {string} dictType 如 publish_platform、keyword_type
 */
export function useSysDictList(dictType) {
  const rows = ref([])
  const loading = ref(false)

  const reload = async () => {
    if (!dictType || !isLoggedIn()) {
      rows.value = []
      return
    }
    loading.value = true
    try {
      rows.value = await fetchDictList(dictType)
    } finally {
      loading.value = false
    }
  }

  const onDictChange = (e) => {
    const changed = e?.detail?.dictType
    if (changed && changed !== dictType) return
    void reload()
  }

  onMounted(() => {
    void reload()
    window.addEventListener(SYS_DICT_CHANGE_EVENT, onDictChange)
  })

  onActivated(() => {
    void reload()
  })

  onUnmounted(() => {
    window.removeEventListener(SYS_DICT_CHANGE_EVENT, onDictChange)
  })

  return { rows, loading, reload }
}
