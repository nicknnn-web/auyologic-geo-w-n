import { ElMessage } from 'element-plus'

/**
 * 统一错误处理
 * @param {Error} error - 错误对象
 * @param {string} defaultMessage - 默认错误消息
 * @param {boolean} showMessage - 是否显示错误提示
 */
export const handleError = (error, defaultMessage = '操作失败', showMessage = true) => {
  console.error('Error:', error)

  // 提取错误信息
  let message = defaultMessage

  if (error) {
    if (typeof error === 'string') {
      message = error
    } else if (error.message) {
      message = error.message
    } else if (error.response?.data?.error) {
      message = error.response.data.error
    } else if (error.response?.data?.message) {
      message = error.response.data.message
    }
  }

  // 显示友好的错误提示
  if (showMessage) {
    ElMessage.error(message)
  }

  return message
}

/**
 * API 错误处理
 * @param {Response} response - Fetch 响应对象
 * @param {string} defaultMessage - 默认错误消息
 */
export const handleApiError = async (response, defaultMessage = '请求失败') => {
  try {
    const data = await response.json()
    const message = data.error || data.message || defaultMessage
    ElMessage.error(message)
    return message
  } catch {
    ElMessage.error(defaultMessage)
    return defaultMessage
  }
}

/**
 * 异步操作包装器
 * 自动处理错误和加载状态
 * @param {Function} fn - 异步函数
 * @param {Object} options - 选项
 * @returns {Promise}
 */
export const withErrorHandler = async (fn, options = {}) => {
  const {
    loading = null,
    onSuccess = null,
    onError = null,
    errorMessage = '操作失败'
  } = options

  try {
    // 设置加载状态
    if (loading && typeof loading.value === 'boolean') {
      loading.value = true
    }

    // 执行操作
    const result = await fn()

    // 成功回调
    if (onSuccess) {
      onSuccess(result)
    }

    return result
  } catch (error) {
    const message = handleError(error, errorMessage)

    // 错误回调
    if (onError) {
      onError(message, error)
    }

    throw error
  } finally {
    // 清除加载状态
    if (loading && typeof loading.value === 'boolean') {
      loading.value = false
    }
  }
}
