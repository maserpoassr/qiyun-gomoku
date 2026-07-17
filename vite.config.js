import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    // 关键：本地开发开启 COOP & COEP，否则多线程 WASM 报错
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    outDir: 'dist', // 打包输出目录，CF Pages 需指向此目录
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        // 确保第三方库和主逻辑分离，优化首屏
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
});
