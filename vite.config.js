import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  root: 'frontend',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend/src'),
    },
  },
  server: {
    port: 3003,
    proxy: {
      // 开发环境：代理 /api 到后端
      '/api': {
        target: process.env.VITE_API_TARGET || 'https://auyologic.zeabur.app',
        changeOrigin: true,
        secure: true,
      },
      // 开发环境：代理 /uploads 静态文件
      '/uploads': {
        target: process.env.VITE_API_TARGET || 'https://auyologic.zeabur.app',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          elementPlus: ['element-plus'],
          echarts: ['echarts', 'vue-echarts'],
        },
      },
    },
  },
})
