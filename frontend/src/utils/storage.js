// 数据存储工具 - 使用 localStorage

const STORAGE_KEY = 'auyologic_data'

// 初始化数据
const defaultData = {
  keywords: [],
  questions: [],
  knowledge: [],
  images: [],
  commands: [],
  drafts: [],
  mediaOfficial: [],
  mediaSocial: [],
  publishTasks: [],
  publishHistory: [],
  'geo-custom-keywords': []
}

// 获取数据
export const getData = () => {
  const data = localStorage.getItem(STORAGE_KEY)
  if (data) {
    return JSON.parse(data)
  }
  // 初始化默认数据
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData))
  return defaultData
}

// 保存数据
export const saveData = (data) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

// 获取某类数据
export const getList = (type) => {
  const data = getData()
  return data[type] || []
}

// 保存某类数据
export const saveList = (type, list) => {
  const data = getData()
  data[type] = list
  saveData(data)
}

// 生成ID
export const generateId = (type) => {
  const list = getList(type)
  if (list.length === 0) return 1
  return Math.max(...list.map(i => i.id)) + 1
}

// 添加记录
export const addItem = (type, item) => {
  const list = getList(type)
  list.push({
    id: generateId(type),
    ...item,
    createdAt: new Date().toLocaleString('zh-CN')
  })
  saveList(type, list)
  return list
}

// 删除记录
export const deleteItem = (type, id) => {
  const list = getList(type)
  const newList = list.filter(i => i.id !== id)
  // 不重新编号，保持原有 ID
  saveList(type, newList)
  return newList
}

// 更新记录
export const updateItem = (type, id, updates) => {
  const list = getList(type)
  const index = list.findIndex(i => i.id === id)
  if (index > -1) {
    list[index] = { ...list[index], ...updates }
    saveList(type, list)
  }
  return list
}
