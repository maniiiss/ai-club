import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// Tauri 桌面版 Vite 配置。
// 与 frontend-public 保持同一套 Tailwind v4 + React 19 栈，
// 但针对 Tauri 做了端口固定（1420）、环境变量前缀（TAURI_）与 HMR 调整。
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  // CanvasKit 自带 Emscripten loader 和独立 WASM 文件，不参与 Vite 依赖预构建，避免开发服务命中过期的 .vite/deps 模块。
  optimizeDeps: {
    exclude: ['canvaskit-wasm'],
  },
  // Tauri 要求固定端口且不能被占用，strictPort 保证端口不可用时报错而非顺延。
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: '127.0.0.1',
    hmr: process.env.DISABLE_HMR === 'true' ? false : { protocol: 'ws', host: '127.0.0.1', port: 1421 },
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
  // 仅以 TAURI_ 开头的环境变量会暴露给前端，避免泄漏敏感配置。
  envPrefix: ['TAURI_'],
  build: {
    // Tauri 生产构建产物指向 src-tauri 的前端资源目录。
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-markdown': ['react-markdown', 'remark-gfm'],
          'vendor-core': ['react', 'react-dom', 'zustand'],
        },
      },
    },
  },
}));
