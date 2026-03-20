# GEO 管理后台模板

基于 Vue 3 + Element Plus + Tailwind CSS 搭建的管理后台模板。

## 技术栈

- **Vue 3** - 渐进式前端框架
- **Element Plus** - Vue 3 UI 组件库
- **Tailwind CSS** - Utility-first CSS 框架
- **Vite** - 下一代前端构建工具
- **ECharts** - 数据可视化图表库

## 项目结构

```
admin-dashboard-template/
├── index.html          # 入口 HTML
├── package.json        # 依赖配置
├── vite.config.js      # Vite 配置
├── tailwind.config.js  # Tailwind 配置
├── postcss.config.js   # PostCSS 配置
└── src/
    ├── main.js         # 入口 JS
    ├── style.css       # 全局样式
    └── App.vue         # 主组件
```

## 快速开始

```bash
# 1. 进入项目目录
cd D:\Openclaw\admin-dashboard-template

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

访问 http://localhost:3002

## 页面功能

- [x] 左侧导航菜单（支持折叠）
- [x] 顶部 Header
- [x] 面包屑导航
- [x] Tabs 切换
- [x] 表格组件
- [x] 下拉选择
- [x] 搜索输入
- [x] 按钮组
- [x] 积分进度条

## 学习要点

1. **Vue 3 Composition API** - `<script setup>` 语法
2. **Element Plus 组件** - Menu, Table, Tabs, Button 等
3. **Tailwind CSS** - 实用优先的样式类
4. **响应式布局** - Flexbox 布局
5. **组件化开发** - 单文件组件

## 扩展建议

- 添加路由 vue-router
- 添加状态管理 Pinia
- 添加图表展示
- 添加表单验证
- 集成后端 API
